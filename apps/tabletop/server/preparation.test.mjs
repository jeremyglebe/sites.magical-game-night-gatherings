import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreparation, observePreparation, applyPreparation } from './preparation.mjs';
import { createTable, observe, applyActions, cardDetails, eventsSince } from './table.mjs';

const setup = () => ({
  preparation: { kind: 'jumpstart', source: 'zombies-vs-plants-v0.1' },
  players: [{ id: 'plant', faction: 'plants' }, { id: 'zombie', faction: 'zombies' }],
});
const ids = (state, faction) => state.preparation.packets.filter(p => p.faction === faction).slice(0, 2).map(p => p.id);
const act = (state, actor, ...actions) => applyActions(state, actor, state.revision, actions, 'Preparation test');
const pick = (state, actor, faction) => act(state, actor, { type: 'select_packets', packetIds: ids(state, faction) });

test('a boxed preparation pins eight full twenty-card packets and starts with no decks', () => {
  const state = createTable(setup());
  assert.equal(state.preparation.status, 'selecting');
  assert.equal(state.preparation.currentPlayer, 'plant');
  assert.equal(state.preparation.packets.length, 8);
  assert.equal(state.turn.phase, 'Pack selection');
  assert.equal(state.turn.priority, 'plant');
  assert.deepEqual(state.cards, {});
  assert.ok(Object.values(state.zones).every(zone => zone.cards.length === 0));
  for (const packet of state.preparation.packets) {
    assert.equal(packet.cards.reduce((sum, c) => sum + c.count, 0), 20);
    assert.ok(packet.cards.every(c => c.name && typeof c.oracle_text === 'string' && c.type_line && c.scryfall_id));
  }
  const view = observe(state, 'plant');
  assert.equal(view.preparation.packets.filter(p => p.cards).length, 4);
  assert.equal(observe(state).preparation.packets.filter(p => p.cards).length, 8);
  view.preparation.packets[0].cards[0].name = 'caller mutation';
  assert.notEqual(state.preparation.packets[0].cards[0].name, 'caller mutation');
  assert.equal(Object.hasOwn(view.preparation, 'decks'), false);
});

test('source, seat count and opposing factions are validated without weakening ordinary deck setup', () => {
  assert.equal(createPreparation({ players: [] }), null);
  assert.throws(() => createTable({ players: [{ id: 'p' }] }), /Supply a deck/);
  assert.throws(() => createTable({ players: [{ id: 'p', deck: [] }] }), /Supply a deck/);
  const input = setup();
  input.preparation.source = '../../secret.json';
  assert.throws(() => createTable(input), /Unknown preparation source/);
  input.preparation.source = 'zombies-vs-plants-v0.1';
  input.preparation.kind = 'draft';
  assert.throws(() => createTable(input), /Unsupported preparation kind/);
  input.preparation.kind = 'jumpstart';
  input.players[1].faction = 'plants';
  assert.throws(() => createTable(input), /one Plants player and one Zombies player/);
  input.players.pop();
  assert.throws(() => createTable(input), /exactly two players/);
});

test('selection rejects wrong faction, duplicate, unknown and out-of-turn picks atomically', () => {
  const state = createTable(setup());
  const original = structuredClone(state);
  const plant = ids(state, 'plants'), zombie = ids(state, 'zombies');
  for (const [actor, packetIds, pattern] of [
    ['zombie', zombie, /selection turn/],
    ['plant', zombie, /assigned faction/],
    ['plant', [plant[0], plant[0]], /two distinct/],
    ['plant', [plant[0]], /two distinct/],
    ['plant', [plant[0], 'missing'], /assigned faction/],
  ]) {
    assert.throws(() => act(state, actor, { type: 'say', text: 'This must roll back' }, { type: 'select_packets', packetIds }), pattern);
    assert.deepEqual(state, original);
  }
  assert.throws(() => act(state, 'plant', { type: 'select_packets', packetIds: plant }, { type: 'say', text: 'Late speech' }), /handoff must be the last/i);
  const next = pick(state, 'plant', 'plants');
  assert.equal(next.preparation.currentPlayer, 'zombie');
  assert.equal(next.preparation.players[0].ready, true);
  assert.equal(Object.keys(next.cards).length, 0, 'the first pick does not initialize either library');
  assert.throws(() => applyActions(next, 'zombie', state.revision, [{ type: 'select_packets', packetIds: zombie }], 'Stale pick'), /Table changed/);
  assert.throws(() => pick(next, 'plant', 'plants'), /selection turn/);
});

test('only speech and notes may bypass selection; gameplay cannot manufacture decks or skip readiness', () => {
  let state = createTable(setup());
  state = act(state, 'plant', { type: 'say', text: 'I am choosing my packets.' }, { type: 'note', text: 'A test matchup' });
  for (const action of [
    { type: 'draw', count: 7 }, { type: 'turn', set: { phase: 'Main 1' } },
    { type: 'pass', next: 'zombie' }, { type: 'pass_turn', next: 'zombie' },
    { type: 'token', definition: { name: 'Forbidden' } }, { type: 'result', winners: ['plant'] },
    { type: 'zone', id: 'pool', visibility: 'public' },
  ]) assert.throws(() => act(state, 'plant', action), /Choose packets before/);
  assert.deepEqual(state.cards, {});
  assert.equal(state.preparation.status, 'selecting');
});

test('both choices install exactly the selected forty-card libraries once and preserve secrecy', () => {
  let state = pick(createTable(setup()), 'plant', 'plants');
  const chosenZombie = ids(state, 'zombies');
  state = act(state, 'zombie', { type: 'select_packets', packetIds: chosenZombie, message: 'My two packets are ready.' });
  assert.equal(state.preparation.status, 'complete');
  assert.equal(state.preparation.currentPlayer, null);
  assert.deepEqual(state.turn, { number: 1, active: 'plant', priority: 'plant', phase: 'Setup', counts: { plant: 0, zombie: 0 }, totalTurns: 0, countsComplete: true });
  assert.equal(Object.keys(state.cards).length, 80);
  for (const p of state.players) {
    const library = state.zones[p.id + ':library'].cards;
    assert.equal(library.length, 40);
    assert.ok(library.every(id => state.cards[id].owner === p.id && state.cards[id].token === false));
    const expected = state.preparation.decks[p.id].flatMap(c => Array(c.count).fill(c.name)).sort();
    assert.deepEqual(library.map(id => state.cards[id].definition.name).sort(), expected);
    for (const actor of [null, 'plant', 'zombie']) {
      const view = observe(state, actor);
      assert.equal(view.zones[p.id + ':library'].count, 40);
      assert.deepEqual(view.zones[p.id + ':library'].cards, []);
      assert.equal(Object.hasOwn(view.preparation, 'decks'), false);
      assert.ok(view.preparation.packets.every(packet => !Object.hasOwn(packet, 'cards')));
      assert.doesNotMatch(JSON.stringify(view.preparation), /oracle_text|rulings_cache/);
      assert.ok(library.every(id => !JSON.stringify(view).includes(id)));
      assert.throws(() => cardDetails(state, actor, library[0]), /not available/);
    }
  }
  const last = eventsSince(state, 'plant').events.at(-1);
  assert.equal(last.changes[0].type, 'select_packets');
  assert.equal(last.changes[0].next, 'plant');
  assert.equal(last.changes[0].message, 'My two packets are ready.');
  const saved = structuredClone(state);
  assert.throws(() => pick(state, 'zombie', 'zombies'), /not pending/);
  assert.deepEqual(state, saved, 'repeat submission neither duplicates nor reshuffles decks');
  state = act(state, 'plant', { type: 'draw', count: 7 });
  assert.equal(observe(state, 'plant').zones['plant:hand'].cards.length, 7);
  assert.equal(observe(state, 'zombie').zones['plant:hand'].cards.length, 0);
});

test('the pinned state is resumable without rereading the packet source and views cannot mutate it', () => {
  const initial = createPreparation(setup());
  const first = applyPreparation(initial, 'plant', { type: 'select_packets', packetIds: initial.packets.filter(p => p.faction === 'plants').slice(0, 2).map(p => p.id) });
  assert.equal(initial.players[0].ready, false);
  const resumed = JSON.parse(JSON.stringify(first.preparation));
  resumed.source = 'historical-source-no-longer-on-disk';
  const second = applyPreparation(resumed, 'zombie', { type: 'select_packets', packetIds: resumed.packets.filter(p => p.faction === 'zombies').slice(0, 2).map(p => p.id) });
  assert.equal(second.preparation.status, 'complete');
  assert.equal(second.nextPlayer, 'plant');
  assert.equal(second.decks.zombie.reduce((sum, c) => sum + c.count, 0), 40);
  const view = observePreparation(second.preparation, null);
  assert.equal(view.source, 'historical-source-no-longer-on-disk');
  assert.equal(view.decks, undefined);
  assert.throws(() => observePreparation(second.preparation, 'outsider'), /Unknown preparation player/);
});
