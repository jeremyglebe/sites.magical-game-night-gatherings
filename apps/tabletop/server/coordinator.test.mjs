import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createCoordinator } from './coordinator.mjs';

const players = count => Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}` }));
async function settle(coordinator) {
  for (let i = 0; i < 100; i++) {
    await nextTurn();
    const status = coordinator.status();
    if (!status.active && (status.state !== 'running' || !status.queued)) return;
  }
  throw new Error('Coordinator did not settle');
}
const noop = (coordinator, request) => coordinator.complete(request.player.id, { decision_id: request.decisionId, status: 'no_op' });
const eventsBetween = (id, after, through) => Array.from({ length: through - Math.max(after, 0) }, (_, i) => ({
  revision: Math.max(after, 0) + i + 1, actor: id, secret: `event-${id}`,
}));

test('ordinary changes never wake players; explicit handoffs serialize independent seat histories', async () => {
  let coordinator, revision = 0, workers = 0, maxWorkers = 0;
  const calls = [];
  coordinator = createCoordinator({
    players: players(9), limits: { maxConcurrent: 9 },
    getView: id => ({ revision, privateHand: `hand-${id}` }), getEvents: eventsBetween,
    runPlayer: async request => {
      workers++; maxWorkers = Math.max(workers, maxWorkers);
      const { player, sessionId, view, events } = request;
      assert.equal(view.privateHand, `hand-${player.id}`);
      for (const event of events) assert.equal(event.secret, `event-${player.id}`);
      assert.equal(sessionId, calls.some(c => c.player.id === player.id) ? `session-${player.id}` : null);
      request.onSession(`session-${player.id}`); calls.push(request);
      if (calls.length < 3) {
        coordinator.notify(++revision); coordinator.notify(++revision);
        assert.equal(coordinator.status().queued, 0, 'physical actions must not broadcast');
        const next = player.id === 'p1' ? 'p2' : 'p1';
        assert.deepEqual(coordinator.handoff(player.id, next, ++revision, 'priority'), {
          accepted: true, decision_completed: true, recipient: next, revision, kind: 'priority',
        });
        assert.throws(() => coordinator.authorizeDecision(player.id, request.decisionId), /already completed/);
        assert.equal(coordinator.status().active, 1);
        const callsBeforeExit = calls.length;
        await nextTurn();
        assert.equal(calls.length, callsBeforeExit, 'next worker waits for process exit');
      } else noop(coordinator, request);
      workers--;
    },
  });
  coordinator.notify(0); coordinator.start(); await nextTurn();
  assert.equal(calls.length, 0, 'start does not infer a recipient');
  coordinator.wake('p1', 0); await settle(coordinator);
  assert.deepEqual(calls.map(r => r.player.id), ['p1', 'p2', 'p1']);
  assert.deepEqual(calls.map(r => r.events.map(e => e.revision)), [[], [1, 2, 3], [4, 5, 6]]);
  assert.equal(maxWorkers, 1); assert.equal(coordinator.status().limits.maxConcurrent, 1);
  assert.equal(coordinator.status().queued, 0);
  coordinator.notify(++revision); coordinator.start(); await nextTurn();
  assert.equal(calls.length, 3, 'completed idle decisions and revision changes create no notification loop');
});

test('handoff authority ends immediately and next starts only after worker exit', async () => {
  const calls = []; let release, coordinator;
  coordinator = createCoordinator({
    players: players(2), getView: () => ({ revision: 1 }),
    runPlayer: request => {
      calls.push(request);
      if (calls.length === 1) return new Promise(resolve => { release = resolve; });
      noop(coordinator, request);
    },
  });
  coordinator.wake('p1', 0); coordinator.start(); await nextTurn();
  const first = calls[0];
  coordinator.handoff('p1', 'p2', 1);
  assert.throws(() => coordinator.authorizeDecision('p1', first.decisionId), /already completed/);
  assert.throws(() => coordinator.complete('p1', { decision_id: first.decisionId, status: 'acted' }), /already completed/);
  assert.throws(() => coordinator.handoff('p1', 'p2', 1), /already completed/);
  await nextTurn(); assert.equal(calls.length, 1);
  assert.equal(coordinator.status().pendingRecipient.playerId, 'p2');
  release(); await settle(coordinator); assert.equal(calls.length, 2);
});

test('step processes exactly one handoff and leaves its named recipient queued', async () => {
  const calls = []; let coordinator, revision = 0;
  coordinator = createCoordinator({
    players: players(2), getView: () => ({ revision }),
    runPlayer: async request => {
      calls.push(request);
      assert.throws(() => coordinator.complete(request.player.id, { decision_id: 'stale', status: 'no_op' }), /no longer active/);
      coordinator.handoff(request.player.id, request.player.id === 'p1' ? 'p2' : 'p1', ++revision);
    },
  });
  coordinator.wake('p1', 0); coordinator.step(); await settle(coordinator);
  assert.equal(calls.length, 1); assert.equal(coordinator.status().state, 'paused');
  assert.equal(coordinator.status().pendingRecipient.playerId, 'p2');
  coordinator.step(); await settle(coordinator);
  assert.equal(calls.length, 2); assert.equal(coordinator.status().pendingRecipient.playerId, 'p1');
});

test('manual recipient owns the table after worker exits and must explicitly hand back', async () => {
  let coordinator, release, count = 0;
  coordinator = createCoordinator({
    players: [{ id: 'p1' }, { id: 'human', enabled: false }], getView: () => ({ revision: 3 }),
    runPlayer: request => {
      count++;
      if (count === 1) {
        coordinator.handoff('p1', 'human', 3);
        return new Promise(resolve => { release = resolve; });
      }
      noop(coordinator, request);
    },
  });
  coordinator.wake('p1', 0); coordinator.start(); await nextTurn();
  assert.throws(() => coordinator.authorizeManual('human'), /worker to exit/);
  release(); await settle(coordinator);
  assert.equal(coordinator.status().state, 'waiting_manual');
  assert.equal(coordinator.authorizeManual('human'), true);
  assert.throws(() => coordinator.authorizeManual('p1'), /not the current recipient/);
  coordinator.notify(4); await nextTurn(); assert.equal(count, 1);
  assert.deepEqual(coordinator.handoff('human', 'p1', 5, 'turn'), {
    accepted: true, decision_completed: false, recipient: 'p1', revision: 5, kind: 'turn',
  });
  // A fresh view must reach the durable handoff revision.
  await settle(coordinator);
  assert.equal(count, 1); assert.match(coordinator.status().message, /view is older/);
});

test('manual handoff resumes the named AI and solo self-handoff is serial', async () => {
  let coordinator, revision = 0; const calls = [];
  coordinator = createCoordinator({
    players: [{ id: 'p1' }, { id: 'human', enabled: false }], getView: () => ({ revision }),
    runPlayer: request => {
      calls.push(request);
      if (calls.length === 1) coordinator.handoff('p1', 'p1', ++revision, 'turn');
      else noop(coordinator, request);
    },
  });
  coordinator.wake('human', 0); coordinator.start(); await nextTurn();
  assert.equal(calls.length, 0);
  coordinator.handoff('human', 'p1', ++revision);
  await settle(coordinator);
  assert.deepEqual(calls.map(r => r.player.id), ['p1', 'p1']);
  assert.notEqual(calls[0].decisionId, calls[1].decisionId);
});

test('completion without handoff pauses for intervention; start never invents the next player', async () => {
  for (const status of ['no_op', 'acted', 'needs_help']) {
    let coordinator, count = 0;
    coordinator = createCoordinator({
      players: players(2), getView: () => ({ revision: 0 }),
      runPlayer: request => {
        count++;
        coordinator.complete(request.player.id, { decision_id: request.decisionId, status, note: 'Question' });
      },
    });
    coordinator.wake('p1', 0); coordinator.start(); await settle(coordinator);
    assert.equal(coordinator.status().mode, 'paused'); assert.equal(coordinator.status().queued, 0);
    assert.match(coordinator.status().message, status === 'needs_help' ? /requested help/ : /without a handoff/);
    coordinator.start(); coordinator.notify(1); await settle(coordinator);
    assert.equal(count, 1);
  }
});

test('legacy broadcast backlogs are discarded while identities, history cursors and usage survive', async () => {
  const saved = { version: 1, mode: 'running', latestRevision: 40, decisions: 20, players: [
    { id: 'p1', sessionId: 'one', pending: [1, 2, 3], active: { revision: 3 }, lastCompleted: 0, usage: { output_tokens: 50 } },
    { id: 'p2', sessionId: 'two', pending: [4, 5, 6], lastCompleted: 2 },
  ] };
  let coordinator; const calls = [];
  coordinator = createCoordinator({
    players: players(2), saved, getView: () => ({ revision: 40 }), getEvents: eventsBetween,
    runPlayer: request => { calls.push(request); noop(coordinator, request); },
  });
  assert.equal(coordinator.status().state, 'paused'); assert.equal(coordinator.status().queued, 0);
  assert.equal(coordinator.status().usage.output_tokens, 50);
  coordinator.start(); await nextTurn(); assert.equal(calls.length, 0);
  coordinator.wake('p2', 40, 'resume'); await settle(coordinator);
  assert.equal(calls[0].sessionId, 'two');
  assert.deepEqual(calls[0].events.map(e => e.revision), Array.from({ length: 38 }, (_, i) => i + 3));
});

test('restoring an interrupted serial decision is paused and retains all unseen events', async () => {
  const saved = { version: 2, mode: 'running', latestRevision: 5, players: [
    { id: 'p1', sessionId: 'restored', lastCompleted: 1,
      active: { revision: 3, fromRevision: 2, wake: { kind: 'priority', from: 'p2' } } },
    { id: 'p2', sessionId: 'other', lastCompleted: 0 },
  ] };
  let coordinator; const calls = [];
  coordinator = createCoordinator({
    players: players(2), saved, getView: () => ({ revision: 5 }), getEvents: eventsBetween,
    runPlayer: request => { calls.push(request); noop(coordinator, request); },
  });
  assert.equal(coordinator.status().state, 'paused');
  assert.equal(coordinator.status().pendingRecipient.playerId, 'p1');
  coordinator.start(); await settle(coordinator);
  assert.equal(calls[0].sessionId, 'restored');
  assert.deepEqual(calls[0].events.map(e => e.revision), [2, 3, 4, 5]);
  assert.equal(calls[0].wake.kind, 'priority');
});

test('saved terminal handoff resumes recipient, never the old speaker, including self-handoff', async () => {
  for (const next of ['p1', 'p2']) {
    const handoff = { recipient: next, revision: 4, kind: 'priority' };
    const saved = { version: 2, mode: 'running', latestRevision: 4, players: [
      { id: 'p1', sessionId: 'one', lastCompleted: 0,
        active: { revision: 1, completion: { status: 'acted', revision: 4, handoff } } },
      { id: 'p2', sessionId: 'two', lastCompleted: 2 },
    ] };
    let coordinator; const calls = [];
    coordinator = createCoordinator({
      players: players(2), saved, getView: () => ({ revision: 4 }), getEvents: eventsBetween,
      runPlayer: request => { calls.push(request); noop(coordinator, request); },
    });
    assert.equal(coordinator.status().pendingRecipient.playerId, next);
    coordinator.start(); await settle(coordinator);
    assert.equal(calls.length, 1); assert.equal(calls[0].player.id, next);
    assert.deepEqual(calls[0].events.map(e => e.revision), next === 'p1' ? [] : [3, 4]);
  }
});

test('recovery can replace an interrupted recipient explicitly but never a live worker', async () => {
  let request, release;
  const coordinator = createCoordinator({
    players: players(2), saved: { version: 2, pendingRecipient: { playerId: 'p1', revision: 1, kind: 'resume' } },
    getView: () => ({ revision: 2 }),
    runPlayer: input => { request = input; return new Promise(resolve => { release = resolve; }); },
  });
  coordinator.wake('p2', 2, 'recovery'); coordinator.start(); await nextTurn();
  assert.equal(request.player.id, 'p2');
  assert.throws(() => coordinator.wake('p1', 2), /active worker to exit/);
  coordinator.pause(); release(); await coordinator.idle();
});

test('current-turn public history preserves land plays across phases and resets only on a new turn', async () => {
  const history = [
    { revision: 1, actor: 'p1', summary: 'Turn 1', changes: [{ type: 'turn', set: { number: 1, active: 'p1', phase: 'Main1' } }] },
    { revision: 2, actor: 'p1', summary: 'Played Plains', reason: 'private reason omitted' },
    { revision: 3, actor: 'p1', summary: 'Main2', changes: [{ type: 'turn', set: { number: 1, active: 'p1', phase: 'Main2' } }] },
    { revision: 4, actor: 'p2', summary: 'Turn 2', changes: [{ type: 'pass_turn', set: { number: 2, active: 'p2', phase: 'Untap' } }] },
  ];
  let revision = 3, coordinator; const calls = [];
  coordinator = createCoordinator({
    players: players(1), getView: () => ({ revision, turn: { number: revision === 3 ? 1 : 2, active: revision === 3 ? 'p1' : 'p2' } }),
    getPublicEvents: (after, through) => history.filter(e => e.revision > after && e.revision <= through),
    runPlayer: request => { calls.push(request); noop(coordinator, request); },
  });
  coordinator.wake('p1', 3); coordinator.start(); await settle(coordinator);
  assert.equal(calls[0].turnHistory.events.length, 3);
  assert.match(calls[0].turnHistory.events[1].summary, /Plains/);
  assert(!JSON.stringify(calls[0].turnHistory).includes('private reason omitted'));
  revision = 4; coordinator.wake('p1', 4); coordinator.start(); await settle(coordinator);
  assert.deepEqual(calls[1].turnHistory.events.map(e => e.revision), [4]);
});

test('pause and immediate start never resurrect aborted decision authority', async () => {
  let first, release, coordinator; const calls = [];
  coordinator = createCoordinator({
    players: players(1), getView: () => ({ revision: 0 }),
    runPlayer: request => {
      calls.push(request);
      if (!first) { first = request; return new Promise(resolve => { release = resolve; }); }
      assert.notEqual(request.decisionId, first.decisionId); noop(coordinator, request);
    },
  });
  coordinator.wake('p1', 0); coordinator.start(); await nextTurn();
  coordinator.pause(); coordinator.start();
  assert(first.signal.aborted);
  assert.throws(() => coordinator.authorizeDecision('p1', first.decisionId), /no longer active/);
  assert.throws(() => coordinator.handoff('p1', 'p1', 0), /no longer active/);
  release(); await settle(coordinator); assert.equal(calls.length, 2);
});

test('completion revokes mutation authority before worker exits', async () => {
  let request, release;
  const coordinator = createCoordinator({
    players: players(1), getView: () => ({ revision: 0 }),
    runPlayer: input => { request = input; return new Promise(resolve => { release = resolve; }); },
  });
  coordinator.wake('p1', 0); coordinator.start(); await nextTurn();
  noop(coordinator, request);
  assert.throws(() => coordinator.authorizeDecision('p1', request.decisionId), /already completed/);
  release(); await settle(coordinator);
  assert.equal(coordinator.status().queued, 0);
});

test('worker failure and timeout pause without automatic retry or model fallback', async () => {
  for (const timeout of [false, true]) {
    let count = 0;
    const coordinator = createCoordinator({
      players: players(1), limits: { decisionTimeoutMs: 10 }, getView: () => ({ revision: 0 }),
      runPlayer: request => {
        count++;
        if (!timeout) throw new Error('Selected model unavailable');
        return new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }));
      },
    });
    coordinator.wake('p1', 0); coordinator.start(); await nextTurn(); await coordinator.idle();
    assert.equal(coordinator.status().mode, 'paused'); assert.equal(coordinator.status().queued, 1);
    assert.match(coordinator.status().message, timeout ? /timed out/ : /Selected model unavailable/);
    await nextTurn(); assert.equal(count, 1);
  }
});

test('decision and token budgets preserve the handoff and update atomically', async () => {
  let coordinator, revision = 0, count = 0;
  coordinator = createCoordinator({
    players: players(1), limits: { maxDecisions: 1, maxOutputTokens: 1 }, getView: () => ({ revision }),
    runPlayer: request => { count++; request.onUsage({ output_tokens: 1 }); coordinator.handoff('p1', 'p1', ++revision); },
  });
  coordinator.wake('p1', 0); coordinator.start(); await settle(coordinator);
  assert.equal(count, 1); assert.equal(coordinator.status().queued, 1);
  assert.match(coordinator.status().message, /Decision limit reached/);
  coordinator.configure({ maxDecisions: 2 }); assert.match(coordinator.status().message, /Output-token limit reached/);
  coordinator.configure({ maxOutputTokens: null }); assert.equal(coordinator.status().message, null);
  assert.equal(coordinator.status().mode, 'paused');
  const before = coordinator.snapshot().limits;
  assert.throws(() => coordinator.configure({ maxConcurrent: 2, maxDecisions: 30 }), /maxConcurrent must be 1/);
  assert.deepEqual(coordinator.snapshot().limits, before);
  assert.throws(() => coordinator.configure({ maxDecisions: -1, maxOutputTokens: 10 }), /positive integer/);
  assert.deepEqual(coordinator.snapshot().limits, before);
  coordinator.finish(); coordinator.notify(2);
  assert.equal(coordinator.status().queued, 0); assert.throws(() => coordinator.start(), /finished/);
});

test('cumulative CLI usage replaces prior reports and repairs legacy saved totals', async () => {
  let coordinator, calls = 0;
  const saved = { version: 1, latestRevision: 1, players: [{ id: 'p1', sessionId: 'history', lastCompleted: 1,
    usage: { input_tokens: 300, output_tokens: 40 } }] };
  const options = { players: players(1), limits: { maxOutputTokens: 100 }, getView: () => ({ revision: 2 }),
    runPlayer: request => {
      calls++; assert.equal(request.sessionId, 'history');
      request.onUsage({ input_tokens: 175, cached_input_tokens: 90, output_tokens: 17 }, { scope: 'session', sessionId: 'history' });
      request.onUsage({ input_tokens: 175, cached_input_tokens: 90, output_tokens: 17 }, { scope: 'session', sessionId: 'history' });
      noop(coordinator, request);
    } };
  coordinator = createCoordinator({ ...options, saved });
  assert.equal(coordinator.status().usage.output_tokens, 40);
  coordinator.wake('p1', 2); coordinator.start(); await settle(coordinator);
  assert.equal(coordinator.status().usage.output_tokens, 17);
  coordinator = createCoordinator({ ...options, saved: coordinator.snapshot() });
  coordinator.wake('p1', 2, 'resume'); coordinator.start(); await settle(coordinator);
  assert.equal(calls, 2); assert.equal(coordinator.status().usage.output_tokens, 17);
  assert.equal(coordinator.snapshot().players[0].usageScope, 'session');
});

test('session identity and usage cannot cross seats', async () => {
  assert.throws(() => createCoordinator({ players: players(2), getView: () => ({}), runPlayer: async () => {},
    saved: { players: [{ id: 'p1', sessionId: 'shared' }, { id: 'p2', sessionId: 'shared' }] } }), /cannot share/);
  let coordinator;
  coordinator = createCoordinator({
    players: players(1), getView: () => ({ revision: 0 }),
    runPlayer: request => {
      request.onSession('own-session');
      request.onUsage({ output_tokens: 1 }, { scope: 'session', sessionId: 'different-session' });
    },
  });
  coordinator.wake('p1', 0); coordinator.start(); await settle(coordinator);
  assert.equal(coordinator.status().usage.output_tokens, 0);
  assert.match(coordinator.status().message, /different player session/);
});

test('missing completion pauses and help stays visible across configuration updates and restart', async () => {
  const incomplete = createCoordinator({ players: players(1), getView: () => ({ revision: 0 }), runPlayer: () => ({ sessionId: 'one' }) });
  incomplete.wake('p1', 0); incomplete.start(); await settle(incomplete);
  assert.match(incomplete.status().message, /without an explicit handoff or complete_decision/);
  const saved = { version: 2, mode: 'running', latestRevision: 0, players: [{ id: 'p1', sessionId: 'help', lastCompleted: -1,
    active: { revision: 0, completion: { status: 'needs_help', revision: 0, note: 'Question' } } }] };
  const coordinator = createCoordinator({ players: players(1), saved, getView: () => ({ revision: 0 }), runPlayer: () => assert.fail('No explicit wake') });
  assert.equal(coordinator.snapshot().players[0].lastCompleted, 0);
  assert.equal(coordinator.snapshot().players[0].lastDecision.status, 'needs_help');
  coordinator.configure({ maxDecisions: 3000 });
  coordinator.start(); await nextTurn(); assert.equal(coordinator.status().queued, 0);
});

test('invalid recipients and empty step do not create work', async () => {
  const coordinator = createCoordinator({ players: players(1), getView: () => ({ revision: 0 }), runPlayer: () => assert.fail('No work') });
  assert.throws(() => coordinator.wake('unknown', 0), /Unknown recipient/);
  assert.throws(() => coordinator.wake('p1', -1), /Invalid table revision/);
  coordinator.step(); await nextTurn();
  assert.equal(coordinator.status().state, 'paused'); assert.equal(coordinator.status().message, 'No pending player decisions.');
});

test('a result ends gameplay, then independent same-session surveys run serially before final completion', async () => {
  const calls = []; let coordinator, releaseGame, workers = 0, maximum = 0;
  coordinator = createCoordinator({
    players: [{ id: 'p1', status: 'conceded' }, { id: 'p2', status: 'eliminated' }],
    saved: { version: 2, latestRevision: 9, players: players(2).map(p => ({ ...p, sessionId: `history-${p.id}`, lastCompleted: 9 })) },
    getView: id => ({ revision: 10, result: { winners: ['p2'] }, privateHand: id }),
    getSurvey: id => ({ schema: { version: 1 }, player: { id }, response: null }),
    runPlayer: async request => {
      workers++; maximum = Math.max(maximum, workers); calls.push(request);
      assert.equal(request.sessionId, `history-${request.player.id}`);
      if (request.phase === 'game') {
        coordinator.beginSurvey({ pending: ['p1', 'p2'], revision: 10 });
        assert.equal(request.signal.aborted, false, 'result tool response is allowed to finish');
        assert.throws(() => coordinator.authorizeDecision('p1', request.decisionId), /already completed/);
        await new Promise(resolve => { releaseGame = resolve; });
      } else {
        assert.equal(request.survey.player.id, request.player.id);
        assert.equal(request.view.privateHand, request.player.id);
        assert.throws(() => coordinator.authorizeSurvey(request.player.id, 'old-decision'), /no longer active/);
        assert.throws(() => coordinator.handoff(request.player.id, 'p2', 10), /Gameplay has ended/);
        assert.throws(() => coordinator.complete(request.player.id, { decision_id: request.decisionId, status: 'no_op' }), /Submit the post-game survey/);
        coordinator.submitSurvey(request.player.id, request.decisionId);
        assert.throws(() => coordinator.submitSurvey(request.player.id, request.decisionId), /No pending survey/);
        assert.notEqual(coordinator.status().mode, 'finished', 'final worker must exit before completion');
        const count = calls.length; await nextTurn(); assert.equal(calls.length, count);
      }
      workers--;
    },
  });
  coordinator.wake('p1', 10); coordinator.start(); await nextTurn();
  assert.equal(calls.length, 1);
  assert.equal(coordinator.status().phase, 'survey');
  assert.deepEqual(coordinator.snapshot().surveyPending, ['p1', 'p2']);
  assert.throws(() => coordinator.wake('p2', 10), /Gameplay has ended/);
  releaseGame(); await settle(coordinator);
  assert.deepEqual(calls.map(call => [call.player.id, call.phase]), [['p1', 'game'], ['p1', 'survey'], ['p2', 'survey']]);
  assert.equal(maximum, 1);
  assert.equal(coordinator.status().mode, 'finished');
  assert.deepEqual(coordinator.status().surveyPending, []);
});

test('human feedback is independent and never blocks remaining AI survey work', async () => {
  let coordinator, release; const calls = [];
  coordinator = createCoordinator({
    players: [{ id: 'human1', enabled: false }, { id: 'p1' }, { id: 'human2', enabled: false }],
    getView: () => ({ revision: 4 }), getSurvey: id => ({ player: { id }, schema: {} }),
    runPlayer: request => { calls.push(request); return new Promise(resolve => { release = resolve; }); },
  });
  coordinator.beginSurvey({ pending: ['human1', 'p1', 'human2'], revision: 4 });
  assert.equal(coordinator.status().pendingRecipient.playerId, 'p1');
  coordinator.start(); await nextTurn();
  assert.equal(calls.length, 1);
  assert.equal(coordinator.authorizeSurvey('human2'), true);
  coordinator.submitSurvey('human2');
  assert.equal(coordinator.status().players.find(p => p.id === 'p1').active.decisionId, calls[0].decisionId);
  assert.equal(coordinator.status().pendingRecipient.playerId, 'human1');
  coordinator.submitSurvey('p1', calls[0].decisionId);
  coordinator.submitSurvey('human1');
  assert.notEqual(coordinator.status().mode, 'finished');
  release(); await settle(coordinator);
  assert.equal(calls.length, 1);
  assert.equal(coordinator.status().mode, 'finished');
});

test('survey recovery reconciles durable responses without repeating already submitted feedback', async () => {
  let original;
  original = createCoordinator({
    players: players(2), getView: () => ({ revision: 8 }), getSurvey: id => ({ player: { id }, schema: {} }),
    runPlayer: request => {
      request.onSession(`session-${request.player.id}`);
      return new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }));
    },
  });
  original.beginSurvey({ pending: ['p1', 'p2'], revision: 8 }); original.start(); await nextTurn();
  const saved = original.snapshot(); original.pause(); await original.idle();
  assert.equal(saved.players[0].active.wake.kind, 'survey');
  const calls = []; let restored;
  restored = createCoordinator({
    players: players(2), saved, getView: () => ({ revision: 8 }), getSurvey: id => ({ player: { id }, schema: {} }),
    runPlayer: request => { calls.push(request); restored.submitSurvey(request.player.id, request.decisionId); },
  });
  assert.equal(restored.status().mode, 'paused');
  // The p1 response was persisted immediately before the old process stopped;
  // the authoritative recording now says only p2 remains.
  restored.beginSurvey({ pending: ['p2'], revision: 8 });
  assert.equal(restored.snapshot().players[0].sessionId, 'session-p1');
  await nextTurn(); assert.equal(calls.length, 0, 'restoration does not spend tokens until resumed');
  restored.start(); await settle(restored);
  assert.deepEqual(calls.map(call => call.player.id), ['p2']);
  assert.equal(restored.status().mode, 'finished');
});

test('survey failure and budget exhaustion leave feedback pending for explicit recovery', async () => {
  let coordinator, calls = 0;
  coordinator = createCoordinator({
    players: players(1), limits: { maxDecisions: 1 }, getView: () => ({ revision: 2 }),
    getSurvey: () => ({ schema: {} }),
    runPlayer: request => {
      calls++;
      if (calls === 1) coordinator.beginSurvey({ pending: ['p1'], revision: 2 });
      else if (calls === 2) throw new Error('Survey unavailable');
      else coordinator.submitSurvey('p1', request.decisionId);
    },
  });
  coordinator.wake('p1', 2); coordinator.start(); await settle(coordinator);
  assert.equal(calls, 1); assert.equal(coordinator.status().mode, 'paused');
  assert.match(coordinator.status().message, /Decision limit reached/);
  assert.deepEqual(coordinator.status().surveyPending, ['p1']);
  coordinator.configure({ maxDecisions: 5 }); coordinator.start(); await settle(coordinator);
  assert.equal(calls, 2); assert.equal(coordinator.status().mode, 'paused');
  assert.match(coordinator.status().message, /Survey unavailable/);
  assert.deepEqual(coordinator.status().surveyPending, ['p1']);
  coordinator.start(); await settle(coordinator);
  assert.equal(calls, 3); assert.equal(coordinator.status().mode, 'finished');
});

test('manual-only postgame stays pending until every response is submitted', () => {
  const coordinator = createCoordinator({ players: [{ id: 'human', enabled: false }], getView: () => ({ revision: 0 }), runPlayer: () => assert.fail('Human cannot launch Codex') });
  assert.throws(() => coordinator.beginSurvey({ pending: ['missing'], revision: 1 }), /Invalid survey recipients/);
  assert.throws(() => coordinator.beginSurvey({ pending: ['human', 'human'], revision: 1 }), /Invalid survey recipients/);
  coordinator.beginSurvey({ pending: ['human'], revision: 1 }); coordinator.start();
  assert.equal(coordinator.status().state, 'waiting_manual');
  assert.match(coordinator.status().message, /post-game survey/);
  coordinator.submitSurvey('human');
  assert.equal(coordinator.status().mode, 'finished');
});
