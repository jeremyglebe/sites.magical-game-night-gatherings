import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveClient } from './client-assets.mjs';

const index = '<!doctype html><main id="app">Vue entry</main>';

async function fixture(t, options = {}) {
  const temporary = mkdtempSync(join(tmpdir(), 'tabletop-client-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const directory = join(temporary, 'dist');
  if (!options.missingBuild) {
    mkdirSync(join(directory, 'assets'), { recursive: true });
    writeFileSync(join(directory, 'index.html'), index);
    for (const extension of ['js', 'css', 'svg', 'png', 'woff2']) {
      writeFileSync(join(directory, 'assets', `client-C9a_8z.${extension}`), `fixture-${extension}`);
    }
  }
  // These files deliberately exist outside the public build directory.
  writeFileSync(join(temporary, 'secret.js'), 'private session secret');
  writeFileSync(join(temporary, 'session.json'), '{"credentials":"private"}');
  const server = createServer((incoming, response) => {
    const url = new URL(incoming.url, 'http://localhost');
    if (serveClient(incoming, response, url, { directory, ...options })) return;
    if (incoming.method === 'GET' && url.pathname === '/api/table') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ revision: 3, players: [{ id: 'p1' }] }));
      return;
    }
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Not a client route.');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, server };
}

// Use the HTTP path unchanged: fetch normalizes dot segments before sending.
async function rawGet(server, path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }));
      response.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

test('Vue routes serve one uncached entry document with browser security headers', async t => {
  const { url } = await fixture(t);
  for (const path of ['/', '/games', '/games/', '/games/match_1-ab', '/games/match_1-ab/?tab=decks']) {
    const response = await fetch(url + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(response.headers.get('content-security-policy'), /img-src 'self' https:\/\/cards\.scryfall\.io data:/);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(await response.text(), index);
  }
  const head = await fetch(url + '/games/match_1-ab', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('cache-control'), 'no-store');
  assert.equal(await head.text(), '');
});

test('compiled assets have the expected types and immutable cache while missing files do not', async t => {
  const { url } = await fixture(t);
  const types = { js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', woff2: 'font/woff2' };
  for (const [extension, type] of Object.entries(types)) {
    const response = await fetch(url + `/assets/client-C9a_8z.${extension}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), type);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await response.text(), `fixture-${extension}`);
  }
  const head = await fetch(url + '/assets/client-C9a_8z.js', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-type'), types.js);
  assert.equal(await head.text(), '');
  const missing = await fetch(url + '/assets/missing.js');
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('cache-control'), 'no-store');
  assert.equal(await missing.text(), 'Asset unavailable.');
});

test('unrecognized paths cannot turn the client handler into a source or recording file server', async t => {
  const { server } = await fixture(t);
  for (const path of [
    '/assets/../secret.js', '/assets/%2e%2e/secret.js', '/assets/%2e%2e%2fsecret.js',
    '/assets/..%5csecret.js', '/assets//secret.js', '/assets/nested/secret.js',
    '/assets/client-C9a_8z.js.map', '/assets/client-C9a_8z.js%00',
    '/session.json', '/.playtest/session.json', '/server/app.mjs', '/client/src/main.js',
    '/games/match/extra', '/games/' + 'x'.repeat(121), '/unrelated',
  ]) {
    const response = await rawGet(server, path);
    assert.equal(response.status, 404, path);
    assert.doesNotMatch(response.body, /private|Vue entry/, path);
  }
});

test('only GET and HEAD serve UI, and a read-only reviewer can leave root to its redirect', async t => {
  const { url } = await fixture(t, { root: false, liveTableUrl: 'http://127.0.0.1:5190/' });
  assert.equal((await fetch(url + '/')).status, 404);
  assert.equal((await fetch(url + '/games')).status, 200);
  for (const path of ['/games', '/games/test', '/assets/client-C9a_8z.js', '/api/ui']) {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      assert.equal((await fetch(url + path, { method })).status, 405, `${method} ${path}`);
    }
  }
  const config = await fetch(url + '/api/ui');
  assert.equal(config.status, 200);
  assert.equal(config.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await config.json(), { liveTableUrl: 'http://127.0.0.1:5190/' });
  const head = await fetch(url + '/api/ui', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('missing Vue build gives a useful browser error without disabling headless API operation', async t => {
  const { url } = await fixture(t, { missingBuild: true });
  // Creating the service and using non-UI endpoints must never read index.html.
  const table = await fetch(url + '/api/table');
  assert.equal(table.status, 200);
  assert.deepEqual(await table.json(), { revision: 3, players: [{ id: 'p1' }] });
  assert.deepEqual(await (await fetch(url + '/api/ui')).json(), { liveTableUrl: '/' });
  for (const path of ['/', '/games', '/games/headless-match']) {
    const response = await fetch(url + path);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(await response.text(), /npm run tabletop:build/);
  }
  assert.equal((await fetch(url + '/assets/client-C9a_8z.js')).status, 404);
  const head = await fetch(url + '/', { method: 'HEAD' });
  assert.equal(head.status, 503);
  assert.equal(await head.text(), '');
  assert.equal((await fetch(url + '/api/table')).status, 200);
});
