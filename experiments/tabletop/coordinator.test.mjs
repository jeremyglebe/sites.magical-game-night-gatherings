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

test('broadcasts every revision in order, isolates seat views and resumes only that seat', async () => {
  let coordinator;
  const calls = [];
  const active = new Set();
  let maxActive = 0;
  let currentRevision = 0;
  coordinator = createCoordinator({
    players: players(9),
    getView: id => ({ revision: currentRevision, privateHand: `hand-${id}` }),
    getEvents: (id, after, through) => ({ events: [{ revision: through, actor: id, secret: `event-${id}` }] }),
    runPlayer: async request => {
      const { player, sessionId, decisionId, view, events, revision } = request;
      assert(!active.has(player.id));
      active.add(player.id); maxActive = Math.max(maxActive, active.size);
      assert.equal(view.privateHand, `hand-${player.id}`);
      assert.equal(events[0].secret, `event-${player.id}`);
      const prior = calls.filter(c => c.id === player.id);
      assert.equal(sessionId, prior.length ? `session-${player.id}` : null);
      request.onSession(`session-${player.id}`);
      calls.push({ id: player.id, revision });
      await nextTurn();
      coordinator.complete(player.id, { decision_id: decisionId, status: 'no_op' });
      active.delete(player.id);
      return { sessionId: `session-${player.id}`, usage: { input_tokens: 10, output_tokens: 1 } };
    },
  });
  coordinator.notify(0);
  coordinator.start();
  currentRevision = 2;
  coordinator.notify(1); coordinator.notify(2); coordinator.notify(2);
  await settle(coordinator);
  assert.equal(calls.length, 27);
  assert(maxActive > 1 && maxActive <= 4);
  for (const p of players(9)) assert.deepEqual(calls.filter(c => c.id === p.id).map(c => c.revision), [0, 1, 2]);
  assert.equal(coordinator.status().state, 'stalled');
  assert.equal(coordinator.status().usage.output_tokens, 27);
  const count = calls.length;
  await nextTurn();
  assert.equal(calls.length, count, 'no-op completion must not wake players again');
});

test('step launches only one decision and rejects stale or duplicate completions', async () => {
  let coordinator;
  const requests = [];
  coordinator = createCoordinator({
    players: players(2), getView: () => ({ revision: 0 }),
    runPlayer: async request => {
      requests.push(request);
      assert.throws(() => coordinator.complete(request.player.id, { decision_id: 'old', status: 'no_op' }), /no longer active/);
      coordinator.complete(request.player.id, { decision_id: request.decisionId, status: 'no_op' });
      assert.throws(() => coordinator.complete(request.player.id, { decision_id: request.decisionId, status: 'no_op' }), /already completed/);
    },
  });
  coordinator.notify(0);
  coordinator.step();
  await settle(coordinator);
  assert.equal(requests.length, 1);
  assert.equal(coordinator.status().state, 'paused');
  assert.equal(coordinator.status().queued, 1);
  coordinator.step();
  await settle(coordinator);
  assert.equal(requests.length, 2);
  assert.equal(coordinator.status().queued, 0);
});

test('pause cancels an active request and preserves it for reconsideration', async () => {
  let first;
  const coordinator = createCoordinator({
    players: players(1), getView: () => ({ revision: 0 }),
    runPlayer: request => {
      first = request;
      return new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }));
    },
  });
  coordinator.notify(0); coordinator.start();
  await nextTurn();
  coordinator.pause();
  await coordinator.idle();
  assert(first.signal.aborted);
  assert.equal(coordinator.status().active, 0);
  assert.deepEqual(coordinator.snapshot().players[0].pending, [0]);
  assert.equal(coordinator.snapshot().players[0].error, null);
});

test('restore is paused, retains session identity and requeues interrupted decisions', async () => {
  const saved = {
    mode: 'running', decisions: 2, latestRevision: 2,
    players: [{ id: 'p1', sessionId: 'only-p1', lastCompleted: 0, pending: [2], active: { revision: 1 } }],
  };
  const calls = [];
  let coordinator;
  coordinator = createCoordinator({
    players: players(1), saved, getView: () => ({ revision: 2 }),
    runPlayer: async r => {
      calls.push(r);
      assert.equal(r.sessionId, 'only-p1');
      coordinator.complete(r.player.id, { decision_id: r.decisionId, status: 'no_op' });
    },
  });
  assert.equal(coordinator.status().state, 'paused');
  assert.deepEqual(coordinator.snapshot().players[0].pending, [1, 2]);
  coordinator.start();
  await settle(coordinator);
  assert.deepEqual(calls.map(c => c.revision), [1, 2]);
});

test('worker failure pauses and preserves work without automatic retry or model fallback', async () => {
  let count = 0;
  const coordinator = createCoordinator({
    players: players(1), getView: () => ({ revision: 0 }),
    runPlayer: async () => { count++; throw new Error('Selected model unavailable'); },
  });
  coordinator.notify(0); coordinator.start();
  await settle(coordinator);
  assert.equal(coordinator.status().state, 'paused');
  assert.match(coordinator.status().message, /Selected model unavailable/);
  assert.deepEqual(coordinator.snapshot().players[0].pending, [0]);
  await nextTurn();
  assert.equal(count, 1);
});

test('decision timeout cancels worker and preserves pending notification', async () => {
  const coordinator = createCoordinator({
    players: players(1), limits: { decisionTimeoutMs: 10 }, getView: () => ({ revision: 0 }),
    runPlayer: r => new Promise((_, reject) => r.signal.addEventListener('abort', () => reject(r.signal.reason), { once: true })),
  });
  coordinator.notify(0); coordinator.start();
  await nextTurn();
  await coordinator.idle();
  assert.equal(coordinator.status().state, 'paused');
  assert.match(coordinator.status().message, /timed out/);
  assert.equal(coordinator.status().queued, 1);
});

test('budget counts started decisions and stops at limit; finished games start no more work', async () => {
  let coordinator;
  let count = 0;
  coordinator = createCoordinator({
    players: players(4), limits: { maxDecisions: 2 }, getView: () => ({ revision: 0 }),
    runPlayer: async r => {
      count++;
      coordinator.complete(r.player.id, { decision_id: r.decisionId, status: 'no_op' });
    },
  });
  coordinator.notify(0); coordinator.start();
  await settle(coordinator);
  assert.equal(count, 2);
  assert.equal(coordinator.status().state, 'paused');
  assert.equal(coordinator.status().queued, 2);
  coordinator.finish(); coordinator.notify(1);
  assert.equal(coordinator.status().queued, 0);
  assert.throws(() => coordinator.start(), /finished/);
});

test('missing explicit completion pauses instead of silently passing priority', async () => {
  const coordinator = createCoordinator({
    players: players(1), getView: () => ({ revision: 0 }),
    runPlayer: async () => ({ sessionId: 'p1-thread' }),
  });
  coordinator.notify(0); coordinator.start();
  await settle(coordinator);
  assert.equal(coordinator.status().state, 'paused');
  assert.match(coordinator.status().message, /without calling complete_decision/);
  assert.equal(coordinator.snapshot().players[0].lastCompleted, -1);
});

test('saved sessions cannot be shared between players', () => {
  assert.throws(() => createCoordinator({
    players: players(2), getView: () => ({}), runPlayer: async () => {},
    saved: { players: [{ id: 'p1', sessionId: 'shared' }, { id: 'p2', sessionId: 'shared' }] },
  }), /cannot share/);
});

test('step with no queued decisions stays paused', async () => {
  const coordinator = createCoordinator({
    players: players(1), getView: () => ({}),
    runPlayer: () => assert.fail('No pending work should run'),
  });
  coordinator.step();
  await nextTurn();
  assert.equal(coordinator.status().state, 'paused');
  assert.equal(coordinator.status().message, 'No pending player decisions.');
});

test('pause and immediate start never restore authority to the aborted decision', async () => {
  let first, release;
  let coordinator;
  coordinator = createCoordinator({
    players: players(1), getView: () => ({ revision: 0 }),
    runPlayer: request => {
      if (!first) {
        first = request;
        return new Promise(resolve => { release = resolve; });
      }
      assert.notEqual(request.decisionId, first.decisionId);
      assert.equal(coordinator.authorizeDecision(request.player.id, request.decisionId), true);
      coordinator.complete(request.player.id, { decision_id: request.decisionId, status: 'no_op' });
    },
  });
  coordinator.notify(0); coordinator.start();
  await nextTurn();
  assert.equal(coordinator.authorizeDecision('p1', first.decisionId), true);
  coordinator.pause(); coordinator.start();
  assert(first.signal.aborted);
  assert.throws(() => coordinator.authorizeDecision('p1', first.decisionId), /no longer active/);
  assert.throws(() => coordinator.complete('p1', { decision_id: first.decisionId, status: 'acted' }), /no longer active/);
  release();
  await settle(coordinator);
  assert.equal(coordinator.snapshot().players[0].lastCompleted, 0);
});

test('completion revokes mutation authority immediately, before worker exit', async () => {
  let request, release;
  const coordinator = createCoordinator({
    players: players(1), getView: () => ({ revision: 0 }),
    runPlayer: input => { request = input; return new Promise(resolve => { release = resolve; }); },
  });
  coordinator.notify(0); coordinator.start();
  await nextTurn();
  coordinator.complete('p1', { decision_id: request.decisionId, status: 'no_op' });
  assert.equal(coordinator.status().active, 1);
  assert.throws(() => coordinator.authorizeDecision('p1', request.decisionId), /already completed/);
  release();
  await settle(coordinator);
  assert.throws(() => coordinator.authorizeDecision('p1', request.decisionId), /No active decision/);
});

test('optional output-token budget can be cleared explicitly', () => {
  const coordinator = createCoordinator({
    players: players(1), getView: () => ({}), runPlayer: async () => {},
    limits: { maxOutputTokens: 100 },
  });
  coordinator.configure({ maxOutputTokens: null });
  assert.equal(coordinator.snapshot().limits.maxOutputTokens, undefined);
});

test('invalid limit update cannot partially mutate other settings', () => {
  const coordinator = createCoordinator({
    players: players(1), getView: () => ({}), runPlayer: async () => {},
    limits: { maxConcurrent: 2, maxOutputTokens: 100 },
  });
  const before = coordinator.snapshot().limits;
  assert.throws(() => coordinator.configure({ maxConcurrent: 3, maxDecisions: -1, maxOutputTokens: null }), /positive integer/);
  assert.deepEqual(coordinator.snapshot().limits, before);
});

test('changing limits refreshes budget notices without resuming the match', async () => {
  let coordinator;
  let calls = 0;
  coordinator = createCoordinator({
    players: players(1), limits: { maxDecisions: 1, maxOutputTokens: 1 },
    getView: () => ({ revision: 0 }),
    runPlayer: async request => {
      calls++;
      request.onUsage({ output_tokens: 1 });
      coordinator.complete('p1', { decision_id: request.decisionId, status: 'no_op' });
    },
  });
  coordinator.notify(0); coordinator.start();
  await settle(coordinator);
  assert.match(coordinator.status().message, /Decision limit reached/);
  coordinator.configure({ maxConcurrent: 2 });
  assert.match(coordinator.status().message, /Decision limit reached/);
  coordinator.configure({ maxDecisions: 2 });
  assert.match(coordinator.status().message, /Output-token limit reached/);
  coordinator.configure({ maxOutputTokens: null });
  assert.equal(coordinator.status().message, null);
  assert.equal(coordinator.status().mode, 'paused');
  await nextTurn();
  assert.equal(calls, 1);
});

test('changing limits preserves player help and failure messages', async () => {
  for (const outcome of ['help', 'error']) {
    let coordinator;
    coordinator = createCoordinator({
      players: players(1), getView: () => ({ revision: 0 }),
      runPlayer: async request => {
        if (outcome === 'error') throw new Error('Fixture worker failure');
        coordinator.complete('p1', { decision_id: request.decisionId, status: 'needs_help', note: 'Fixture question' });
      },
    });
    coordinator.notify(0); coordinator.start();
    await settle(coordinator);
    const message = coordinator.status().message;
    assert.match(message, outcome === 'help' ? /requested help/ : /Fixture worker failure/);
    coordinator.configure({ maxDecisions: 3000 });
    assert.equal(coordinator.status().message, message);
    assert.equal(coordinator.status().mode, 'paused');
  }
});

test('explicit start retries saved help once in the same session with a new decision ID', async () => {
  let coordinator;
  let firstRequest;
  coordinator = createCoordinator({
    players: players(1), getView: () => ({ revision: 0 }),
    runPlayer: async request => {
      firstRequest = request;
      request.onSession('help-session');
      coordinator.complete('p1', { decision_id: request.decisionId, status: 'needs_help', note: 'Fixture question' });
    },
  });
  coordinator.notify(0); coordinator.start();
  await settle(coordinator);
  const saved = coordinator.snapshot();
  assert.equal(saved.players[0].lastCompleted, 0);
  assert.deepEqual(saved.players[0].pending, []);
  const calls = [];
  coordinator = createCoordinator({
    players: players(1), saved, getView: () => ({ revision: 0 }),
    runPlayer: async request => {
      calls.push(request);
      assert.equal(request.sessionId, 'help-session');
      assert.notEqual(request.decisionId, firstRequest.decisionId);
      coordinator.complete('p1', { decision_id: request.decisionId, status: 'no_op' });
    },
  });
  coordinator.start(); coordinator.start();
  await settle(coordinator);
  assert.deepEqual(calls.map(request => request.revision), [0]);
  assert.equal(coordinator.status().state, 'stalled');
  assert.equal(coordinator.snapshot().latestRevision, 0);
  assert.equal(coordinator.snapshot().players[0].lastCompleted, 0);
  assert.equal(coordinator.snapshot().players[0].retryRevision, null);
  coordinator.start(); coordinator.notify(0);
  await settle(coordinator);
  assert.equal(calls.length, 1, 'ordinary idle completion does not trigger another retry');
});

test('step retries help only on explicit request and preserves newer queued notifications', async () => {
  const saved = {
    mode: 'paused', latestRevision: 0,
    players: players(2).map(p => ({
      id: p.id, sessionId: `session-${p.id}`, lastCompleted: 0, pending: [],
      lastDecision: { status: 'needs_help', revision: 0 },
    })),
  };
  const calls = [];
  let coordinator;
  coordinator = createCoordinator({
    players: players(2), saved, getView: () => ({ revision: coordinator.snapshot().latestRevision }),
    runPlayer: async request => {
      calls.push({ id: request.player.id, revision: request.revision });
      coordinator.complete(request.player.id, { decision_id: request.decisionId, status: 'needs_help' });
    },
  });
  coordinator.step();
  await settle(coordinator);
  assert.equal(calls.length, 1);
  assert.equal(coordinator.status().state, 'paused');
  await nextTurn();
  assert.equal(calls.length, 1, 'a repeated help request must not retry automatically');
  coordinator.notify(1);
  coordinator.step();
  await settle(coordinator);
  assert.deepEqual(calls, [{ id: 'p1', revision: 0 }, { id: 'p2', revision: 0 }]);
  assert.deepEqual(coordinator.snapshot().players.map(p => p.pending), [[1], [1]]);
  coordinator.step();
  await settle(coordinator);
  assert.deepEqual(calls.at(-1), { id: 'p1', revision: 1 });
  assert.deepEqual(coordinator.snapshot().players[0].pending, []);
});

test('queued and interrupted explicit help retries survive snapshot restore', async () => {
  const saved = {
    mode: 'paused', latestRevision: 0,
    players: [{
      id: 'p1', sessionId: 'retry-session', lastCompleted: 0, pending: [],
      lastDecision: { status: 'needs_help', revision: 0 },
    }],
  };
  let coordinator = createCoordinator({
    players: players(1), saved, getView: () => ({ revision: 0 }),
    runPlayer: () => assert.fail('Paused retry should not launch'),
  });
  coordinator.start(); coordinator.pause();
  const queued = coordinator.snapshot();
  assert.deepEqual(queued.players[0].pending, [0]);
  assert.equal(queued.players[0].retryRevision, 0);
  assert.equal(queued.players[0].lastCompleted, 0);
  await nextTurn();
  let activeRequest;
  coordinator = createCoordinator({
    players: players(1), saved: queued, getView: () => ({ revision: 0 }),
    runPlayer: request => {
      activeRequest = request;
      return new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }));
    },
  });
  assert.deepEqual(coordinator.snapshot().players[0].pending, [0]);
  coordinator.start();
  await nextTurn();
  const interrupted = coordinator.snapshot();
  assert.equal(interrupted.players[0].active.revision, 0);
  coordinator.pause();
  await coordinator.idle();
  let count = 0;
  coordinator = createCoordinator({
    players: players(1), saved: interrupted, getView: () => ({ revision: 0 }),
    runPlayer: async request => {
      count++;
      assert.equal(request.sessionId, 'retry-session');
      assert.notEqual(request.decisionId, activeRequest.decisionId);
      coordinator.complete('p1', { decision_id: request.decisionId, status: 'no_op' });
    },
  });
  assert.deepEqual(coordinator.snapshot().players[0].pending, [0]);
  coordinator.start();
  await settle(coordinator);
  assert.equal(count, 1);
  assert.equal(coordinator.snapshot().players[0].lastCompleted, 0);
  assert.equal(coordinator.snapshot().players[0].retryRevision, null);
});

test('restore retains a help completion saved before the worker exited', async () => {
  const saved = {
    mode: 'running', latestRevision: 0,
    players: [{
      id: 'p1', sessionId: 'help-session', lastCompleted: -1, pending: [],
      active: { revision: 0, completion: { status: 'needs_help', revision: 0, note: 'Question' } },
    }],
  };
  let coordinator;
  let count = 0;
  coordinator = createCoordinator({
    players: players(1), saved, getView: () => ({ revision: 0 }),
    runPlayer: async request => {
      count++;
      coordinator.complete('p1', { decision_id: request.decisionId, status: 'no_op' });
    },
  });
  assert.equal(coordinator.snapshot().players[0].lastDecision.status, 'needs_help');
  coordinator.step();
  await settle(coordinator);
  assert.equal(count, 1);
});
