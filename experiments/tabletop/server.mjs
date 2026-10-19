import { createServer } from 'node:http';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { applyActions, cardDetails, createTable, observe } from './table.mjs';
import { referenceLines } from './references.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, 'index.html'));
const json = (response, status, value) => {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
};

export async function startTable({ session, setup, port = 5180 }) {
  session = resolve(session);
  mkdirSync(dirname(session), { recursive: true });
  const lock = session + '.lock';
  const fd = openSync(lock, 'wx', 0o600);
  closeSync(fd);
  let saved;
  function persist(next) {
    const temporary = session + '.tmp';
    writeFileSync(temporary, JSON.stringify(next), { mode: 0o600 });
    renameSync(temporary, session);
    saved = next;
  }
  try {
    if (existsSync(session)) saved = JSON.parse(readFileSync(session, 'utf8'));
    else {
      if (!setup) throw new Error('A new session needs --setup with a deck configuration');
      const config = typeof setup === 'string' ? JSON.parse(readFileSync(setup, 'utf8')) : setup;
      const state = createTable(config);
      persist({ state, credentials: Object.fromEntries(state.players.map(p => [p.id, randomUUID()])) });
    }
    if (saved.state.version !== 1) throw new Error('Unsupported session version');
  } catch (error) { unlinkSync(lock); throw error; }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(html);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/table') {
        json(response, 200, observe(saved.state));
        return;
      }
      const token = request.headers.authorization?.replace(/^Bearer /, '');
      const actor = Object.entries(saved.credentials).find(([, value]) => value === token)?.[0];
      if (!actor) { json(response, 401, { error: 'Player connection required' }); return; }
      if (request.method === 'GET' && url.pathname === '/api/observe') {
        json(response, 200, observe(saved.state, actor));
      } else if (request.method === 'GET' && url.pathname === '/api/card') {
        json(response, 200, cardDetails(saved.state, actor, url.searchParams.get('id')));
      } else if (request.method === 'GET' && url.pathname === '/api/references') {
        const allowed = saved.state.references;
        if (!Array.isArray(allowed)) throw new Error('Invalid reference list');
        const path = url.searchParams.get('path');
        if (!path) { json(response, 200, { paths: allowed }); return; }
        if (!allowed.includes(path) || !/^(formats|rules|boxed-sets)\/.*\.md$/.test(path)) throw new Error('Reference not configured');
        const lines = referenceLines(path);
        const query = url.searchParams.get('query');
        if (query) {
          json(response, 200, {
            path, total_lines: lines.length,
            matches: lines.map((line, i) => ({ line: i + 1, text: line }))
              .filter(line => line.text.toLowerCase().includes(query.toLowerCase())).slice(0, 30),
          });
        } else {
          const start = Math.max(1, Number(url.searchParams.get('start') || 1));
          const count = Math.min(120, Math.max(1, Number(url.searchParams.get('count') || 80)));
          if (!Number.isInteger(start) || !Number.isInteger(count)) throw new Error('Invalid line range');
          json(response, 200, { path, start, total_lines: lines.length, text: lines.slice(start - 1, start - 1 + count).join('\n') });
        }
      } else if (request.method === 'POST' && url.pathname === '/api/act') {
        let body = '';
        for await (const chunk of request) {
          body += chunk;
          if (Buffer.byteLength(body) > 200000) { json(response, 413, { error: 'Request too large' }); return; }
        }
        const args = JSON.parse(body);
        const state = applyActions(saved.state, actor, args.revision, args.actions, args.reason);
        persist({ ...saved, state });
        json(response, 200, observe(state, actor));
      } else json(response, 404, { error: 'Unknown endpoint' });
    } catch (error) {
      json(response, 400, { error: error.message });
    }
  });
  server.on('close', () => { if (existsSync(lock)) unlinkSync(lock); });
  try {
    await new Promise((ok, fail) => {
      server.once('error', fail);
      server.listen(port, '127.0.0.1', ok);
    });
  } catch (error) { if (existsSync(lock)) unlinkSync(lock); throw error; }
  return { server, url: 'http://127.0.0.1:' + server.address().port };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    session: { type: 'string', default: '.playtest/table.json' },
    setup: { type: 'string', default: fileURLToPath(new URL('./precons.json', import.meta.url)) }, port: { type: 'string', default: '5180' },
  } });
  try {
    const { server, url } = await startTable({ ...values, port: Number(values.port) });
    console.log('Spectator: ' + url);
    console.log('Session: ' + resolve(values.session));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
