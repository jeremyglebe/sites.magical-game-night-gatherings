import test from 'node:test';
import assert from 'node:assert/strict';
import { createTable, observe, applyActions } from './table.mjs';
import { cardDropActions } from '../shared/human-card-moves.mjs';
import { previewHumanActions } from '../shared/human-preview.mjs';

function fixture() {
  return createTable({ shuffle: false, players: ['p1', 'p2'].map(id => ({
    id, name: id, deck: ['first', 'second', 'third', 'fourth'].map(name => ({
      name: `${id} ${name}`, type_line: 'Creature', oracle_text: 'Fixture card.',
    })),
  })) });
}
const act = (state, ...actions) => applyActions(state, 'p1', state.revision, actions, 'Drag interaction fixture');
const dropped = (table, source, target) => cardDropActions(table, 'p1', source, target).map(entry => entry.op);

test('a succession of unsent drops previews the same physical placement and stack order as one commit', () => {
  let state = act(fixture(), { type: 'draw', count: 3 });
  const base = observe(state, 'p1'), original = structuredClone(base);
  const [one, two] = base.zones['p1:hand'].cards;
  const actions = dropped(base, { cardId: one.id }, { zoneId: 'battlefield', controller: 'p1' });
  let preview = previewHumanActions(base, 'p1', actions);
  actions.push(...dropped(preview.table, { cardId: one.id }, { zoneId: 'stack' }));
  preview = previewHumanActions(base, 'p1', actions);
  actions.push(...dropped(preview.table, { cardId: two.id }, { zoneId: 'stack' }));
  preview = previewHumanActions(base, 'p1', actions);
  assert.equal(preview.valid, true);
  assert.deepEqual(preview.table.zones.stack.cards.map(card => card.id), [two.id, one.id]);
  assert.equal(state.zones.battlefield.cards.length, 0);
  assert.equal(state.zones['p1:hand'].cards.length, 3, 'dragging alone leaves the saved state unchanged');
  assert.deepEqual(base, original);
  assert.deepEqual(preview.table.events, base.events, 'draft actions never appear in the public log');
  state = act(state, ...actions);
  assert.deepEqual(observe(state, 'p1').zones, preview.table.zones);
  assert.equal(state.events.at(-1).actions.length, 3);
  const undone = previewHumanActions(base, 'p1', actions.slice(0, -1));
  assert.deepEqual(undone.table.zones.stack.cards.map(card => card.id), [one.id]);
  assert.equal(undone.table.zones['p1:hand'].cards.some(card => card.id === two.id), true);
});

test('dropping onto a different named battlefield explicitly changes control in the shared battlefield', () => {
  let state = act(fixture(), { type: 'draw' });
  const card = observe(state, 'p1').zones['p1:hand'].cards[0];
  state = act(state, { type: 'move', card: card.id, to: 'battlefield' });
  const base = observe(state, 'p1');
  const actions = dropped(base, { cardId: card.id }, { zoneId: 'battlefield', controller: 'p2' });
  const preview = previewHumanActions(base, 'p1', actions);
  assert.deepEqual(actions, [{ type: 'card', card: card.id, set: { controller: 'p2' } }]);
  assert.equal(preview.table.zones.battlefield.cards[0].controller, 'p2');
  assert.equal(preview.table.zones.battlefield.cards[0].owner, 'p1');
  assert.deepEqual(observe(act(state, ...actions), 'p1').zones, preview.table.zones);
  assert.equal(previewHumanActions(base, 'p1', []).table.zones.battlefield.cards[0].controller, 'p1');
});

test('dragging a known library card to the bottom reorders the real library without retaining a tracking handle', () => {
  const state = act(fixture(), { type: 'peek', zone: 'p1:library', count: 2 });
  const base = observe(state, 'p1'), first = base.zones['p1:library'].cards[0];
  const actions = dropped(base, { cardId: first.id }, { zoneId: 'p1:library', position: 'bottom' });
  const preview = previewHumanActions(base, 'p1', actions);
  const committed = act(state, ...actions), visible = observe(committed, 'p1');
  assert.equal(preview.valid, true);
  assert.equal(preview.table.zones['p1:library'].count, 4);
  assert.deepEqual(preview.table.zones, visible.zones);
  assert.equal(committed.cards[committed.zones['p1:library'].cards.at(-1)].definition.name, first.name);
  assert.equal(committed.cards[first.id], undefined, 'concealed movement replaces the old identity handle');
  assert.throws(() => dropped(preview.table, { cardId: first.id }, { zoneId: 'p1:hand' }), /no longer available/);
});

test('return-to-hand drops remain undoable but their pending handles cannot be reused before sending', () => {
  let state = act(fixture(), { type: 'draw' });
  const originalCard = observe(state, 'p1').zones['p1:hand'].cards[0];
  state = act(state, { type: 'move', card: originalCard.id, to: 'battlefield' });
  const base = observe(state, 'p1');
  const actions = dropped(base, { cardId: originalCard.id }, { zoneId: 'p1:hand' });
  const preview = previewHumanActions(base, 'p1', actions);
  const pendingCard = preview.table.zones['p1:hand'].cards[0];
  assert.equal(pendingCard.name, originalCard.name);
  assert.equal(pendingCard.editable, false);
  assert.throws(() => dropped(preview.table, { cardId: pendingCard.id }, { zoneId: 'battlefield' }), /pending/);
  assert.deepEqual(previewHumanActions(base, 'p1', []).table.zones, base.zones);
  const committed = act(state, ...actions);
  const ownCard = observe(committed, 'p1').zones['p1:hand'].cards[0];
  assert.notEqual(ownCard.id, originalCard.id);
  assert.equal(ownCard.name, originalCard.name);
  assert.equal(dropped(observe(committed, 'p1'), { cardId: ownCard.id }, { zoneId: 'battlefield' }).length, 1);
  assert.deepEqual(observe(committed, 'p2').zones['p1:hand'].cards, []);
});

test('dragging the concealed library pile to hand queues a draw and reveals nothing before commit', () => {
  const state = fixture(), base = observe(state, 'p1');
  const actions = dropped(base, { drawFrom: 'p1:library' }, { zoneId: 'p1:hand' });
  const preview = previewHumanActions(base, 'p1', actions);
  assert.equal(preview.table.zones['p1:library'].count, 3);
  assert.equal(preview.table.zones['p1:hand'].count, 1);
  assert.equal(preview.table.zones['p1:hand'].cards[0].name, 'Unknown card');
  assert.doesNotMatch(JSON.stringify(preview.table.zones), /p1 first/);
  const committed = act(state, ...actions);
  assert.equal(observe(committed, 'p1').zones['p1:hand'].cards[0].name, 'p1 first');
  assert.deepEqual(observe(committed, 'p2').zones['p1:hand'].cards, []);
  assert.deepEqual(observe(committed).zones['p1:hand'].cards, []);
});

test('an Aura can resolve from stack onto an opposing creature with matching preview and server state', () => {
  let state = act(fixture(), { type: 'draw', count: 2 });
  const [aura, creature] = observe(state, 'p1').zones['p1:hand'].cards;
  state = act(state,
    { type: 'move', card: aura.id, to: 'stack' },
    { type: 'move', card: creature.id, to: 'battlefield' },
    { type: 'card', card: creature.id, set: { controller: 'p2' } },
  );
  const base = observe(state, 'p1');
  const actions = dropped(base, { cardId: aura.id }, { zoneId: 'battlefield', attachTo: creature.id, controller: 'p2' });
  const preview = previewHumanActions(base, 'p1', actions);
  assert.equal(preview.valid, true);
  const attached = preview.table.zones.battlefield.cards.find(card => card.id === aura.id);
  assert.equal(attached.attached_to, creature.id);
  assert.equal(attached.controller, 'p1');
  assert.deepEqual(previewHumanActions(base, 'p1', []).table.zones, base.zones, 'undo restores the stack');
  state = act(state, ...actions);
  assert.deepEqual(observe(state, 'p1').zones, preview.table.zones);
  const detach = dropped(observe(state, 'p1'), { cardId: aura.id }, { zoneId: 'battlefield', controller: 'p1' });
  const detachedPreview = previewHumanActions(observe(state, 'p1'), 'p1', detach);
  assert.deepEqual(observe(act(state, ...detach), 'p1').zones, detachedPreview.table.zones);
  for (const leaving of [aura, creature]) {
    const move = dropped(observe(state, 'p1'), { cardId: leaving.id }, { zoneId: 'p1:graveyard' });
    const movedPreview = previewHumanActions(observe(state, 'p1'), 'p1', move);
    const moved = act(state, ...move);
    assert.equal(moved.cards[aura.id].attached_to, null, 'moving either endpoint away unlinks the attachment');
    assert.deepEqual(observe(moved, 'p1').zones, movedPreview.table.zones);
  }
});
