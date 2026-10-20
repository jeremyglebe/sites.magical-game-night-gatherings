import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createArchive } from './archive.mjs';
import { serveAvatar } from './avatars.mjs';

// Reads recordings only. It does not acquire game locks, launch players, or
// restore/resume a coordinator, so a live match may keep running elsewhere.
export async function startReviewServer({ directory = '.playtest', port = 5181, liveTableUrl = 'http://127.0.0.1:5180/' } = {}) {
  const archive = createArchive({ directory, liveTableUrl });
  const json = (response, status, value) => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(JSON.stringify(value));
  };
  const server = createServer((request, response) => {
    try {
      const expectedPort = server.address().port;
      const origins = [`http://127.0.0.1:${expectedPort}`, `http://localhost:${expectedPort}`];
      if (![`127.0.0.1:${expectedPort}`, `localhost:${expectedPort}`].includes(request.headers.host)
        || (request.headers.origin && !origins.includes(request.headers.origin))) {
        json(response, 403, { error: 'Local application requests only.' }); return;
      }
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (request.method === 'GET' && url.pathname === '/') {
        response.writeHead(302, { Location: '/games', 'Cache-Control': 'no-store' }); response.end(); return;
      }
      if (request.method === 'GET' && serveAvatar(url.pathname, response)) return;
      if (archive.handle(request, response, url)) return;
      json(response, 404, { error: 'Unknown endpoint.' });
    } catch { json(response, 500, { error: 'Saved games could not be read.' }); }
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', ok); });
  return { server, url: `http://127.0.0.1:${server.address().port}`, archive,
    close: () => new Promise((ok, fail) => {
      server.close(error => error ? fail(error) : ok());
      server.closeAllConnections();
    }),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    directory: { type: 'string', default: '.playtest' }, port: { type: 'string', default: '5181' },
    'live-table': { type: 'string', default: 'http://127.0.0.1:5180/' },
  } });
  try {
    const app = await startReviewServer({ directory: values.directory, port: Number(values.port), liveTableUrl: values['live-table'] });
    console.log(`Saved games: ${app.url}/games`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
