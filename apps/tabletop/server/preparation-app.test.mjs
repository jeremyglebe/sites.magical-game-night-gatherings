import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApp, normalizeSetup, defaultPreparation } from './app.mjs';
import { applyActions } from './table.mjs';
import { appendRecording } from './game-log.mjs';

const setup = (ai = false) => ({ title: 'Jumpstart selection test',
  preparation: { kind: 'jumpstart', source: 'zombies-vs-plants-v0.1' },
  players: [{ id: 'p1', name: 'Garden', faction: 'plants', ai }, { id: 'p2', name: 'Graveyard', faction: 'zombies', ai }],
});
const selected = { p1: ['ZP-P1', 'ZP-P2'], p2: ['ZP-Z1', 'ZP-Z2'] };
const start = options => startApp({ port: 0, readPlanUsage: null, runPlayerFactory: () => async () => { throw new Error('No real worker should run'); }, ...options });
const post = async (app, path, body) => {
  const response = await fetch(app.url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
};
const tick = () => new Promise(resolve => setImmediate(resolve));

test('normalizing a Jumpstart match does not preload unrelated preconstructed decks', () => {
  const config = normalizeSetup(setup());
  assert.ok(config.players.every(p => p.deck.length === 0 && p.deckPreset === null));
  assert.ok(config.references.includes('boxed-sets/zombies-vs-plants-jumpstart.md'));
  const defaults = normalizeSetup({ players: [{ id: 'one' }, { id: 'two' }] });
  assert.deepEqual(defaults.preparation, defaultPreparation);
  assert.deepEqual(defaults.players.map(p => p.faction), ['plants', 'zombies']);
  assert.ok(defaults.players.every(p => p.deck.length === 0));
});

test('retired presets cannot silently replace custom decks or choose unrelated cards', () => {
  for (const players of [
    [{ id: 'one' }],
    [{ id: 'one', deckPreset: 'white' }, { id: 'two', deckPreset: 'green' }],
    [{ id: 'one', deck: [{ name: 'Forest' }] }, { id: 'two' }],
  ]) assert.throws(() => normalizeSetup({ players }), /Choose a Jumpstart boxed set or supply a deck array/);
  const custom = normalizeSetup({ players: [{ id: 'one', deck: [{ name: 'Forest', count: 40 }], deckPreset: 'green' }] });
  assert.equal(custom.preparation, undefined);
  assert.deepEqual(custom.players[0].deck, [{ name: 'Forest', count: 40 }]);
  assert.equal(custom.players[0].deckPreset, null);
});

test('human choices are gated, survive restart, and construct libraries before normal setup', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'jumpstart-app-'));
  let app;
  try {
    app = await start({ directory, setup: setup() });
    assert.deepEqual(app.appState().presets, []);
    assert.deepEqual(app.appState().defaultPreparation, defaultPreparation);
    const matchId = app.appState().match.id;
    assert.equal(app.appState().match.phase, 'preparation');
    assert.equal(app.getCoordinator().status().pendingRecipient.playerId, 'p1');
    const act = (playerId, packetIds, revision = app.getTable().getState().revision) => post(app, '/api/human/act', {
      matchId, playerId, revision, actions: [{ type: 'select_packets', packetIds }],
    });
    assert.equal((await act('p2', selected.p2)).status, 400, 'second seat waits');
    assert.equal((await act('p1', ['ZP-P1', 'ZP-Z1'])).status, 400, 'faction guard');
    assert.equal(app.getTable().getState().revision, 0);
    assert.equal((await act('p1', selected.p1)).status, 200);
    assert.equal(app.getTable().getState().zones['p1:library'].cards.length, 0, 'no gameplay until both choose');
    assert.equal(app.getCoordinator().status().pendingRecipient.playerId, 'p2');
    await app.close();
    app = await start({ directory });
    assert.equal(app.getTable().getState().preparation.players.find(p => p.id === 'p1').ready, true);
    assert.equal(app.getCoordinator().status().pendingRecipient.playerId, 'p2');
    assert.equal((await act('p2', selected.p2, 0)).status, 400, 'stale choices rejected');
    assert.equal((await act('p2', selected.p2)).status, 200);
    const state = app.getTable().getState();
    assert.equal(state.preparation.status, 'complete');
    assert.equal(state.turn.phase, 'Setup');
    for (const id of ['p1', 'p2']) {
      assert.equal(state.zones[`${id}:library`].cards.length, 40);
      assert.equal(state.zones[`${id}:hand`].cards.length, 0);
    }
    assert.equal(app.getCoordinator().status().pendingRecipient.kind, 'setup');
    assert.equal(app.getCoordinator().status().pendingRecipient.playerId, 'p1');
    const again = await act('p1', selected.p1);
    assert.equal(again.status, 400);
    assert.equal(app.getTable().getState().revision, state.revision, 'no duplicate deck installation');
    const human = await (await fetch(app.url + `/api/human?matchId=${matchId}&playerId=p1`)).json();
    assert.equal(human.canAct, true);
    assert.equal(human.table.zones['p1:library'].cards.length, 0, 'shuffled identities remain hidden');
    assert.equal(human.table.zones['p1:library'].count, 40);
  } finally { if (app?.server.listening) await app.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('separate AI decisions select serially then wake the first player for opening setup', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'jumpstart-ai-'));
  const jobs = [];
  let active = 0, maximum = 0, app;
  try {
    app = await start({ directory, setup: setup(true), runPlayerFactory: ({ getConnection }) => async job => {
      active++; maximum = Math.max(maximum, active);
      try {
        jobs.push({ player: job.player.id, phase: job.phase, kind: job.wake.kind });
        const connection = getConnection(job.player.id);
        const selecting = job.phase === 'preparation';
        const response = await fetch(connection.url + (selecting ? '/api/act' : '/api/decision'), {
          method: 'POST', headers: { Authorization: `Bearer ${connection.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(selecting ? { revision: job.revision, decision_id: job.decisionId, reason: 'Choose themes',
            actions: [{ type: 'select_packets', packetIds: selected[job.player.id], message: 'I choose these themes.' }] }
            : { decision_id: job.decisionId, status: 'needs_help', note: 'Stop fixture before playing' }),
        });
        const result = await response.json();
        assert.equal(response.status, 200, JSON.stringify(result));
        assert.equal(result.decision_completed, true);
        return { sessionId: `independent-${job.player.id}` };
      } finally { active--; }
    } });
    app.getCoordinator().start();
    for (let i = 0; i < 1000 && (jobs.length < 3 || app.getCoordinator().status().active); i++) await new Promise(r => setTimeout(r, 2));
    assert.deepEqual(jobs, [
      { player: 'p1', phase: 'preparation', kind: 'preparation' },
      { player: 'p2', phase: 'preparation', kind: 'preparation' },
      { player: 'p1', phase: 'game', kind: 'setup' },
    ]);
    assert.equal(maximum, 1);
    assert.equal(app.getTable().getState().preparation.status, 'complete');
    assert.equal(app.getCoordinator().status().mode, 'paused');
  } finally { if (app?.server.listening) await app.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('a selection committed just before a crash recovers its next recipient', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'jumpstart-recovery-'));
  let app;
  try {
    app = await start({ directory, setup: setup() });
    const session = app.appState().match.session;
    await app.close();
    const saved = JSON.parse(readFileSync(session, 'utf8'));
    const next = applyActions(saved.state, 'p1', saved.state.revision, [{ type: 'select_packets', packetIds: selected.p1 }], 'Crash boundary fixture');
    saved.recording = appendRecording(saved.recording, saved.state, next);
    saved.state = next;
    writeFileSync(session, JSON.stringify(saved));
    app = await start({ directory });
    assert.equal(app.getCoordinator().status().pendingRecipient.playerId, 'p2');
    assert.equal(app.getCoordinator().status().pendingRecipient.kind, 'preparation');
    assert.equal(app.getTable().getState().preparation.players.find(p => p.id === 'p1').ready, true);
  } finally { if (app?.server.listening) await app.close(); rmSync(directory, { recursive: true, force: true }); }
});
