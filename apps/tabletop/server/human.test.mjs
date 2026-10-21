import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApp } from './app.mjs';

const image = 'https://cards.scryfall.io/normal/front/a/a/test.jpg';
const setup = (ai = [false, false, true]) => ({
  title: 'Human controls integration', shuffle: false,
  players: ai.map((enabled, index) => ({ id: `p${index + 1}`, name: `Seat ${index + 1}`, ai: enabled,
    deck: [{ name: `Private card ${index + 1}`, count: 5, image_url: image,
      oracle_text: 'Fixture card text.', type_line: 'Creature — Test' }] })),
});
async function request(url, body, headers = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
const humanURL = (app, playerId, path = '/api/human') => app.url + path + '?' + new URLSearchParams({ matchId: app.appState().match.id, playerId });
const humanRead = (app, playerId) => request(humanURL(app, playerId));
const humanAct = (app, playerId, actions, extra = {}) => request(app.url + '/api/human/act', {
  matchId: app.appState().match.id, playerId, revision: app.getTable().getState().revision, actions, ...extra,
});
const control = (app, action, extra = {}) => request(app.url + '/api/control', { action, ...extra });
async function waitFor(check) {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('Expected coordinator state was not reached');
}

test('human views and card reads expose only the selected human seat, with no library identities or concealed artwork', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'game-night-human-private-'));
  let app;
  try {
    app = await startApp({ directory, port: 0, setup: setup(), readPlanUsage: null, runPlayerFactory: () => async () => {} });
    assert.equal(app.appState().humanControls, true);
    const initial = await humanRead(app, 'p1');
    assert.equal(initial.status, 200);
    assert.equal(initial.body.canAct, true);
    assert.match(initial.body.message, /paused.*Resume/);
    const first = await humanAct(app, 'p1', [{ type: 'draw' }, { type: 'pass', next: 'p2' }], { actor: 'p3', decision_id: 'spoofed' });
    assert.equal(first.status, 200, first.body.error);
    assert.equal(first.body.canAct, false);
    assert.equal(app.getTable().getState().events[0].actor, 'p1');
    const p2 = await humanAct(app, 'p2', [{ type: 'draw', count: 2 }]);
    assert.equal(p2.status, 200);
    const faceDownId = p2.body.table.zones['p2:hand'].cards[0].id;
    const hiddenHandId = p2.body.table.zones['p2:hand'].cards[1].id;
    const hiddenLibraryId = app.getTable().getState().zones['p1:library'].cards[0];
    assert.equal((await humanAct(app, 'p2', [
      { type: 'move', card: faceDownId, to: 'battlefield' },
      { type: 'card', card: faceDownId, set: { face_down: true } },
      { type: 'pass', next: 'p1' },
    ])).status, 200);
    const visible = await humanRead(app, 'p1');
    assert.equal(visible.body.table.zones['p1:hand'].cards[0].image_url, image);
    assert.equal(visible.body.table.zones['p2:hand'].count, 1);
    assert.deepEqual(visible.body.table.zones['p2:hand'].cards, []);
    assert.deepEqual(visible.body.table.zones['p1:library'].cards, []);
    const faceDown = visible.body.table.zones.battlefield.cards[0];
    assert.equal(faceDown.name, 'Face-down card');
    assert.equal(faceDown.image_url, undefined);
    assert.equal(faceDown.type_line, undefined);
    const encoded = JSON.stringify(visible.body);
    assert(!encoded.includes('Private card 2'));
    assert(!encoded.includes(hiddenHandId));
    assert(!encoded.includes(hiddenLibraryId));
    assert(!encoded.includes(app.getTable().getToken('p1')));
    for (const id of [hiddenHandId, hiddenLibraryId, faceDownId]) {
      assert.equal((await request(humanURL(app, 'p1', '/api/human/card') + '&id=' + id)).status, 400);
    }
    const knownId = visible.body.table.zones['p1:hand'].cards[0].id;
    const details = await request(humanURL(app, 'p1', '/api/human/card') + '&id=' + knownId);
    assert.equal(details.body.oracle_text, 'Fixture card text.');
    assert.equal(details.body.image_url, image);
    assert.equal((await humanRead(app, 'p3')).status, 400, 'AI views cannot be selected as human');
    assert.equal((await humanAct(app, 'p3', [{ type: 'draw' }])).status, 400);
    assert.equal((await request(humanURL(app, 'p3', '/api/human/card') + '&id=' + knownId)).status, 400);
    assert.equal((await request(humanURL(app, 'p1'), undefined, { Origin: 'https://other.example' })).status, 403);
    const before = app.getTable().getState().revision;
    assert.equal((await humanAct(app, 'p1', [{ type: 'draw' }], { matchId: 'old-match' })).status, 400);
    assert.equal((await humanAct(app, 'p1', [{ type: 'draw' }], { revision: 0 })).status, 400);
    assert.equal((await humanAct(app, 'p2', [{ type: 'draw' }])).status, 400, 'human seat must own the handoff');
    assert.equal(app.getTable().getState().revision, before, 'rejected actions do not modify the game');
  } finally {
    if (app?.server.listening) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('human batches hand off to one AI and regain control only after its worker exits', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'game-night-human-handoff-'));
  let app, release, handedBack = false, aiRequest;
  const workerExit = new Promise(resolve => { release = resolve; });
  const errors = [];
  const factory = () => async req => {
    try {
      aiRequest = req;
      assert.equal(req.player.id, 'p2');
      assert.equal(req.view.zones['p1:hand'].count, 1);
      assert.deepEqual(req.view.zones['p1:hand'].cards, []);
      const table = app.getTable();
      const reply = await request(table.url + '/api/act', {
        revision: req.revision, decision_id: req.decisionId, reason: 'AI fixture responds',
        actions: [{ type: 'draw' }, { type: 'say', text: 'Your spell resolves.' }, { type: 'pass', next: 'p1' }],
      }, { Authorization: `Bearer ${table.getToken('p2')}` });
      assert.equal(reply.status, 200, reply.body.error);
      handedBack = true;
      await workerExit;
    } catch (error) { errors.push(error); throw error; }
  };
  try {
    app = await startApp({ directory, port: 0, setup: setup([false, true]), readPlanUsage: null, runPlayerFactory: factory });
    await control(app, 'start');
    assert.equal(app.getCoordinator().status().state, 'waiting_manual');
    const sent = await humanAct(app, 'p1', [{ type: 'draw' }, { type: 'say', text: 'I keep this hand.' }, { type: 'pass', next: 'p2', message: 'Please respond.' }]);
    assert.equal(sent.status, 200, sent.body.error);
    await waitFor(() => handedBack || errors.length);
    assert.deepEqual(errors, []);
    assert.equal((await humanRead(app, 'p1')).body.canAct, false, 'terminal tool reply still belongs to a live AI worker');
    assert.equal((await humanAct(app, 'p1', [{ type: 'draw' }])).status, 400);
    assert(!JSON.stringify(aiRequest.view).includes('Private card 1'));
    assert(aiRequest.events.some(event => event.summary.includes('I keep this hand.')));
    release();
    await waitFor(() => app.getCoordinator().status().active === 0);
    assert.equal((await humanRead(app, 'p1')).body.canAct, true);
    const moved = await humanAct(app, 'p1', [{ type: 'player', set: { life: 19 } }, { type: 'say', text: 'Ready for the next turn.' }]);
    assert.equal(moved.status, 200, moved.body.error);
    assert.equal(moved.body.table.players[0].life, 19);
    assert.equal(app.getCoordinator().status().decisions, 1, 'ordinary human actions do not wake additional workers');
  } finally {
    release();
    if (app?.server.listening) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('human play is saved, recovers its handoff, and reports an outcome through the existing survey flow', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'game-night-human-recovery-'));
  const options = { directory, port: 0, readPlanUsage: null, runPlayerFactory: () => async () => {} };
  let app;
  try {
    app = await startApp({ ...options, setup: setup([false, false]) });
    const originalId = app.appState().match.id;
    const moved = await humanAct(app, 'p1', [
      { type: 'draw', count: 2 }, { type: 'say', text: 'Keeping.' },
      { type: 'pass_turn', next: 'p2', message: 'Your turn.' },
    ]);
    assert.equal(moved.status, 200, moved.body.error);
    const session = app.appState().match.session;
    assert.equal(JSON.parse(readFileSync(session)).state.events[0].actor, 'p1');
    assert.match(readFileSync(session + '.game.md', 'utf8'), /Keeping\./);
    await app.close();
    app = await startApp(options);
    assert.equal(app.appState().match.id, originalId);
    assert.equal((await humanRead(app, 'p1')).body.canAct, false);
    assert.equal((await humanRead(app, 'p2')).body.canAct, true);
    assert.equal((await humanRead(app, 'p1')).body.table.zones['p1:hand'].count, 2);
    const ended = await humanAct(app, 'p2', [{ type: 'player', set: { status: 'conceded' } }, { type: 'result', winners: ['p1'], explanation: 'Human test result' }]);
    assert.equal(ended.status, 200, ended.body.error);
    assert.equal(ended.body.canAct, false);
    assert.match(ended.body.message, /questionnaire/);
    assert.equal(app.appState().postgame.status, 'pending');
    assert.equal(app.getCoordinator().status().phase, 'survey');
    const revision = app.getTable().getState().revision;
    assert.equal((await humanAct(app, 'p2', [{ type: 'draw' }])).status, 400);
    assert.equal(app.getTable().getState().revision, revision);
    assert.equal(JSON.parse(readFileSync(session + '.game.json')).postgame.players.length, 2);
  } finally {
    if (app?.server.listening) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
