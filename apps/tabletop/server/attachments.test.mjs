import test from 'node:test';
import assert from 'node:assert/strict';
import { applyActions, createTable, eventsSince, observe } from './table.mjs';
import { previewHumanActions } from '../shared/human-preview.mjs';
import { createRecording, appendRecording } from './game-log.mjs';
import { createReplay } from '../shared/replay.mjs';

const config = {
  shuffle: false, series: { mode: 'first_to', winsRequired: 2 },
  players: [
    { id: 'p1', name: 'Alice', deck: [{ name: 'Aura', type_line: 'Enchantment — Aura' }, { name: 'Equipment', type_line: 'Artifact — Equipment' }] },
    { id: 'p2', name: 'Bob', deck: [{ name: 'Creature', type_line: 'Creature' }, { name: 'Forest', type_line: 'Basic Land — Forest' }] },
  ],
};
const act = (state, actor, ...actions) => applyActions(state, actor, state.revision, actions, 'Attachment test');
const attachment = (card, target) => ({ type: 'card', card, set: { attached_to: target } });
function fixture() {
  let state = createTable(config);
  for (const actor of ['p1', 'p2']) {
    state = act(state, actor, { type: 'draw', count: 2 });
    state = act(state, actor, ...state.zones[`${actor}:hand`].cards.map(card => ({ type: 'move', card, to: 'battlefield' })));
  }
  const ids = Object.fromEntries(Object.values(state.cards).map(card => [card.definition.name, card.id]));
  return { state, ids };
}
const projectedLinks = state => Object.fromEntries(observe(state).zones.battlefield.cards.map(card => [card.id, card.attached_to]));

test('attachments persist across controllers and face-down state without applying card-type legality', () => {
  let { state, ids } = fixture();
  state = act(state, 'p1', attachment(ids.Aura, ids.Creature), attachment(ids.Equipment, ids.Creature));
  for (const actor of [null, 'p1', 'p2']) {
    const cards = observe(state, actor).zones.battlefield.cards;
    assert.equal(cards.find(c => c.id === ids.Aura).attached_to, ids.Creature);
    assert.equal(cards.find(c => c.id === ids.Equipment).attached_to, ids.Creature);
  }
  state = act(state, 'p1', { type: 'card', card: ids.Creature, set: { face_down: true, controller: 'p1' } });
  assert.equal(state.cards[ids.Aura].attached_to, ids.Creature);
  assert.equal(state.cards[ids.Equipment].attached_to, ids.Creature);
  state = act(state, 'p1', attachment(ids.Aura, ids.Equipment));
  assert.equal(state.cards[ids.Aura].attached_to, ids.Equipment, 'the table does not judge which permanent types an Aura can enchant');
  state = act(state, 'p1', attachment(ids.Aura, null));
  assert.equal(state.cards[ids.Aura].attached_to, null);
  assert.ok(state.zones.battlefield.cards.includes(ids.Aura), 'detaching never destroys the Aura');
});

test('non-battlefield attachments, self-links, unknown targets, and cycles fail atomically', () => {
  const { state, ids } = fixture();
  for (const destination of ['stack', 'p1:graveyard', 'p1:hand']) {
    const moved = act(state, 'p1', { type: 'move', card: ids.Aura, to: destination });
    const source = moved.zones[destination].cards[0];
    assert.throws(() => act(moved, 'p1', attachment(source, ids.Creature)), /battlefield/);
    assert.throws(() => act(moved, 'p1', attachment(ids.Equipment, source)), /battlefield/);
  }
  for (const target of [ids.Aura, 'missing', undefined, {}, 7]) {
    assert.throws(() => act(state, 'p1', attachment(ids.Aura, target)), /itself|available|card ID/);
  }
  const linked = act(state, 'p1', attachment(ids.Aura, ids.Equipment), attachment(ids.Equipment, ids.Creature));
  const before = structuredClone(linked);
  assert.throws(() => act(linked, 'p1', { type: 'card', card: ids.Creature, set: { tapped: true } }, attachment(ids.Creature, ids.Aura)), /cycle/);
  assert.deepEqual(linked, before);
  const abilityState = act(state, 'p1', { type: 'stack_item', definition: { name: 'Trigger' } });
  const ability = abilityState.zones.stack.cards[0];
  assert.throws(() => act(abilityState, 'p1', { type: 'move', card: ability, to: 'battlefield' }, attachment(ability, ids.Creature)), /two cards/);
});

test('battlefield exits detach incoming and outgoing relationships without moving other cards', () => {
  const { state, ids } = fixture();
  const linked = act(state, 'p1', attachment(ids.Aura, ids.Equipment), attachment(ids.Equipment, ids.Creature));
  for (const to of ['p1:graveyard', 'p1:exile', 'p1:command', 'stack', 'p1:hand', 'p1:library']) {
    const moved = act(linked, 'p1', { type: 'move', card: ids.Equipment, to });
    assert.equal(moved.cards[ids.Aura].attached_to, null, to);
    assert.equal(moved.cards[moved.zones[to].cards[0]].attached_to, null, to);
    assert.ok(moved.zones.battlefield.cards.includes(ids.Aura), to);
    assert.ok(moved.zones.battlefield.cards.includes(ids.Creature), to);
    assert.equal(moved.zones.battlefield.cards.length, 3, to);
  }
  const reordered = act(linked, 'p1', { type: 'move', card: ids.Equipment, to: 'battlefield', position: 'top' });
  assert.deepEqual(projectedLinks(reordered), projectedLinks(linked));
});

test('removing or concealing an object clears every relationship to its old handle', () => {
  let { state, ids } = fixture();
  state = act(state, 'p1', { type: 'token', definition: { name: 'Token host' } });
  const token = state.zones.battlefield.cards.at(-1);
  state = act(state, 'p1', attachment(ids.Aura, token), attachment(token, ids.Creature));
  const removed = act(state, 'p1', { type: 'remove_token', card: token });
  assert.equal(removed.cards[ids.Aura].attached_to, null);
  assert.equal(removed.cards[token], undefined);
  assert.ok(removed.zones.battlefield.cards.includes(ids.Aura));
  const shuffled = act(state, 'p1', { type: 'shuffle', zone: 'battlefield' });
  assert.ok(shuffled.zones.battlefield.cards.every(id => !state.cards[id]));
  assert.ok(Object.values(shuffled.cards).every(card => card.attached_to === null));
});

test('human queued attachments and public-zone exits match committed state and undo restores links', () => {
  const { state, ids } = fixture();
  const table = observe(state, 'p1');
  const actions = [attachment(ids.Aura, ids.Creature), attachment(ids.Equipment, ids.Creature), { type: 'move', card: ids.Creature, to: 'p2:graveyard' }];
  const preview = previewHumanActions(table, 'p1', actions);
  assert.equal(preview.valid, true);
  assert.deepEqual(preview.table.zones, observe(act(state, 'p1', ...actions), 'p1').zones);
  const undoMove = previewHumanActions(table, 'p1', actions.slice(0, -1));
  assert.equal(undoMove.table.zones.battlefield.cards.find(c => c.id === ids.Aura).attached_to, ids.Creature);
  assert.deepEqual(previewHumanActions(table, 'p1', []).table, table);
  assert.deepEqual(observe(state, 'p1'), table, 'drafting never mutates the original');
  const invalid = previewHumanActions(table, 'p1', [attachment(ids.Aura, ids.Creature), attachment(ids.Creature, ids.Aura)]);
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors[0].message, /cycle/);
  assert.equal(invalid.appliedCount, 1);
  assert.equal(invalid.table.zones.battlefield.cards.find(c => c.id === ids.Creature).attached_to, null);
  const outOfZone = previewHumanActions(table, 'p1', [{ type: 'move', card: ids.Aura, to: 'p1:graveyard' }, attachment(ids.Aura, ids.Creature)]);
  assert.equal(outOfZone.valid, false);
  assert.match(outOfZone.errors[0].message, /battlefield/);
});

test('saved replay and public events retain attachment relationships and readable target names', () => {
  const { state, ids } = fixture();
  const linked = act(state, 'p1', attachment(ids.Aura, ids.Creature));
  const hidden = act(linked, 'p1', { type: 'move', card: ids.Creature, to: 'p2:library' });
  const event = eventsSince(hidden, null, state.revision).events[0];
  assert.equal(event.changes[0].set.attached_to, 'Creature');
  assert.equal(event.changes[0].cards[0], 'Aura');
  let recording = createRecording(state, config);
  recording = appendRecording(recording, state, linked);
  recording = appendRecording(recording, linked, hidden);
  const replay = createReplay(JSON.parse(JSON.stringify(recording)));
  assert.equal(replay.stateAt(1).cards[ids.Aura].attached_to, ids.Creature);
  assert.equal(replay.stateAt(2).cards[ids.Aura].attached_to, null);
});

test('next-game reset restores decks without any prior attachment relationships', () => {
  let { state, ids } = fixture();
  state = act(state, 'p1', attachment(ids.Aura, ids.Creature));
  state = act(state, 'p1', { type: 'result', winners: ['p1'] });
  state = act(state, 'p1', { type: 'ready_next_game' });
  state = act(state, 'p2', { type: 'ready_next_game' });
  assert.equal(state.series.gameNumber, 2);
  assert.ok(Object.values(state.cards).every(card => card.attached_to === null));
  assert.equal(state.cards[ids.Aura], undefined);
  assert.equal(state.cards[ids.Creature], undefined);
});
