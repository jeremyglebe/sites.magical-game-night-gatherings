import test from 'node:test';
import assert from 'node:assert/strict';
import { createTable, applyActions, observe, cardDetails } from './table.mjs';
import { createRecording, appendRecording } from './game-log.mjs';
import { createReplay } from '../shared/replay.mjs';
import { previewHumanActions } from '../shared/human-preview.mjs';
import { revealedCardSnapshots } from '../shared/revealed-cards.mjs';

const config = { players: ['alice', 'bob'].map(id => ({ id, deck: [{ name: 'Forest' }] })) };
const ability = {
  name: 'Gravedigger enters ability', type_line: 'Ability',
  short_description: 'Return a creature from my graveyard to my hand.',
  long_description: 'Targeting the creature in my graveyard.\nWhen this resolves, I may return that card to my hand.',
  oracle_text: 'When this creature enters, you may return target creature card from your graveyard to your hand.',
};
const act = (state, ...actions) => applyActions(state, 'alice', state.revision, actions, 'Ability description test');

test('ability summaries are visible while full descriptions stay in the inspection response', () => {
  const state = act(createTable(config), { type: 'stack_item', definition: ability });
  const id = state.zones.stack.cards[0];
  for (const actor of [null, 'alice', 'bob']) {
    const card = observe(state, actor).zones.stack.cards[0];
    assert.equal(card.name, ability.name);
    assert.equal(card.kind, 'ability');
    assert.equal(card.short_description, ability.short_description);
    assert.equal(card.long_description, undefined);
    assert.equal(card.oracle_text, undefined);
    const details = cardDetails(state, actor, id);
    assert.equal(details.short_description, ability.short_description);
    assert.equal(details.long_description, ability.long_description);
    assert.equal(details.oracle_text, ability.oracle_text);
  }
});

test('legacy abilities retain their title tooltip and oracle text without requiring migration', () => {
  const legacy = { name: 'Old ability', oracle_text: 'Old full text.' };
  let state = act(createTable(config), { type: 'stack_item', definition: legacy });
  assert.equal(observe(state).zones.stack.cards[0].short_description, legacy.name);
  assert.equal(cardDetails(state, 'bob', state.zones.stack.cards[0]).oracle_text, legacy.oracle_text);
  state = act(state, { type: 'stack_item', definition: { ...legacy, short_description: '  ' } });
  assert.equal(observe(state).zones.stack.cards[0].short_description, legacy.name);
});

test('ability descriptions survive JSON saves and replay after the object is removed', () => {
  const initial = createTable(config);
  const added = act(initial, { type: 'stack_item', definition: ability });
  const id = added.zones.stack.cards[0];
  const removed = act(added, { type: 'remove_stack_item', card: id });
  let recording = createRecording(initial, config);
  recording = appendRecording(recording, initial, added);
  recording = appendRecording(recording, added, removed);
  const replay = createReplay(JSON.parse(JSON.stringify(recording)));
  assert.deepEqual(replay.stateAt(1).cards[id].definition, ability);
  assert.equal(replay.stateAt(2).cards[id], undefined);
  assert.equal(cardDetails(JSON.parse(JSON.stringify(added)), 'bob', id).long_description, ability.long_description);
  const revealed = act(added, { type: 'reveal', card: id });
  const change = observe(revealed).events.at(-1).changes[0];
  const snapshot = revealedCardSnapshots(JSON.parse(JSON.stringify(change)))[0];
  assert.equal(snapshot.short_description, ability.short_description);
  assert.equal(snapshot.long_description, ability.long_description);
  assert.equal(snapshot.id, undefined, 'historical inspection must not retain live handles');
});

test('concealed identities cannot leak ability descriptions through views or previews', () => {
  const state = act(createTable(config), { type: 'stack_item', definition: ability });
  const id = state.zones.stack.cards[0];
  const concealed = act(state, { type: 'card', card: id, set: { face_down: true } });
  for (const actor of [null, 'bob']) {
    const card = observe(concealed, actor).zones.stack.cards[0];
    assert.equal(card.name, 'Face-down card');
    assert.equal(card.short_description, undefined);
    assert.equal(card.long_description, undefined);
    assert.throws(() => cardDetails(concealed, actor, id), /concealed/);
  }
  const preview = previewHumanActions(observe(state, 'bob'), 'bob', [
    { type: 'card', card: id, set: { face_down: true } },
  ]);
  assert.equal(preview.valid, true);
  assert.equal(preview.table.zones.stack.cards[0].short_description, undefined);
  assert.equal(preview.table.zones.stack.cards[0].long_description, undefined);
});

test('invalid ability descriptions fail atomically and at the human preview boundary', () => {
  const initial = createTable(config);
  const before = structuredClone(initial);
  for (const invalid of [
    { short_description: 'x'.repeat(501) }, { long_description: 'x'.repeat(12001) },
    { short_description: null }, { long_description: {} },
  ]) {
    const action = { type: 'stack_item', definition: { ...ability, ...invalid } };
    assert.throws(() => act(initial, action), /Invalid text/);
    assert.deepEqual(initial, before);
    assert.equal(previewHumanActions(observe(initial, 'alice'), 'alice', [action]).valid, false);
  }
  const boundary = { ...ability, short_description: 'x'.repeat(500), long_description: 'x'.repeat(12000) };
  const action = { type: 'stack_item', definition: boundary };
  const state = act(initial, action);
  assert.equal(cardDetails(state, 'alice', state.zones.stack.cards[0]).long_description.length, 12000);
  const preview = previewHumanActions(observe(initial, 'alice'), 'alice', [action]);
  assert.equal(preview.valid, true);
  assert.equal(preview.table.zones.stack.cards[0].short_description.length, 500);
  assert.equal(preview.table.zones.stack.cards[0].long_description.length, 12000);
});
