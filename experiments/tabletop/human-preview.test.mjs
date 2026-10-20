import test from 'node:test';
import assert from 'node:assert/strict';
import { createTable, observe, applyActions } from './table.mjs';
import { previewHumanActions } from './human-preview.mjs';

const act = (state, actor, ...actions) => applyActions(state, actor, state.revision, actions, 'Preview fixture');
function fixture() {
  let state = createTable({ shuffle: false, players: ['p1', 'p2'].map(id => ({ id, deck: [
    { name: `${id} creature`, type_line: 'Creature', power: '2', toughness: '2' },
    { name: `${id} land`, type_line: 'Basic Land', count: 5 },
    { name: `${id} aura`, type_line: 'Enchantment — Aura' },
  ] })) });
  state = act(state, 'p1', { type: 'draw', count: 3 });
  state = act(state, 'p2', { type: 'draw', count: 2 });
  return state;
}
const cardIds = table => Object.values(table.zones).flatMap(z => z.cards.map(c => c.id));
function assertCounts(table) {
  for (const z of Object.values(table.zones)) {
    assert.ok(z.count >= 0, z.id);
    assert.equal(z.cards.length + z.hidden_count, z.count, z.id);
  }
  const ids = cardIds(table);
  assert.equal(new Set(ids).size, ids.length);
}

test('multiple physical edits match committed state; undo recomputes without touching the original or logs', () => {
  const state = fixture(), table = observe(state, 'p1'), before = structuredClone(table);
  const card = table.zones['p1:hand'].cards[0].id;
  const actions = [
    { type: 'move', card, to: 'battlefield' },
    { type: 'card', card, set: { tapped: true, damage: 1, counters: { '+1/+1': 2 } } },
    { type: 'player', player: 'p1', set: { life: 18, mana: { W: 1 }, counters: { poison: 2 } } },
    { type: 'turn', set: { number: 3, phase: 'Main 1', active: 'p1', priority: 'p1' } },
  ];
  const preview = previewHumanActions(table, 'p1', actions);
  assert.equal(preview.valid, true);
  const committed = observe(act(state, 'p1', ...actions), 'p1');
  assert.deepEqual(preview.table.zones, committed.zones);
  assert.deepEqual(preview.table.players, committed.players);
  assert.deepEqual(preview.table.turn, committed.turn);
  assert.deepEqual(table, before);
  assert.equal(preview.table.revision, before.revision);
  assert.deepEqual(preview.table.events, before.events);
  assert.deepEqual(preview.table.notes, before.notes);
  const undone = previewHumanActions(table, 'p1', actions.slice(0, 1));
  assert.equal(undone.table.zones.battlefield.cards[0].tapped, false);
  assert.deepEqual(previewHumanActions(table, 'p1', []).table, before);
  assertCounts(preview.table);
});

test('hidden draws preview card backs with stable IDs and never guess a known library card is on top', () => {
  let state = fixture();
  state = act(state, 'p1', { type: 'peek', zone: 'p1:library', count: 2 });
  const table = observe(state, 'p1'), known = table.zones['p1:library'].cards.map(c => c.id);
  const actions = [{ type: 'draw', count: 2 }];
  const preview = previewHumanActions(table, 'p1', actions);
  assert.equal(preview.valid, true);
  assert.deepEqual(preview, previewHumanActions(table, 'p1', actions));
  assert.equal(preview.table.zones['p1:library'].count, 2);
  assert.deepEqual(preview.table.zones['p1:library'].cards, []);
  const drawn = preview.table.zones['p1:hand'].cards.slice(-2);
  assert.deepEqual(drawn.map(c => c.name), ['Unknown card', 'Unknown card']);
  assert.ok(drawn.every(c => c.draft && c.editable === false && c.preview_unknown && !c.image_url));
  assert.ok(known.every(id => !cardIds(preview.table).includes(id)));
  assert.equal(preview.warnings.length, 1);
  assertCounts(preview.table);
  assert.deepEqual(previewHumanActions(table, 'p1', [{ type: 'draw', count: 0 }]).table, table);
});

test('private moves and draws never disclose cards to another seat or spectator projection', () => {
  const state = fixture(), own = observe(state, 'p1'), publicView = observe(state);
  const card = own.zones['p1:hand'].cards[0];
  const moved = previewHumanActions(own, 'p1', [{ type: 'move', card: card.id, to: 'p2:hand' }]);
  assert.equal(moved.table.zones['p2:hand'].count, 3);
  assert.deepEqual(moved.table.zones['p2:hand'].cards, []);
  assert.ok(!cardIds(moved.table).includes(card.id));
  const opponentDraw = previewHumanActions(own, 'p1', [{ type: 'draw', from: 'p2:library', to: 'p2:hand' }]);
  assert.deepEqual(opponentDraw.table.zones['p2:hand'].cards, []);
  assert.doesNotMatch(JSON.stringify(opponentDraw.table.zones), /p2 creature|p2 land/);
  const publicDraw = previewHumanActions(publicView, 'p1', [{ type: 'draw' }]);
  assert.ok(publicDraw.table.zones['p1:hand'].cards.every(c => c.preview_unknown));
  assert.doesNotMatch(JSON.stringify(publicDraw.table.zones), /p1 creature|p1 land/);
  assertCounts(moved.table); assertCounts(opponentDraw.table); assertCounts(publicDraw.table);
});

test('return hand, shuffle, and redraw maintain counts and can all be undone', () => {
  const table = observe(fixture(), 'p1');
  const actions = [
    ...table.zones['p1:hand'].cards.map(c => ({ type: 'move', card: c.id, to: 'p1:library' })),
    { type: 'shuffle' }, { type: 'draw', count: 7 },
  ];
  const result = previewHumanActions(table, 'p1', actions);
  assert.equal(result.valid, true);
  assert.equal(result.table.zones['p1:library'].count, 0);
  assert.equal(result.table.zones['p1:hand'].count, 7);
  assert.ok(result.table.zones['p1:hand'].cards.every(c => c.preview_unknown && c.draft));
  assertCounts(result.table);
  const beforeDraw = previewHumanActions(table, 'p1', actions.slice(0, -1));
  assert.equal(beforeDraw.table.zones['p1:hand'].count, 0);
  assert.equal(beforeDraw.table.zones['p1:library'].count, 7);
  assert.deepEqual(previewHumanActions(table, 'p1', []).table, table);
});

test('a private move invalidates the old card handle and fails dependent actions rather than hiding errors', () => {
  let state = fixture();
  const handCard = observe(state, 'p1').zones['p1:hand'].cards[0].id;
  state = act(state, 'p1', { type: 'move', card: handCard, to: 'battlefield' });
  const table = observe(state, 'p1');
  const result = previewHumanActions(table, 'p1', [
    { type: 'move', card: handCard, to: 'p1:hand' },
    { type: 'card', card: handCard, set: { tapped: true } },
    { type: 'player', set: { life: 1 } },
  ]);
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].index, 1);
  assert.match(result.errors[0].message, /no longer available/);
  assert.equal(result.appliedCount, 1);
  assert.equal(result.table.players[0].life, 20);
  const returned = result.table.zones['p1:hand'].cards.at(-1);
  assert.equal(returned.name, 'p1 creature');
  assert.equal(returned.editable, false);
  assert.notEqual(returned.id, handCard);
});

test('undoing a prerequisite exposes invalid dependent operations and leaves a trustworthy partial preview', () => {
  const table = observe(fixture(), 'p1'), card = table.zones['p1:hand'].cards[0].id;
  const create = { type: 'zone', id: 'p1:holding', owner: 'p1', visibility: 'public' };
  const move = { type: 'move', card, to: 'p1:holding' };
  assert.equal(previewHumanActions(table, 'p1', [create, move]).valid, true);
  const undone = previewHumanActions(table, 'p1', [move]);
  assert.equal(undone.valid, false);
  assert.deepEqual(undone.errors, [{ index: 0, message: 'Unknown zone' }]);
  assert.deepEqual(undone.table, table);
});

test('top-of-stack order is preserved across public moves and generated ability objects', () => {
  const table = observe(fixture(), 'p1'), [one, two] = table.zones['p1:hand'].cards;
  const result = previewHumanActions(table, 'p1', [
    { type: 'move', card: one.id, to: 'stack', position: 'top' },
    { type: 'move', card: two.id, to: 'stack', position: 'top' },
    { type: 'stack_item', definition: { name: 'Triggered ability' } },
  ]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.table.zones.stack.cards.map(c => c.name), ['Triggered ability', two.name, one.name]);
  assert.equal(result.table.zones.stack.cards[0].kind, 'ability');
  assert.equal(result.table.zones.stack.cards[0].editable, false);
  assertCounts(result.table);
});

test('controllers, attachments, life, and handoffs update without inventing rules effects', () => {
  const table = observe(fixture(), 'p1'), [one, two] = table.zones['p1:hand'].cards;
  const result = previewHumanActions(table, 'p1', [
    { type: 'move', card: one.id, to: 'battlefield' },
    { type: 'move', card: two.id, to: 'battlefield' },
    { type: 'card', card: two.id, set: { attached_to: one.id, tapped: true } },
    { type: 'card', card: one.id, set: { controller: 'p2', damage: 9 } },
    { type: 'pass_turn', next: 'p2', message: 'Your turn.' },
  ]);
  assert.equal(result.valid, true);
  const board = result.table.zones.battlefield.cards;
  assert.equal(board[0].controller, 'p2');
  assert.equal(board[0].damage, 9); // No automatic lethal damage rule.
  assert.equal(board[1].attached_to, one.id);
  assert.equal(board[1].tapped, true); // No automatic untapping at handoff.
  assert.deepEqual(result.table.turn, { number: 2, active: 'p2', priority: 'p2', phase: 'Untap' });
  assert.deepEqual(result.table.notes, table.notes);
  const detach = previewHumanActions(result.table, 'p1', [{ type: 'move', card: one.id, to: 'p1:library' }]);
  assert.equal(detach.table.zones.battlefield.cards[0].attached_to, null);
});

test('face-down cards cannot retain their identity when control passes away', () => {
  const table = observe(fixture(), 'p1'), card = table.zones['p1:hand'].cards[0];
  card.image_url = 'https://cards.scryfall.io/example.jpg';
  const result = previewHumanActions(table, 'p1', [
    { type: 'move', card: card.id, to: 'battlefield' },
    { type: 'card', card: card.id, set: { face_down: true, controller: 'p2' } },
  ]);
  assert.equal(result.valid, true);
  const concealed = result.table.zones.battlefield.cards[0];
  assert.equal(concealed.name, 'Face-down card');
  assert.equal(concealed.image_url, undefined);
  assert.equal(concealed.type_line, undefined);
  assert.equal(card.name, 'p1 creature');
  const flipped = previewHumanActions(result.table, 'p1', [{ type: 'card', card: card.id, set: { face_down: false } }]);
  assert.equal(flipped.valid, true);
  const pendingIdentity = flipped.table.zones.battlefield.cards[0];
  assert.equal(pendingIdentity.name, 'Unknown card');
  assert.equal(pendingIdentity.preview_unknown, true);
  assert.equal(pendingIdentity.editable, false);
  assert.equal(pendingIdentity.image_url, undefined);
});

test('token and ability removals work, but draft IDs cannot be sent as future actions', () => {
  let state = fixture();
  state = act(state, 'p1', { type: 'token', definition: { name: 'Soldier' } }, { type: 'stack_item', definition: { name: 'Ability' } });
  const table = observe(state, 'p1');
  const result = previewHumanActions(table, 'p1', [
    { type: 'remove_token', card: table.zones.battlefield.cards[0].id },
    { type: 'remove_stack_item', card: table.zones.stack.cards[0].id },
    { type: 'token', definition: { name: 'Saproling', type_line: 'Token Creature' }, count: 2, owner: 'p2' },
  ]);
  assert.equal(result.valid, true);
  assert.equal(result.table.zones.stack.count, 0);
  assert.equal(result.table.zones.battlefield.count, 2);
  assert.ok(result.table.zones.battlefield.cards.every(c => c.draft && c.controller === 'p2'));
  const invalid = previewHumanActions(table, 'p1', [
    { type: 'token', definition: { name: 'Saproling' } },
    { type: 'remove_token', card: 'draft:0:0' },
  ]);
  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors[0].index, 1);
  assert.match(invalid.errors[0].message, /after sending/);
  assertCounts(result.table);
});

test('peek and shuffle never invent identities or leave old concealed handles editable', () => {
  let state = fixture();
  state = act(state, 'p1', { type: 'peek', zone: 'p2:library', count: 2 });
  const table = observe(state, 'p1');
  const peek = previewHumanActions(table, 'p1', [{ type: 'peek', zone: 'p2:library', count: 3 }]);
  assert.equal(peek.table.zones['p2:library'].cards.length, 3);
  assert.ok(peek.table.zones['p2:library'].cards.every(c => c.preview_unknown));
  const shuffled = previewHumanActions(table, 'p1', [{ type: 'shuffle', zone: 'p2:library' }]);
  assert.deepEqual(shuffled.table.zones['p2:library'].cards, []);
  assert.equal(shuffled.table.zones['p2:library'].count, table.zones['p2:library'].count);
  assert.equal(shuffled.table.zones['p2:library'].order_pending, true);
  assertCounts(peek.table); assertCounts(shuffled.table);
});

test('a failed operation is atomic, and chat drafts never become actual history', () => {
  const table = observe(fixture(), 'p1'), card = table.zones['p1:hand'].cards[0].id;
  const invalid = previewHumanActions(table, 'p1', [{ type: 'card', card, set: { tapped: true, controller: 'missing' } }]);
  assert.equal(invalid.valid, false);
  assert.deepEqual(invalid.table, table);
  const speech = previewHumanActions(table, 'p1', [{ type: 'say', text: 'Draft speech' }, { type: 'note', text: 'Draft note' }]);
  assert.deepEqual(speech.table, table);
  assert.equal(speech.valid, true);
});
