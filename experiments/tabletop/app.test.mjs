import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApp as startAppWithUsage } from './app.mjs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applyActions } from './table.mjs';
import { appendRecording } from './game-log.mjs';

const setup = (count, ai = true) => ({
  title: 'Integration match', shuffle: false,
  players: Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`, name: `Seat ${i + 1}`, ai,
    deck: [{ name: `Private card ${i + 1}`, count: 3 }],
  })),
});
const tick = () => new Promise(resolve => setImmediate(resolve));
// Integration tests must not query the developer's account or launch Codex.
const startApp = options => startAppWithUsage({ readPlanUsage: null, ...options });

test('the basic game guide is pinned locally and delivered separately from table instructions', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'game-night-basic-guide-'));
  const basicRulesPath = join(directory, 'source-guide.txt');
  const guide = 'Basic game guide\nInstants, responses and the stack.\n';
  const supplied = [];
  let app;
  const factory = options => { supplied.push(options); return async () => {}; };
  try {
    writeFileSync(basicRulesPath, guide);
    app = await startApp({ directory, basicRulesPath, port: 0, setup: setup(1), runPlayerFactory: factory });
    const pinned = join(directory, 'matches', app.appState().match.id, 'BasicRules.txt');
    assert.equal(readFileSync(pinned, 'utf8'), guide);
    assert.equal(supplied[0].basicRules, guide);
    assert.match(supplied[0].quickstart, /MCP tool guide/);
    const table = app.getTable();
    const result = await (await fetch(table.url + '/api/rules?source=basic&query=responses', {
      headers: { Authorization: `Bearer ${table.getToken('p1')}` },
    })).json();
    assert.equal(result.matches[0].line, 2);
    await app.close();
    writeFileSync(basicRulesPath, 'A later guide for new games.');
    app = await startApp({ directory, basicRulesPath, port: 0, runPlayerFactory: factory });
    assert.equal(supplied[1].basicRules, guide, 'existing matches retain the pinned guide');
    assert.equal(app.appState().rules.sources.find(s => s.source === 'basic').available, true);
  } finally {
    if (app?.server.listening) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

// Recovery fixtures deliberately save the table separately from its coordinator
// to reproduce the boundary between the two durable writes after a crash.
function saveTableAction(session, actor, actions) {
  const saved = JSON.parse(readFileSync(session, 'utf8'));
  const next = applyActions(saved.state, actor, saved.state.revision, actions, 'Recovery fixture');
  saved.recording = appendRecording(saved.recording, saved.state, next);
  saved.state = next;
  writeFileSync(session, JSON.stringify(saved));
  return next;
}

test('plan usage reads are shared and cached, saved per match and never fabricate a game charge', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'game-night-usage-'));
  let app, finishRead;
  let reads = 0;
  const reader = () => { reads++; return new Promise(resolve => { finishRead = resolve; }); };
  const sample = { checkedAt: new Date().toISOString(), buckets: [{ id: 'codex', name: 'Codex', windows: [
    { id: 'primary', usedPercent: 16, windowDurationMins: 10080, resetsAt: 2000000000 },
  ] }] };
  try {
    app = await startApp({ directory, port: 0, setup: setup(1), readPlanUsage: reader, runPlayerFactory: () => async () => {} });
    assert.equal(reads, 1);
    assert.equal(app.appState().planUsage.refreshing, true);
    const first = app.refreshPlanUsage({ force: true });
    const second = app.refreshPlanUsage({ force: true });
    finishRead(sample);
    await Promise.all([first, second]);
    await app.refreshPlanUsage({ force: true });
    assert.equal(reads, 1);
    assert.equal(app.appState().planUsage.buckets[0].windows[0].usedPercent, 16);
    assert.equal(app.appState().planUsage.buckets[0].windows[0].changeSinceBaseline, 0);
    const id = app.appState().match.id;
    assert.equal(JSON.parse(readFileSync(join(directory, 'matches', id, 'match.json'))).planUsage.latest.checkedAt, sample.checkedAt);
    await app.close();
    app = await startApp({ directory, port: 0, readPlanUsage: async () => { throw new Error('private error details'); }, runPlayerFactory: () => async () => {} });
    await app.refreshPlanUsage();
    assert.equal(app.appState().planUsage.checkedAt, sample.checkedAt);
    assert.match(app.appState().planUsage.error, /Could not refresh/);
    assert.ok(!JSON.stringify(app.appState()).includes('private error details'));
    const invalid = await fetch(app.url + '/api/usage/refresh', { method: 'POST', headers: { Origin: 'https://unrelated.example' } });
    assert.equal(invalid.status, 403);
  } finally {
    if (app?.server.listening) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a later Pause cancels Start while a quota read is pending', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'game-night-usage-controls-'));
  let app, finishRead;
  let calls = 0;
  try {
    app = await startApp({ directory, port: 0, setup: setup(1),
      readPlanUsage: () => new Promise(resolve => { finishRead = resolve; }),
      runPlayerFactory: () => async () => { calls++; },
    });
    const control = action => fetch(app.url + '/api/control', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
    });
    const starting = control('start');
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal((await control('pause')).status, 200);
    finishRead({ checkedAt: new Date().toISOString(), buckets: [] });
    assert.equal((await starting).status, 400);
    assert.equal(app.getCoordinator().status().mode, 'paused');
    assert.equal(calls, 0);
  } finally {
    if (app?.server.listening) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

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
    assert.equal(requests.length, 1, 'only the starting seat is prompted');
    app.getCoordinator().start();
    await tick();
    assert.equal(app.getCoordinator().status().state, 'stalled');
    const wake = await fetch(app.url + '/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'wake', player: 'p2' }),
    });
    assert.equal(wake.status, 200);
    await tick();
    assert.equal(requests.length, 1, 'Give control leaves a stalled match paused until Start');
    assert.equal(app.getCoordinator().status().mode, 'paused');
    assert.equal(app.getCoordinator().status().pendingRecipient.playerId, 'p2');
    app.getCoordinator().start();
    await tick();
    await app.getCoordinator().idle();
    assert.equal(requests.length, 2);
    assert.equal(app.getTable().getState().revision, 0);
    assert.equal(app.getTable().getRecording().frames.length, 0);
    assert.equal(app.getCoordinator().status().mode, 'paused');
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

test('only explicit handoffs wake the next player, speech is public, and the old worker exits first', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'game-night-handoff-'));
  let app, releaseFirst, notifyHandoff;
  const firstRelease = new Promise(resolve => { releaseFirst = resolve; });
  const firstHandoff = new Promise(resolve => { notifyHandoff = resolve; });
  const requests = [];
  let workers = 0, peak = 0;
  async function act(request, actions) {
    const table = app.getTable();
    const response = await fetch(table.url + '/api/act', {
      method: 'POST', headers: { Authorization: `Bearer ${table.getToken(request.player.id)}` },
      body: JSON.stringify({ revision: table.getState().revision, decision_id: request.decisionId, actions, reason: 'Private reasoning must not become speech.' }),
    });
    const result = await response.json();
    assert.equal(response.status, 200, result.error);
    return result;
  }
  const factory = () => async request => {
    workers++; peak = Math.max(peak, workers);
    requests.push(request);
    request.onSession(request.sessionId || `session-${request.player.id}`);
    try {
      if (requests.length === 1) {
        await act(request, [{ type: 'draw' }, { type: 'say', text: 'I am keeping this hand.' }]);
        assert.equal(requests.length, 1);
        assert.deepEqual(app.getCoordinator().status().players.find(p => p.id === 'p2').pending, []);
        const result = await act(request, [{ type: 'pass', next: 'p2', message: 'Please prepare your hand.' }]);
        assert.equal(result.decision_completed, true);
        assert.throws(() => app.getCoordinator().authorizeDecision('p1', request.decisionId), /completed|handoff|active/i);
        notifyHandoff();
        await firstRelease;
      } else if (request.player.id === 'p2') {
        assert.equal(request.sessionId, null);
        assert.ok(request.events.some(e => e.changes?.some(c => c.type === 'say' && c.text === 'I am keeping this hand.')));
        assert.ok(!JSON.stringify(request.events).includes('Private card 1'));
        await act(request, [{ type: 'say', text: 'Ready. Go ahead.' }, { type: 'pass', next: 'p1' }]);
      } else {
        assert.equal(request.sessionId, 'session-p1');
        await act(request, [{ type: 'pass_turn', next: 'p2', message: 'Over to you.' }]);
      }
      return { sessionId: `session-${request.player.id}` };
    } finally { workers--; }
  };
  try {
    app = await startApp({ directory, port: 0, setup: { ...setup(2), limits: { maxDecisions: 3 } }, runPlayerFactory: factory });
    app.getCoordinator().start();
    await firstHandoff;
    await tick();
    assert.equal(requests.length, 1, 'recipient waits for the prior worker to exit');
    releaseFirst();
    for (let i = 0; i < 200 && app.getCoordinator().status().mode !== 'paused'; i++) await new Promise(resolve => setTimeout(resolve, 5));
    await app.getCoordinator().idle();
    assert.equal(peak, 1);
    assert.deepEqual(requests.map(r => r.player.id), ['p1', 'p2', 'p1']);
    const state = app.getTable().getState();
    assert.deepEqual(state.turn, { number: 2, active: 'p2', priority: 'p2', phase: 'Untap' });
    const history = await (await fetch(app.url + '/api/history?since=0')).json();
    assert.equal(history.events.length, 4);
    assert.ok(!JSON.stringify(history).includes('Private reasoning'));
    assert.ok(!JSON.stringify(history).includes('Private card 1'));
    assert.ok(JSON.stringify(history).includes('Over to you.'));
    assert.equal((await (await fetch(app.url + '/api/history?since=2')).json()).events.length, 2);
    await app.close();
    app = await startApp({ directory, port: 0, runPlayerFactory: factory });
    assert.equal(app.getCoordinator().status().pendingRecipient.playerId, 'p2');
    assert.equal(app.getCoordinator().status().mode, 'paused');
    assert.equal(app.getCoordinator().status().decisions, 3);
  } finally {
    releaseFirst();
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

test('legacy and unversioned broadcast queues migrate paused to one priority or active recipient', async t => {
  for (const version of [1, undefined]) for (const priority of ['p2', null]) {
    await t.test(`${version === undefined ? 'unversioned' : 'v1'} with ${priority ? 'priority' : 'active fallback'}`, async () => {
      const directory = mkdtempSync(join(tmpdir(), 'game-night-legacy-recovery-'));
      let app, calls = 0;
      const factory = () => async () => { calls++; };
      try {
        app = await startApp({ directory, port: 0, setup: setup(2), runPlayerFactory: factory });
        const { id, session } = app.appState().match;
        const path = join(directory, 'matches', id, 'match.json');
        await app.close(); app = null;
        const state = saveTableAction(session, 'p1', [{ type: 'turn', set: {
          active: priority ? 'p1' : 'p2', priority, phase: 'Main',
        } }]);
        const saved = JSON.parse(readFileSync(path, 'utf8'));
        if (version === undefined) delete saved.coordinator.version;
        else saved.coordinator.version = version;
        saved.coordinator.mode = 'running';
        saved.coordinator.latestRevision = state.revision;
        delete saved.coordinator.pendingRecipient;
        for (const player of saved.coordinator.players) {
          player.pending = [0, state.revision];
          player.lastCompleted = 0;
          player.sessionId = `saved-${player.id}`;
        }
        writeFileSync(path, JSON.stringify(saved));
        app = await startApp({ directory, port: 0, runPlayerFactory: factory });
        await tick();
        const recovered = app.getCoordinator().status();
        assert.equal(recovered.version, 2);
        assert.equal(recovered.mode, 'paused');
        assert.equal(recovered.active, 0);
        assert.equal(recovered.queued, 1);
        assert.deepEqual(recovered.pendingRecipient, { playerId: 'p2', revision: state.revision, kind: 'resume' });
        assert.deepEqual(recovered.players.map(player => player.pending), [[], [state.revision]]);
        assert.deepEqual(recovered.players.map(player => player.sessionId), ['saved-p1', 'saved-p2']);
        assert.deepEqual(recovered.players.map(player => player.lastCompleted), [0, 0]);
        assert.equal(calls, 0);
        assert.equal(app.getTable().getState().revision, state.revision);
        const persisted = JSON.parse(readFileSync(path, 'utf8')).coordinator;
        assert.equal(persisted.version, 2);
        assert.equal(persisted.pendingRecipient.playerId, 'p2');
      } finally {
        if (app?.server.listening) await app.close();
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});

test('a durable handoff recovers its recipient when the coordinator save still has the old active worker', async t => {
  for (const type of ['pass', 'pass_turn']) await t.test(type, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'game-night-crash-handoff-'));
    let app;
    const calls = [];
    const factory = () => async request => {
      calls.push(request);
      app.getCoordinator().complete(request.player.id, { decision_id: request.decisionId, status: 'no_op' });
    };
    try {
      app = await startApp({ directory, port: 0, setup: setup(2), runPlayerFactory: factory });
      const { id, session } = app.appState().match;
      const path = join(directory, 'matches', id, 'match.json');
      await app.close(); app = null;
      const saved = JSON.parse(readFileSync(path, 'utf8'));
      saved.coordinator.mode = 'running';
      saved.coordinator.pendingRecipient = null;
      saved.coordinator.decisions = 1;
      const sender = saved.coordinator.players[0];
      sender.sessionId = 'sender-session';
      sender.decisions = 1;
      sender.pending = [];
      sender.active = {
        revision: 0, fromRevision: 0, decisionId: 'interrupted-sender', startedAt: new Date().toISOString(),
        wake: { playerId: 'p1', revision: 0, kind: 'setup' }, completion: null,
      };
      saved.coordinator.players[1].sessionId = 'recipient-session';
      writeFileSync(path, JSON.stringify(saved));
      const state = saveTableAction(session, 'p1', [
        { type: 'say', text: 'Over to you.' }, { type, next: 'p2' },
      ]);
      assert.equal(saved.coordinator.latestRevision, 0);
      assert.equal(state.revision, 1);
      app = await startApp({ directory, port: 0, runPlayerFactory: factory });
      const recovered = app.getCoordinator().status();
      assert.equal(recovered.mode, 'paused');
      assert.equal(recovered.active, 0);
      assert.equal(recovered.queued, 1);
      assert.equal(recovered.latestRevision, 1);
      assert.equal(recovered.pendingRecipient.playerId, 'p2');
      assert.equal(recovered.pendingRecipient.kind, type === 'pass_turn' ? 'turn' : 'priority');
      assert.equal(calls.length, 0);
      app.getCoordinator().start();
      await tick();
      await app.getCoordinator().idle();
      assert.deepEqual(calls.map(request => request.player.id), ['p2']);
      assert.equal(calls[0].sessionId, 'recipient-session');
      assert.notEqual(calls[0].decisionId, 'interrupted-sender');
      assert.equal(calls[0].events.at(-1).changes.at(-1).type, type);
      assert.equal(app.getTable().getState().revision, 1, 'recovery must not replay the physical handoff');
      assert.equal(app.getTable().getRecording().frames.length, 1);
    } finally {
      if (app?.server.listening) await app.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

test('an ordinary durable commit never invents a recipient when the saved coordinator has none', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'game-night-crash-ordinary-'));
  let app, calls = 0;
  const factory = () => async () => { calls++; };
  try {
    app = await startApp({ directory, port: 0, setup: setup(2), runPlayerFactory: factory });
    const { id, session } = app.appState().match;
    const path = join(directory, 'matches', id, 'match.json');
    await app.close(); app = null;
    const saved = JSON.parse(readFileSync(path, 'utf8'));
    saved.coordinator.pendingRecipient = null;
    for (const player of saved.coordinator.players) {
      player.pending = [];
      player.lastCompleted = 0;
      player.lastDecision = { status: 'no_op', revision: 0, note: '' };
    }
    writeFileSync(path, JSON.stringify(saved));
    saveTableAction(session, 'p1', [{ type: 'draw' }, { type: 'say', text: 'A public statement, not a handoff.' }]);
    app = await startApp({ directory, port: 0, runPlayerFactory: factory });
    const recovered = app.getCoordinator().status();
    assert.equal(recovered.mode, 'paused');
    assert.equal(recovered.latestRevision, 1);
    assert.equal(recovered.pendingRecipient, null);
    assert.equal(recovered.queued, 0);
    assert.equal(app.getTable().getState().zones['p1:hand'].cards.length, 1);
    app.getCoordinator().start();
    await tick();
    assert.equal(app.getCoordinator().status().state, 'stalled');
    assert.equal(calls, 0);
    assert.equal(app.getTable().getState().revision, 1);
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).coordinator.pendingRecipient, null);
  } finally {
    if (app?.server.listening) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
