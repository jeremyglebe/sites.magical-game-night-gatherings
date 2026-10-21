import test from 'node:test';
import assert from 'node:assert/strict';
import { createTable, applyActions } from './table.mjs';
import { createRecording, appendRecording } from './game-log.mjs';
import { createReplay, startingDecks, conversationEvents, validateRecording } from '../shared/replay.mjs';

const setup = () => ({
  shuffle: false,
  players: ['one', 'two'].map(id => ({
    id, name: id === 'one' ? 'Alice' : 'Bob',
    deck: [{ name: `Hidden ${id}`, count: 3 }, { name: 'Other', count: 2 }],
  })),
});
const snapshot = state => {
  const { events, ...rest } = state;
  return structuredClone(rest);
};
function fixture(config = setup()) {
  let state = createTable(config);
  let recording = createRecording(state, config);
  const states = [snapshot(state)];
  return {
    get state() { return state; }, get recording() { return recording; }, states,
    act(actor, actions) {
      const next = applyActions(state, actor, state.revision, actions, 'Private decision reasoning');
      recording = appendRecording(recording, state, next);
      state = next;
      states.push(snapshot(state));
      return state;
    },
  };
}

test('replay seeks exact recorded shuffles, concealed IDs and corrections in either direction', () => {
  const game = fixture();
  game.act('one', [{ type: 'shuffle' }, { type: 'draw', count: 2 }]);
  game.act('one', [{ type: 'move', card: game.state.zones['one:hand'].cards[0], to: 'battlefield' }]);
  game.act('one', [{ type: 'card', card: game.state.zones.battlefield.cards[0], set: { tapped: true, counters: { charge: 2 } } }]);
  game.act('one', [{ type: 'move', card: game.state.zones.battlefield.cards[0], to: 'one:library' }]);
  game.act('one', [{ type: 'shuffle' }, { type: 'draw' }]);
  game.act('one', [{ type: 'token', count: 2, definition: { name: 'Goblin', type_line: 'Token Creature — Goblin' } }]);
  game.act('one', [{ type: 'remove_token', card: game.state.zones.battlefield.cards[0] }]);
  game.act('one', [{ type: 'stack_item', definition: { name: 'Triggered ability' } }]);
  game.act('one', [{ type: 'remove_stack_item', card: game.state.zones.stack.cards[0] }]);
  game.act('one', [{ type: 'pass_turn', next: 'two', message: 'Your turn.' }]);
  game.act('two', [{ type: 'player', set: { life: 8, status: 'eliminated' } }]);
  game.act('one', [{ type: 'player', player: 'two', set: { status: 'active' } }]);
  for (let i = 0; i < 65; i++) game.act('one', [{ type: 'turn', set: { number: i + 3, phase: i % 2 ? 'Main 1' : 'Untap' } }]);
  game.act('one', [{ type: 'result', winners: ['one'], explanation: 'Bob conceded.' }]);
  const saved = JSON.parse(JSON.stringify(game.recording));
  const replay = createReplay(saved);
  assert.equal(replay.length, game.states.length - 1);
  const positions = [0, replay.length, 1, 51, 25, 26, 50, 24, 77, 4, 3, 78, 0];
  let seed = 19;
  for (let i = 0; i < 60; i++) {
    seed = (seed * 16807) % 2147483647;
    positions.push(seed % game.states.length);
  }
  for (const position of positions) assert.deepEqual(replay.stateAt(position), game.states[position], `position ${position}`);
  assert.deepEqual(replay.stateAt(4).zones['one:library'].cards, game.states[4].zones['one:library'].cards);
  assert.deepEqual(replay.stateAt(replay.length).result.winners, ['one']);
});

test('replay owns its snapshots and deltas and does not execute recorded action requests', () => {
  const game = fixture();
  game.act('one', [{ type: 'draw' }]);
  const saved = structuredClone(game.recording);
  // Replaying only needs authoritative deltas, even if an old action cannot
  // be executed by today's engine (or asks for a different random outcome).
  saved.frames[0].event.actions = [{ type: 'unsupported-action-from-old-version' }];
  const before = structuredClone(saved);
  const replay = createReplay(saved);
  assert.deepEqual(replay.stateAt(1), game.states[1]);
  assert.deepEqual(saved, before);
  const first = replay.stateAt(0);
  first.players[0].name = 'Changed externally';
  first.zones['one:library'].cards.length = 0;
  const last = replay.stateAt(1);
  last.players[0].life = -500;
  last.cards[last.zones['one:hand'].cards[0]].definition.name = 'Changed externally';
  saved.initial.players[0].life = 900;
  saved.frames[0].delta.zones.set['one:hand'].cards.length = 0;
  assert.deepEqual(replay.stateAt(0), game.states[0]);
  assert.deepEqual(replay.stateAt(1), game.states[1]);
});

test('recording validation and position boundaries fail clearly without partial replay', () => {
  const saved = fixture().recording;
  assert.equal(validateRecording(saved), saved);
  const replay = createReplay(saved);
  assert.deepEqual(replay.stateAt(0), saved.initial);
  for (const position of [-1, 1, 0.5, NaN, Infinity, '0', undefined]) assert.throws(() => replay.stateAt(position), /outside/);
  assert.throws(() => createReplay({ ...saved, format: 'unknown' }), /not a Game Night/);
  assert.throws(() => createReplay({ ...saved, version: 2 }), /not supported/);
  assert.throws(() => createReplay({ ...saved, initial: null }), /starting position/);
  assert.throws(() => createReplay({ ...saved, frames: [{}] }), /incomplete/);
  const unsafe = structuredClone(saved);
  unsafe.frames = [{ event: { revision: 1 }, delta: { cards: { set: JSON.parse('{"__proto__":{"polluted":true}}'), removed: [] } } }];
  assert.throws(() => createReplay(unsafe), /changes are invalid/);
  assert.equal({}.polluted, undefined);
});

test('starting decks preserve quantities, distinct printings, custom cards and full definitions', () => {
  const definition = {
    name: 'Island', scryfall_id: 'printing-a', image_url: 'https://cards.scryfall.io/island.jpg',
    oracle_text: '({T}: Add {U}.)', rulings: [{ source: 'wotc', published_at: '2026-10-20', comment: 'A recorded ruling.' }],
    rulings_cache: { status: 'fetched', fetched_at: '2026-10-20', source: 'Scryfall', uri: 'https://api.scryfall.com/cards/abcdef/rulings' },
  };
  const config = setup();
  config.players[0].deck = [
    { ...definition, count: 3 },
    { count: 2, ...Object.fromEntries(Object.entries(definition).reverse()) },
    { ...definition, scryfall_id: 'printing-b' },
    { name: 'Custom Golem', type_line: 'Artifact Creature — Golem', oracle_text: 'Custom rules.', token: true, count: 2 },
  ];
  const game = fixture(config);
  game.act('one', [{ type: 'draw', count: 3 }]);
  const before = structuredClone(game.recording);
  const decks = startingDecks(game.recording);
  assert.equal(decks[0].id, 'one');
  assert.equal(decks[0].name, 'Alice');
  assert.equal(decks[0].source, 'setup');
  assert.equal(decks[0].total, 8);
  assert.equal(decks[0].cards.length, 3);
  const island = decks[0].cards.find(card => card.definition.scryfall_id === 'printing-a');
  assert.equal(island.count, 5);
  assert.deepEqual(island.definition, definition);
  assert.equal(decks[0].cards.find(card => card.definition.name === 'Custom Golem').definition.token, true);
  island.definition.rulings[0].comment = 'External mutation';
  assert.deepEqual(game.recording, before);
});

test('legacy starting decks use ownership across every initial zone and disclose the incomplete origin', () => {
  const game = fixture();
  game.act('one', [{ type: 'draw', count: 3 }]);
  const hand = game.state.zones['one:hand'].cards;
  game.act('one', [{ type: 'move', card: hand[0], to: 'battlefield' }, { type: 'move', card: hand[1], to: 'one:graveyard' }]);
  const permanent = game.state.zones.battlefield.cards[0];
  game.act('one', [
    { type: 'card', card: permanent, set: { controller: 'two' } },
    { type: 'token', definition: { name: 'Earlier token' } },
    { type: 'stack_item', definition: { name: 'Not a deck card' } },
  ]);
  const late = createRecording(game.state);
  const decks = startingDecks(late);
  assert.equal(decks[0].total, 6);
  assert.equal(decks[1].total, 5);
  assert.equal(decks[0].source, 'initial-state');
  assert.match(decks[0].note, /first saved position/);
  assert.equal(decks[0].cards.find(card => card.definition.name === 'Earlier token').definition.token, true);
  assert.equal(decks[0].cards.some(card => card.definition.name === 'Not a deck card'), false);
  assert.equal(decks[0].cards.find(card => card.definition.name === 'Hidden one').count, 3);
  assert.doesNotThrow(() => startingDecks({ ...late, setup: { players: {} } }));
});

test('conversation preserves attributed speech and action order using public projections only', () => {
  const game = fixture();
  game.act('one', [
    { type: 'draw' },
    { type: 'say', text: 'I keep this hand.\nReady when you are.' },
    { type: 'pass', next: 'two', message: 'Any response?' },
  ]);
  game.act('two', [{ type: 'pass_turn', next: 'one', message: 'Your turn.' }]);
  const recording = structuredClone(game.recording);
  recording.frames[0].event.credentials = { token: 'Credential secret' };
  recording.frames[0].event.public.changes[0].private_reason = 'Private annotation';
  const before = structuredClone(recording);
  const events = conversationEvents(recording);
  assert.deepEqual(events.map(item => item.position), [1, 2]);
  assert.equal(events[0].event.actor, 'one');
  assert.equal(events[0].event.revision, 1);
  assert.equal(events[0].event.at, recording.frames[0].event.at);
  assert.deepEqual(events[0].event.changes.map(change => change.type), ['draw', 'say', 'pass']);
  assert.equal(events[0].event.changes[1].text, 'I keep this hand.\nReady when you are.');
  assert.equal(events[0].event.changes[2].message, 'Any response?');
  assert.equal(events[1].event.changes[0].message, 'Your turn.');
  assert.doesNotMatch(JSON.stringify(events), /Private decision reasoning|Credential secret|Private annotation|Hidden one|outcomes|seats/);
  events[0].event.changes[1].text = 'External mutation';
  assert.deepEqual(recording, before);
});

test('legacy conversation uses captured outcomes when present and avoids inventing draw identities', () => {
  const game = fixture();
  game.act('one', [{ type: 'shuffle' }, { type: 'draw' }, { type: 'say', text: 'I have drawn.' }]);
  const saved = structuredClone(game.recording);
  delete saved.frames[0].event.public;
  const outcome = saved.frames[0].event.outcomes[1].summary;
  assert.equal(conversationEvents(saved)[0].event.changes[1].summary, outcome);
  delete saved.frames[0].event.outcomes;
  saved.frames[0].event.actions.push({ type: 'old-extension', credentials: 'Do not show' }, null);
  const events = conversationEvents(saved);
  assert.equal(events[0].event.changes[2].text, 'I have drawn.');
  assert.match(events[0].event.changes[1].summary, /drew 1 card/);
  assert.doesNotMatch(JSON.stringify(events), /Hidden one|Other|Private decision reasoning|Do not show/);
  assert.equal(events[0].event.changes[3].summary, 'Recorded table action');
  const summaryOnly = structuredClone(saved);
  delete summaryOnly.frames[0].event.actions;
  summaryOnly.frames[0].event.public = { summary: 'A legacy table update' };
  assert.equal(conversationEvents(summaryOnly)[0].event.summary, 'A legacy table update');
});

test('conversation keeps public reveal references after cards are hidden again, without live handles or private reveals', () => {
  const config = setup();
  config.players.push({ id: 'three', name: 'Carol', deck: [{ name: 'Forest' }] });
  config.players[0].deck = [{ name: 'Public reference', image_url: 'https://cards.scryfall.io/reveal.jpg', oracle_text: 'Saved text.', count: 2 }];
  const game = fixture(config);
  game.act('one', [{ type: 'draw', count: 2 }]);
  const [publicCard, privateCard] = game.state.zones['one:hand'].cards;
  game.act('one', [{ type: 'reveal', card: publicCard }]);
  game.act('one', [{ type: 'reveal', card: privateCard, to: ['two'] }]);
  game.act('one', [{ type: 'move', card: publicCard, to: 'one:library' }, { type: 'shuffle' }]);
  const saved = structuredClone(game.recording);
  saved.frames[1].event.public.changes[0].revealedCards[0].id = 'stale-live-handle';
  saved.frames[1].event.public.changes[0].revealedCards[0].private_reason = 'Do not show this';
  const events = conversationEvents(saved);
  assert.equal(events[1].event.changes[0].revealedCards[0].name, 'Public reference');
  assert.equal(events[1].event.changes[0].revealedCards[0].oracle_text, 'Saved text.');
  assert.equal(events[2].event.changes[0].revealedCards, undefined);
  assert.doesNotMatch(JSON.stringify(events), /stale-live-handle|Do not show this/);
  events[1].event.changes[0].revealedCards[0].name = 'Modified locally';
  assert.equal(saved.frames[1].event.public.changes[0].revealedCards[0].name, 'Public reference');
});
