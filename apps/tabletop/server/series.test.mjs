import test from 'node:test';
import assert from 'node:assert/strict';
import { createTable, applyActions, observe, eventsSince, sideboardingView } from './table.mjs';

function setup(series = { mode: 'first_to', winsRequired: 2, sideboarding: true }) {
  return { shuffle: false, series, players: ['p1', 'p2'].map((id, index) => ({
    id, life: index ? 25 : 20,
    deck: [{ name: `${id} main creature`, type_line: 'Creature', count: 2 }, { name: `${id} land`, type_line: 'Land', count: 3 }],
    sideboard: [{ name: `${id} reserve`, type_line: 'Instant', count: 2 }],
  })) };
}
const act = (state, actor, ...actions) => applyActions(state, actor, state.revision, actions, 'Match procedure test');
const result = (state, winners) => act(state, 'p1', { type: 'result', winners });
const ready = (state, actor, extra = {}) => act(state, actor, { type: 'ready_next_game', ...extra });
const nextGame = state => ready(ready(state, 'p1'), 'p2');

test('single-game tables stay compatible and explicit sideboards are private', () => {
  for (const setting of [null, { mode: 'single' }]) {
    const state = createTable(setup(setting));
    assert.equal(state.series, undefined);
    assert.equal(observe(state).series, undefined);
    assert.equal(state.zones['p1:sideboard'].cards.length, 2);
    assert.equal(observe(state, 'p1').zones['p1:sideboard'].cards[0].name, 'p1 reserve');
    assert.deepEqual(observe(state, 'p2').zones['p1:sideboard'].cards, []);
    assert.equal(sideboardingView(state, 'p1').available, false);
    assert.throws(() => ready(state, 'p1'), /no next game/);
  }
  const config = setup();
  delete config.series;
  const state = createTable(config);
  assert.equal(state.series, undefined);
});

test('match settings reject invalid win targets and caps', () => {
  for (const series of [false, [], { mode: 'mystery' }, { mode: 'first_to', winsRequired: 0 },
    { mode: 'first_to', winsRequired: 1.5 }, { mode: 'best_of', winsRequired: 3, maxGames: 2 },
    { mode: 'best_of', winsRequired: 2 }, { mode: 'first_to', winsRequired: 2, sideboarding: 'yes' }]) {
    assert.throws(() => createTable(setup(series)));
  }
  const config = setup();
  config.players[0].sideboard = 'not a card list';
  assert.throws(() => createTable(config), /sideboard cards/);
  assert.throws(() => createTable(setup({ mode: 'first_to', winsRequired: 2, resetTo: 'mystery' })), /reset destination/);
  assert.throws(() => createTable(setup({ mode: 'first_to', winsRequired: 2, resetTo: 'preparation' })), /configured preparation/);
});

test('first-to records each game once, keeps draws scoreless, and completes at the target', () => {
  let state = result(createTable(setup()), []);
  assert.deepEqual(state.series.scores, { p1: 0, p2: 0 });
  assert.equal(state.series.status, 'between_games');
  assert.equal(state.series.games[0].endedRevision, state.revision);
  assert.throws(() => result(state, ['p1']), /Prepare the next game/);
  state = nextGame(state);
  assert.equal(state.series.gameNumber, 2);
  assert.equal(state.result, null);
  state = result(state, ['p1', 'p1']);
  assert.deepEqual(state.series.scores, { p1: 1, p2: 0 });
  state = nextGame(state);
  state = result(state, ['p1']);
  assert.equal(state.series.status, 'complete');
  assert.deepEqual(state.series.result.winners, ['p1']);
  assert.deepEqual(state.series.games.map(game => game.number), [1, 2, 3]);
  assert.deepEqual(state.series.scores, { p1: 2, p2: 0 });
  assert.throws(() => ready(state, 'p1'), /ended/);
});

test('best-of can end early, and its game cap resolves a leader or a tied match', () => {
  const config = setup({ mode: 'best_of', winsRequired: 2, maxGames: 3 });
  let early = result(createTable(config), ['p2']);
  early = result(nextGame(early), ['p2']);
  assert.equal(early.series.games.length, 2);
  assert.deepEqual(early.series.result.winners, ['p2']);
  let tied = result(createTable(config), ['p1']);
  tied = result(nextGame(tied), ['p2']);
  tied = result(nextGame(tied), []);
  assert.equal(tied.series.status, 'complete');
  assert.deepEqual(tied.series.result.winners, []);
  let leader = result(createTable(config), ['p2']);
  leader = result(nextGame(leader), []);
  leader = result(nextGame(leader), []);
  assert.deepEqual(leader.series.result.winners, ['p2']);
});

test('shared game winners each receive a win without enforcing a player ceiling', () => {
  const config = setup({ mode: 'first_to', winsRequired: 1 });
  for (let i = 3; i <= 12; i++) config.players.push({ id: `p${i}`, deck: [{ name: `Deck ${i}` }] });
  const state = result(createTable(config), ['p2', 'p12']);
  assert.equal(state.players.length, 12);
  assert.equal(state.series.scores.p2, 1);
  assert.equal(state.series.scores.p12, 1);
  assert.deepEqual(state.series.result.winners, ['p2', 'p12']);
});

test('sideboarding conserves the submitted pool and never exposes an opponent inventory', () => {
  let state = result(createTable(setup()), ['p1']);
  const before = structuredClone(state);
  const own = sideboardingView(state, 'p1');
  const creature = own.cards.find(card => card.definition.name === 'p1 main creature');
  const reserve = own.cards.find(card => card.definition.name === 'p1 reserve');
  const allocation = own.cards.map(card => ({ id: card.id, count: card.main }));
  allocation.find(card => card.id === creature.id).count--;
  allocation.find(card => card.id === reserve.id).count++;
  assert.equal(own.canEdit, true);
  assert.equal(sideboardingView(state, 'p2').canEdit, false);
  assert.throws(() => act(state, 'p2', { type: 'sideboard', main: allocation }), /preparation turn/);
  assert.throws(() => act(state, 'p1', { type: 'sideboard', main: [{ id: reserve.id, count: 6 }] }), /Invalid main/);
  assert.throws(() => act(state, 'p1', { type: 'sideboard', main: [{ id: reserve.id, count: 1 }] }), /exactly 5/);
  const otherId = sideboardingView(state, 'p2').cards[0].id;
  assert.throws(() => act(state, 'p1', { type: 'sideboard', main: [{ id: otherId, count: 1 }] }), /not in your submitted/);
  assert.deepEqual(state, before);
  state = act(state, 'p1', { type: 'sideboard', main: allocation });
  assert.equal(sideboardingView(state, 'p1').cards.find(card => card.id === reserve.id).main, 1);
  for (const seat of ['p2', null]) {
    const view = observe(state, seat);
    assert.equal(view.series.rosters, undefined);
    assert.doesNotMatch(JSON.stringify(view), /p1 reserve|p1 main creature/);
    assert.ok(!JSON.stringify(eventsSince(state, seat)).includes(reserve.id));
  }
  assert.ok(!JSON.stringify(sideboardingView(state, 'p2')).includes('p1 reserve'));
  state = ready(state, 'p1');
  assert.throws(() => act(state, 'p1', { type: 'sideboard', main: allocation }), /preparation turn/);
  state = ready(state, 'p2');
  const mainNames = state.zones['p1:library'].cards.map(id => state.cards[id].definition.name);
  assert.equal(mainNames.filter(name => name === 'p1 reserve').length, 1);
  assert.equal(mainNames.filter(name => name === 'p1 main creature').length, 1);
  assert.equal(state.zones['p1:sideboard'].cards.length, 2);
  assert.ok(state.series.rosters.p1.cards.every(card => card.main <= card.total));
});

test('a reset removes transient state, restores ownership and life, and changes every live handle', () => {
  let state = createTable(setup());
  state = act(state, 'p1', { type: 'draw', count: 1 });
  const creatureId = state.zones['p1:hand'].cards[0];
  state = act(state, 'p1',
    { type: 'move', card: creatureId, to: 'battlefield' },
    { type: 'card', card: creatureId, set: { controller: 'p2', tapped: true, damage: 4, counters: { '+1/+1': 2 }, note: 'Temporary effect' } },
    { type: 'player', player: 'p1', set: { life: 0, status: 'eliminated', mana: { G: 5 }, counters: { poison: 10 }, note: 'Transient' } },
    { type: 'zone', id: 'temporary', owner: 'p1', visibility: 'owner' },
    { type: 'token', definition: { name: 'Generated token' } },
    { type: 'stack_item', definition: { name: 'Generated ability' } },
    { type: 'turn', set: { number: 23, active: 'p2', phase: 'End' } },
    { type: 'note', text: 'Old board note' });
  const oldIds = new Set(Object.keys(state.cards));
  const previousEvents = state.events.length;
  state = result(state, ['p2']);
  state = ready(state, 'p1', { starting_player: 'p1', message: 'I will start next game.' });
  assert.equal(state.result.winners[0], 'p2');
  state = ready(state, 'p2', { message: 'Ready.' });
  assert.equal(state.series.gameNumber, 2);
  assert.equal(state.result, null);
  assert.deepEqual(state.turn, { number: 1, active: 'p1', priority: 'p1', phase: 'Setup', counts: { p1: 0, p2: 0 }, totalTurns: 0, countsComplete: true });
  assert.equal(state.zones.temporary, undefined);
  assert.equal(state.zones.battlefield.cards.length, 0);
  assert.equal(state.zones.stack.cards.length, 0);
  assert.equal(Object.keys(state.cards).length, 14);
  assert.ok(Object.keys(state.cards).every(id => !oldIds.has(id)));
  assert.ok(Object.values(state.cards).every(card => card.controller === card.owner
    && !card.tapped && card.damage === 0 && !card.note && Object.keys(card.counters).length === 0));
  assert.deepEqual(state.players.map(p => [p.life, p.status, p.mana, p.counters, p.note]),
    [[20, 'active', {}, {}, ''], [25, 'active', {}, {}, '']]);
  assert.ok(!state.notes.some(note => note.text === 'Old board note'));
  assert.equal(state.events.length, previousEvents + 3);
  const change = observe(state).events.at(-1).changes[0];
  assert.equal(change.game_started, true);
  assert.equal(change.game_number, 2);
  assert.equal(change.next, 'p1');
  assert.equal(change.series.rosters, undefined);
});

test('readiness is sequential, revision guarded, terminal, and survives JSON restoration', () => {
  let state = result(createTable(setup()), ['p1']);
  assert.throws(() => act(state, 'p1', { type: 'draw' }), /Prepare the next game/);
  assert.throws(() => ready(state, 'p2'), /preparation turn/);
  const previousRevision = state.revision;
  state = ready(state, 'p1');
  state = JSON.parse(JSON.stringify(state));
  assert.throws(() => ready(state, 'p1'), /preparation turn/);
  assert.throws(() => applyActions(state, 'p1', previousRevision, [{ type: 'ready_next_game' }], 'Stale'), /Table changed/);
  assert.throws(() => ready(state, 'p2', { starting_player: 'p1' }), /Only the first/);
  assert.throws(() => act(state, 'p2', { type: 'ready_next_game' }, { type: 'draw' }), /last action/);
  state = ready(state, 'p2');
  assert.equal(state.turn.active, 'p2', 'starter rotates from game-one starter, not the final active turn');
  assert.throws(() => ready(state, 'p2'), /no next game/);
  assert.throws(() => act(state, 'p1', { type: 'result', winners: ['p1'] }, { type: 'say', text: 'Too late' }), /last action/);
});

test('disabled sideboarding still resets original decks and permits no card exchanges', () => {
  let state = result(createTable(setup({ mode: 'first_to', winsRequired: 2, sideboarding: false })), ['p1']);
  const view = sideboardingView(state, 'p1');
  assert.equal(view.canEdit, false);
  assert.throws(() => act(state, 'p1', { type: 'sideboard', main: view.cards.map(card => ({ id: card.id, count: card.main })) }), /not enabled/);
  state = nextGame(state);
  assert.ok(state.zones['p1:library'].cards.every(id => !state.cards[id].definition.name.includes('reserve')));
});

test('Jumpstart pins only selected packets and reuses them without another draft', () => {
  let state = createTable({
    series: { mode: 'first_to', winsRequired: 2 },
    preparation: { kind: 'jumpstart', source: 'zombies-vs-plants-v0.1' },
    players: [{ id: 'p1', faction: 'plants' }, { id: 'p2', faction: 'zombies' }],
  });
  assert.deepEqual(state.series.rosters.p1.cards, []);
  state = act(state, 'p1', { type: 'select_packets', packetIds: ['ZP-P1', 'ZP-P2'] });
  state = act(state, 'p2', { type: 'select_packets', packetIds: ['ZP-Z1', 'ZP-Z2'] });
  const originalDeck = state.zones['p1:library'].cards.map(id => state.cards[id].definition.name).sort();
  assert.equal(state.series.rosters.p1.mainSize, 40);
  assert.equal(state.series.rosters.p1.cards.reduce((sum, card) => sum + card.total, 0), 40);
  state = nextGame(result(state, ['p1']));
  assert.equal(state.preparation.status, 'complete');
  assert.deepEqual(state.preparation.players[0].selectedPacketIds, ['ZP-P1', 'ZP-P2']);
  assert.deepEqual(state.zones['p1:library'].cards.map(id => state.cards[id].definition.name).sort(), originalDeck);
  assert.equal(state.zones['p1:sideboard'].cards.length, 0);
  assert.equal(state.series.gameNumber, 2);
});

test('return-to-preparation clears the old decks and lets each seat pick new packs with the score retained', () => {
  const config = {
    series: { mode: 'first_to', winsRequired: 3, resetTo: 'preparation' },
    preparation: { kind: 'jumpstart', source: 'zombies-vs-plants-v0.1' },
    players: [{ id: 'p1', faction: 'plants' }, { id: 'p2', faction: 'zombies' }],
  };
  assert.throws(() => createTable({ ...config, series: { ...config.series, sideboarding: true } }), /either rebuilding decks or sideboarding/);
  let state = createTable(config);
  state = act(state, 'p1', { type: 'select_packets', packetIds: ['ZP-P1', 'ZP-P2'] });
  state = act(state, 'p2', { type: 'select_packets', packetIds: ['ZP-Z1', 'ZP-Z2'] });
  const oldPools = new Set(state.series.rosters.p1.cards.map(card => card.id));
  const oldCards = new Set(Object.keys(state.cards));
  state = result(state, ['p1']);
  assert.equal(sideboardingView(state, 'p1').canEdit, false);
  state = nextGame(state);
  assert.equal(state.series.gameNumber, 2);
  assert.deepEqual(state.series.scores, { p1: 1, p2: 0 });
  assert.equal(state.series.games.length, 1);
  assert.equal(state.result, null);
  assert.equal(state.preparation.status, 'selecting');
  assert.equal(state.preparation.currentPlayer, 'p1');
  assert.equal(state.turn.priority, 'p1');
  assert.equal(state.turn.phase, 'Pack selection');
  assert.deepEqual(state.preparation.players.map(p => p.selectedPacketIds), [[], []]);
  assert.ok(state.preparation.players.every(p => !p.ready));
  assert.equal(state.preparation.decks, null);
  assert.equal(Object.keys(state.cards).length, 0);
  assert.ok(Object.values(state.zones).every(zone => zone.cards.length === 0));
  assert.equal(state.series.rosters.p1.mainSize, 0);
  assert.deepEqual(state.series.rosters.p1.cards, []);
  assert.equal(observe(state).series.resetTo, 'preparation');
  assert.equal(observe(state).events.at(-1).changes[0].next, 'p1');
  assert.throws(() => act(state, 'p1', { type: 'draw' }), /Choose packets/);
  state = act(state, 'p1', { type: 'select_packets', packetIds: ['ZP-P3', 'ZP-P4'] });
  state = act(state, 'p2', { type: 'select_packets', packetIds: ['ZP-Z3', 'ZP-Z4'] });
  assert.equal(state.preparation.status, 'complete');
  assert.equal(state.turn.active, 'p2', 'selected next starter is retained across pack selection');
  assert.equal(state.turn.priority, 'p2');
  assert.equal(state.turn.phase, 'Setup');
  assert.deepEqual(state.preparation.players[0].selectedPacketIds, ['ZP-P3', 'ZP-P4']);
  assert.equal(state.zones['p1:library'].cards.length, 40);
  assert.equal(state.series.rosters.p1.mainSize, 40);
  assert.ok(state.series.rosters.p1.cards.every(card => !oldPools.has(card.id)));
  assert.ok(Object.keys(state.cards).every(id => !oldCards.has(id)));
  assert.deepEqual(state.series.scores, { p1: 1, p2: 0 });
});
