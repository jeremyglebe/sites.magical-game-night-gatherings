import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApp } from './app.mjs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const setup = (count, ai = true) => ({
  title: 'Integration match', shuffle: false,
  players: Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`, name: `Seat ${i + 1}`, ai,
    deck: [{ name: `Private card ${i + 1}`, count: 3 }],
  })),
});
const tick = () => new Promise(resolve => setImmediate(resolve));

test('headless match, separate player histories, quiet acknowledgments and recovery', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'game-night-app-'));
  let app;
  const requests = [];
  const factory = () => async request => {
    requests.push(request);
    request.onSession(request.sessionId || `session-${request.player.id}`);
    app.getCoordinator().complete(request.player.id, { decision_id: request.decisionId, status: 'no_op' });
    request.onUsage({ input_tokens: 10, output_tokens: 1 });
    return { sessionId: `session-${request.player.id}` };
  };
  try {
    app = await startApp({ directory, port: 0, setup: setup(2), runPlayerFactory: factory });
    assert.equal(app.appState().coordinator.mode, 'paused');
    app.getCoordinator().start();
    await tick();
    await app.getCoordinator().idle();
    assert.equal(requests.length, 2);
    assert.equal(app.getTable().getState().revision, 0);
    assert.equal(app.getTable().getRecording().frames.length, 0);
    assert.equal(app.getCoordinator().status().state, 'stalled');
    const session = app.appState().match.session;
    assert.ok(existsSync(session + '.game.md'));
    assert.ok(existsSync(session + '.game.json'));
    const status = JSON.stringify(app.appState());
    for (const p of app.getTable().getState().players) assert.ok(!status.includes(app.getTable().getToken(p.id)));
    const log = await (await fetch(app.url + '/api/log?format=json')).json();
    assert.equal(log.initial.players.length, 2);
    assert.ok(!JSON.stringify(log).includes(app.getTable().getToken('p1')));
    await app.close();
    app = await startApp({ directory, port: 0, runPlayerFactory: factory });
    assert.equal(app.appState().coordinator.mode, 'paused');
    assert.deepEqual(app.appState().coordinator.players.map(p => p.sessionId), ['session-p1', 'session-p2']);
    assert.equal(app.getTable().getState().revision, 0);
  } finally {
    if (app?.server.listening) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('MCP-only matches exceed six seats, UI controls reject unrelated web origins', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'game-night-roster-'));
  let app;
  try {
    app = await startApp({ directory, port: 0, setup: setup(10, false), runPlayerFactory: () => async () => {} });
    assert.equal(app.getTable().getState().players.length, 10);
    assert.equal((await (await fetch(app.url + '/api/table')).json()).players.length, 10);
    const bad = await fetch(app.url + '/api/control', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://unrelated.example' },
      body: JSON.stringify({ action: 'start' }),
    });
    assert.equal(bad.status, 403);
    assert.equal(app.getCoordinator().status().mode, 'paused');
    const result = await fetch(app.url + '/api/match', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(setup(1, false)),
    });
    assert.equal(result.status, 201);
    assert.equal(app.getTable().getState().players.length, 1);
  } finally {
    if (app?.server.listening) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('managed actions require the current active decision and are recorded before acknowledgement', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'game-night-managed-'));
  let app;
  let allowed;
  try {
    app = await startApp({ directory, port: 0, setup: setup(1), runPlayerFactory: () => async request => {
      const table = app.getTable();
      const response = await fetch(table.url + '/api/act', {
        method: 'POST', headers: { Authorization: `Bearer ${table.getToken('p1')}` },
        body: JSON.stringify({ revision: 0, decision_id: request.decisionId, actions: [{ type: 'draw' }], reason: 'Opening card' }),
      });
      allowed = response.status;
      app.getCoordinator().complete('p1', { decision_id: request.decisionId, status: 'acted' });
      return {};
    } });
    app.getCoordinator().step();
    await tick();
    await app.getCoordinator().idle();
    assert.equal(allowed, 200);
    assert.equal(app.getTable().getState().revision, 1);
    assert.match(readFileSync(app.appState().match.session + '.game.md', 'utf8'), /Draw from p1:library: Private card 1/);
    const stale = await fetch(app.getTable().url + '/api/act', {
      method: 'POST', headers: { Authorization: `Bearer ${app.getTable().getToken('p1')}` },
      body: JSON.stringify({ revision: 1, decision_id: 'old', actions: [{ type: 'draw' }], reason: 'Late action' }),
    });
    assert.equal(stale.status, 400);
    assert.equal(app.getTable().getState().revision, 1);
  } finally {
    if (app?.server.listening) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('invalid replacement setup preserves the current match and releases failed table locks', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'game-night-replace-'));
  let app;
  try {
    app = await startApp({ directory, port: 0, setup: setup(1, false) });
    const original = app.appState().match;
    for (const invalid of [
      { ...setup(2), limits: { maxConcurrent: 0 } },
      { ...setup(2), references: ['formats/does-not-exist.md'] },
    ]) {
      await assert.rejects(app.createMatch(invalid));
      assert.equal(app.appState().match.id, original.id);
      assert.equal(app.getCoordinator().status().mode, 'paused');
      assert.equal((await fetch(app.getTable().url + '/api/table')).status, 200);
      assert.equal(JSON.parse(readFileSync(join(directory, 'current.json'))).id, original.id);
    }
    const result = await fetch(app.url + '/api/control', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'configure', limits: { maxDecisions: 20 } }),
    });
    assert.equal(result.status, 200);
    assert.equal((await result.json()).limits.maxDecisions, 20);
  } finally {
    if (app?.server.listening) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('failure to bind the app port closes the internal table so the match can reopen', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'game-night-port-'));
  const blocker = createServer();
  await new Promise(resolve => blocker.listen(0, '127.0.0.1', resolve));
  let app;
  try {
    await assert.rejects(startApp({ directory, port: blocker.address().port, setup: setup(1, false) }), /EADDRINUSE/);
    app = await startApp({ directory, port: 0 });
    assert.equal(app.getTable().getState().players.length, 1);
    assert.equal(app.getCoordinator().status().mode, 'paused');
  } finally {
    await new Promise(resolve => blocker.close(resolve));
    if (app?.server.listening) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a finished match stays finished and CLI --run exits while releasing its lock', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'game-night-finished-'));
  let app;
  try {
    app = await startApp({ directory, port: 0, setup: setup(1, false) });
    const table = app.getTable();
    const response = await fetch(table.url + '/api/act', {
      method: 'POST', headers: { Authorization: `Bearer ${table.getToken('p1')}` },
      body: JSON.stringify({ revision: 0, reason: 'Fixture conclusion', actions: [{ type: 'result', winners: ['p1'], explanation: 'Fixture result' }] }),
    });
    assert.equal(response.status, 200, await response.text());
    assert.equal(app.getCoordinator().status().mode, 'finished');
    await app.close();
    app = await startApp({ directory, port: 0 });
    assert.equal(app.getCoordinator().status().mode, 'finished');
    assert.throws(() => app.getCoordinator().start(), /finished/);
    const session = app.appState().match.session;
    await app.close();
    app = null;
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [
        fileURLToPath(new URL('./app.mjs', import.meta.url)),
        '--directory', directory, '--port', '0', '--headless', '--run',
      ], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, 5000);
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('close', (code, signal) => {
        clearTimeout(timeout);
        resolve({ code, signal, stderr, timedOut });
      });
    });
    assert.equal(result.timedOut, false, 'CLI kept running after the startup error');
    assert.equal(result.code, 1);
    assert.equal(result.signal, null);
    assert.match(result.stderr, /This match has finished/);
    assert.equal(existsSync(session + '.lock'), false);
  } finally {
    if (app?.server.listening) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
