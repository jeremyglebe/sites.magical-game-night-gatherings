import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApp } from './app.mjs';
import { applyFrame } from './game-log.mjs';

const setup = ai => ({ title: 'Human chat fixture', shuffle: false,
  players: ai.map((enabled, index) => ({ id: `p${index + 1}`, name: `Seat ${index + 1}`, ai: enabled,
    deck: [{ name: `Private card ${index + 1}`, count: 8, oracle_text: 'Fixture card.', type_line: 'Creature' }] })) });
async function request(url, body, headers = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
const chat = (app, playerId, text, extra = {}) => request(app.url + '/api/human/chat', {
  matchId: app.appState().match.id, playerId, text, ...extra,
});
const act = (app, playerId, actions, revision = app.getTable().getState().revision) => request(app.url + '/api/human/act', {
  matchId: app.appState().match.id, playerId, revision, actions,
});
async function waitFor(check) {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('Expected coordinator state was not reached');
}

test('out-of-turn human chat steers the current AI at tool boundaries without changing control or losing overflow', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'game-night-steering-'));
  const workers = [];
  let app;
  const factory = () => async req => {
    await new Promise(resolve => {
      workers.push({ req, release: resolve });
      req.signal.addEventListener('abort', resolve, { once: true });
    });
  };
  try {
    app = await startApp({ directory, port: 0, setup: setup([false, true, true]), readPlanUsage: null, runPlayerFactory: factory });
    await request(app.url + '/api/control', { action: 'start' });
    assert.equal((await act(app, 'p1', [{ type: 'draw' }, { type: 'pass', next: 'p2' }])).status, 200);
    await waitFor(() => workers.length === 1);
    const req = workers[0].req;
    const table = app.getTable();
    const headers = { Authorization: `Bearer ${table.getToken('p2')}`, 'X-Tabletop-Decision-ID': req.decisionId };
    const turn = structuredClone(table.getState().turn);
    const before = app.getCoordinator().snapshot();
    for (let i = 0; i < 20; i++) {
      const reply = await chat(app, 'p1', `Human correction ${i + 1}`, { actor: 'p2', actions: [{ type: 'draw' }] });
      assert.equal(reply.status, 200, reply.body.error);
      assert.equal(reply.body.canAct, false);
      assert.equal(reply.body.canChat, true);
      assert.equal(reply.body.boardRevision, req.revision);
    }
    assert.deepEqual(table.getState().turn, turn);
    assert.equal(table.getState().zones['p1:hand'].cards.length, 1, 'chat never accepts physical actions');
    assert.equal(app.getCoordinator().status().decisions, 1);
    assert.equal(workers.length, 1);
    assert.deepEqual(app.getCoordinator().snapshot().pendingRecipient, before.pendingRecipient);
    const revision = table.getState().revision;
    const stale = await request(table.url + '/api/act', {
      revision: req.revision, decision_id: req.decisionId, reason: 'Old planned action', actions: [{ type: 'draw' }],
    }, headers);
    assert.equal(stale.status, 400);
    assert.match(stale.body.error, /No action was applied/);
    assert.equal(stale.body.steering.messages.length, 20, 'steering must exceed observe_table’s 12-event window');
    assert.deepEqual(stale.body.steering.messages.map(message => message.text), Array.from({ length: 20 }, (_, i) => `Human correction ${i + 1}`));
    assert(stale.body.steering.messages.every(message => message.playerId === 'p1'));
    assert.equal(stale.body.table.revision, revision);
    assert.equal(table.getState().revision, revision);
    assert.equal(table.getState().zones['p2:hand'].cards.length, 0);
    assert(!JSON.stringify(stale.body).includes('Private card 1'), 'fresh steering snapshot retains seat filtering');
    const afterDelivery = await request(table.url + '/api/references', undefined, headers);
    assert.equal(afterDelivery.body.steering, undefined, 'already delivered steering is not repeated on reads');
    await chat(app, 'p1', 'Please consider an earlier response point.');
    const read = await request(table.url + '/api/rules?source=quickstart&count=1', undefined, headers);
    assert.equal(read.body.steering.messages.length, 1);
    assert.match(read.body.steering.messages[0].text, /earlier response point/);
    assert.equal((await request(table.url + '/api/observe', undefined, headers)).body.steering, undefined);
    await chat(app, 'p1', 'One final clarification before you finish.');
    const complete = await request(table.url + '/api/decision', { decision_id: req.decisionId, status: 'no_op' }, headers);
    assert.equal(complete.status, 400, 'finishing a decision cannot silently drop new chat');
    assert.match(complete.body.steering.messages[0].text, /final clarification/);
    const passed = await request(table.url + '/api/act', {
      revision: table.getState().revision, decision_id: req.decisionId, reason: 'Reconsidered', actions: [{ type: 'pass', next: 'p3' }],
    }, headers);
    assert.equal(passed.status, 200, passed.body.error);
    const queued = app.getCoordinator().snapshot().pendingRecipient;
    await chat(app, 'p1', 'A message while the prior worker exits.');
    assert.deepEqual(app.getCoordinator().snapshot().pendingRecipient, queued);
    assert.equal(workers.length, 1);
    workers[0].release();
    await waitFor(() => workers.length === 2);
    assert.equal(workers[1].req.player.id, 'p3');
    assert(workers[1].req.events.some(event => event.summary.includes('while the prior worker exits')));
    assert.equal(workers[1].req.events.filter(event => event.actor === 'p1').length, 24);
    const all = await request(table.url + '/api/events?since=0', undefined,
      { Authorization: `Bearer ${table.getToken('p3')}` });
    assert(all.body.events.some(event => event.summary.includes('Human correction 1')));
  } finally {
    if (app?.server.listening) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('human chat validates identity and lifecycle, preserves drafts across speech only, and survives export and restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'game-night-human-chat-'));
  const options = { directory, port: 0, readPlanUsage: null, runPlayerFactory: () => async () => {} };
  let app;
  try {
    app = await startApp({ ...options, setup: setup([false, false, true]) });
    const drew = await act(app, 'p1', [{ type: 'draw' }]);
    const baseRevision = drew.body.table.revision;
    const card = drew.body.table.zones['p1:hand'].cards[0].id;
    for (const args of [
      ['p3', 'Impersonation'], ['missing', 'No seat'], ['p1', '   '], ['p1', 'x'.repeat(2001)],
      ['p1', 'Wrong match', { matchId: 'wrong' }],
    ]) assert.equal((await chat(app, ...args)).status, 400);
    assert.equal(app.getTable().getState().revision, baseRevision);
    assert.equal((await request(app.url + '/api/human/chat', {
      matchId: app.appState().match.id, playerId: 'p1', text: 'Cross-origin',
    }, { Origin: 'https://untrusted.example' })).status, 403);
    const chatReply = await chat(app, 'p2', 'I may respond here.');
    assert.equal(chatReply.status, 200);
    assert.equal(chatReply.body.canAct, false);
    assert.equal(chatReply.body.canChat, true);
    assert.equal(chatReply.body.boardRevision, baseRevision);
    await chat(app, 'p1', 'Understood.');
    const submitted = await act(app, 'p1', [{ type: 'move', card, to: 'battlefield' }, { type: 'pass', next: 'p2', message: 'Your response.' }], baseRevision);
    assert.equal(submitted.status, 200, submitted.body.error);
    assert.equal(submitted.body.boardRevision, submitted.body.table.revision);
    assert.equal((await act(app, 'p2', [{ type: 'draw' }], baseRevision)).status, 400, 'physical intervening changes still invalidate a draft');
    const matchId = app.appState().match.id;
    const session = app.appState().match.session;
    await chat(app, 'p1', 'Saved after handoff.');
    const recording = JSON.parse(readFileSync(session + '.game.json'));
    const replayed = recording.frames.reduce(applyFrame, recording.initial);
    assert.deepEqual(replayed.notes, app.getTable().getState().notes);
    assert.deepEqual(replayed.turn, app.getTable().getState().turn);
    assert.match(readFileSync(session + '.game.md', 'utf8'), /Saved after handoff/);
    assert.equal(recording.frames.at(-1).event.actor, 'p1');
    await app.close();
    app = await startApp(options);
    assert.equal(app.appState().match.id, matchId);
    assert.equal(app.getCoordinator().snapshot().pendingRecipient.playerId, 'p2');
    assert.equal(app.getTable().getState().notes.at(-1).text, 'Saved after handoff.');
    const ended = await act(app, 'p2', [{ type: 'result', winners: ['p1'], explanation: 'Fixture complete' }]);
    assert.equal(ended.status, 200, ended.body.error);
    assert.equal(ended.body.canChat, false);
    assert.equal((await chat(app, 'p1', 'Too late')).status, 400);
  } finally {
    if (app?.server.listening) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('an interrupted AI receives durable human messages again in its recovered decision history', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'game-night-steering-recovery-'));
  const workers = [];
  const options = { directory, port: 0, readPlanUsage: null,
    runPlayerFactory: () => async req => new Promise(resolve => {
      workers.push(req);
      req.signal.addEventListener('abort', resolve, { once: true });
    }) };
  let app;
  try {
    app = await startApp({ ...options, setup: setup([false, true]) });
    await request(app.url + '/api/control', { action: 'start' });
    await act(app, 'p1', [{ type: 'pass', next: 'p2' }]);
    await waitFor(() => workers.length === 1);
    for (let i = 0; i < 14; i++) await chat(app, 'p1', `Persisted interruption ${i + 1}`);
    const table = app.getTable();
    const delivered = await request(table.url + '/api/references', undefined, {
      Authorization: `Bearer ${table.getToken('p2')}`, 'X-Tabletop-Decision-ID': workers[0].decisionId,
    });
    assert.equal(delivered.body.steering.messages.length, 14);
    await app.close();
    app = await startApp(options);
    assert.equal(app.getCoordinator().snapshot().pendingRecipient.playerId, 'p2');
    await request(app.url + '/api/control', { action: 'start' });
    await waitFor(() => workers.length === 2);
    assert.notEqual(workers[0].decisionId, workers[1].decisionId);
    const recovered = workers[1].events.filter(event => event.changes?.some(change => change.type === 'say'));
    assert.equal(recovered.length, 14);
    assert.match(recovered[0].summary, /Persisted interruption 1/);
    assert.match(recovered.at(-1).summary, /Persisted interruption 14/);
  } finally {
    if (app?.server.listening) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
