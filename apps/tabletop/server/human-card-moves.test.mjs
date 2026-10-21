import test from 'node:test';
import assert from 'node:assert/strict';
import { cardDropActions } from '../shared/human-card-moves.mjs';
const card = { id: 'a', name: 'Plains', owner: 'p1', controller: 'p1' };
function table() {
  const zones = {};
  for (const owner of ['p1', 'p2']) for (const suffix of ['library', 'hand', 'graveyard', 'exile', 'command', 'sideboard']) {
    const id = `${owner}:${suffix}`;
    zones[id] = { id, owner, count: suffix === 'library' ? 10 : 0, cards: [] };
  }
  zones.battlefield = { id: 'battlefield', owner: null, count: 0, cards: [] };
  zones.stack = { id: 'stack', owner: null, count: 0, cards: [] };
  zones['p1:hand'].cards = [structuredClone(card)]; zones['p1:hand'].count = 1;
  return { revision: 5, players: [{ id: 'p1', name: 'You' }, { id: 'p2', name: 'Opponent' }], zones };
}
test('dropping hand cards queues a move without changing the projection', () => {
  const state = table(), before = structuredClone(state);
  const result = cardDropActions(state, 'p1', { cardId: 'a' }, { zoneId: 'battlefield', controller: 'p1' });
  assert.deepEqual(result.map(item => item.op), [{ type: 'move', card: 'a', to: 'battlefield', position: 'bottom' }]);
  assert.deepEqual(state, before);
  assert.deepEqual(cardDropActions(state, 'p1', { cardId: 'a' }, { zoneId: 'p1:hand' }), []);
});
test('stack and library destinations preserve explicit ordering and controller changes', () => {
  const state = table();
  assert.equal(cardDropActions(state, 'p1', { cardId: 'a' }, { zoneId: 'stack' })[0].op.position, 'top');
  for (const position of ['top', 'bottom']) {
    assert.equal(cardDropActions(state, 'p1', { cardId: 'a' }, { zoneId: 'p1:library', position })[0].op.position, position);
  }
  state.zones['p1:library'].cards = state.zones['p1:hand'].cards; state.zones['p1:hand'].cards = [];
  assert.equal(cardDropActions(state, 'p1', { cardId: 'a' }, { zoneId: 'p1:library', position: 'bottom' })[0].op.type, 'move');
  state.zones.battlefield.cards = state.zones['p1:library'].cards; state.zones['p1:library'].cards = [];
  assert.deepEqual(cardDropActions(state, 'p1', { cardId: 'a' }, { zoneId: 'battlefield', controller: 'p2' }).map(item=>item.op), [{ type: 'card', card: 'a', set: { controller: 'p2' } }]);
});
test('blind library draws never read or carry a concealed identity', () => {
  const state = table();
  assert.deepEqual(cardDropActions(state, 'p1', { drawFrom: 'p1:library' }, { zoneId: 'p1:hand' }).map(item=>item.op), [{ type: 'draw', from: 'p1:library', to: 'p1:hand', count: 1 }]);
  assert.throws(()=>cardDropActions(state, 'p1', { drawFrom: 'p2:library' }, { zoneId: 'p1:hand' }), /your library/);
  assert.throws(()=>cardDropActions(state, 'p1', { drawFrom: 'p1:library' }, { zoneId: 'stack' }), /your library/);
  assert.throws(()=>cardDropActions(state, 'p1', { cardId: 'concealed' }, { zoneId: 'battlefield' }), /no longer available/);
  state.zones['p1:library'].count = 0;
  assert.throws(()=>cardDropActions(state, 'p1', { drawFrom: 'p1:library' }, { zoneId: 'p1:hand' }), /empty/);
});
test('pending identities and abilities cannot be dragged as ordinary physical cards', () => {
  const state = table();
  for (const changes of [{ draft: true }, { editable: false }, { preview_unknown: true }]) {
    state.zones['p1:hand'].cards[0] = { ...card, ...changes };
    assert.throws(()=>cardDropActions(state, 'p1', { cardId: 'a' }, { zoneId: 'battlefield' }), /pending/);
  }
  state.zones['p1:hand'].cards = []; state.zones.stack.cards = [{ ...card, kind: 'ability' }];
  assert.throws(()=>cardDropActions(state, 'p1', { cardId: 'a' }, { zoneId: 'p1:graveyard' }), /Remove stack ability/);
  assert.equal(cardDropActions(state, 'p1', { cardId: 'a' }, { zoneId: 'stack', position: 'top' })[0].op.type, 'move');
});

function attachmentTable() {
  const state = table();
  state.zones['p1:hand'].cards = [];
  state.zones.battlefield.cards = [
    { ...card, name: 'Equipment', attached_to: null },
    { id: 'b', name: 'Opponent creature', owner: 'p2', controller: 'p2', attached_to: null },
    { id: 'c', name: 'Aura', owner: 'p1', controller: 'p1', attached_to: null },
  ];
  return state;
}
test('attaching to an opponent card queues only the relationship and preserves control', () => {
  const state = attachmentTable(), before = structuredClone(state);
  const actions = cardDropActions(state, 'p1', { cardId: 'a' }, { zoneId: 'battlefield', attachTo: 'b', controller: 'p2' });
  assert.deepEqual(actions.map(item => item.op), [{ type: 'card', card: 'a', set: { attached_to: 'b' } }]);
  assert.match(actions[0].label, /Attach Equipment to Opponent creature/);
  assert.deepEqual(state, before);
  state.zones.battlefield.cards[0].attached_to = 'b';
  assert.deepEqual(cardDropActions(state, 'p1', { cardId: 'a' }, { zoneId: 'battlefield', attachTo: 'b', controller: 'p2' }), []);
});
test('hand and stack cards can enter the battlefield and attach in a single reversible drop', () => {
  for (const zoneId of ['p1:hand', 'stack', 'p1:graveyard']) {
    const state = attachmentTable();
    state.zones[zoneId].cards.push(state.zones.battlefield.cards.shift());
    const actions = cardDropActions(state, 'p1', { cardId: 'a' }, { zoneId: 'battlefield', attachTo: 'b', controller: 'p2' });
    assert.deepEqual(actions.map(item => item.op), [
      { type: 'move', card: 'a', to: 'battlefield', position: 'bottom' },
      { type: 'card', card: 'a', set: { attached_to: 'b' } },
    ]);
  }
});
test('attachment drops reject self, descendants, invalid targets, and non-card identities', () => {
  const state = attachmentTable();
  const drop = (attachTo, zoneId = 'battlefield') => cardDropActions(state, 'p1', { cardId: 'a' }, { zoneId, attachTo });
  assert.throws(() => drop('a'), /itself/);
  state.zones.battlefield.cards[1].attached_to = 'c';
  state.zones.battlefield.cards[2].attached_to = 'a';
  assert.throws(() => drop('b'), /cycle/);
  assert.throws(() => drop('concealed'), /no longer on the battlefield/);
  assert.throws(() => drop('b', 'stack'), /battlefield card/);
  assert.throws(() => drop(''), /battlefield card/);
  state.zones.battlefield.cards[1].attached_to = null;
  for (const changes of [{ draft: true }, { editable: false }, { preview_unknown: true }]) {
    const original = state.zones.battlefield.cards[1];
    state.zones.battlefield.cards[1] = { ...original, ...changes };
    assert.throws(() => drop('b'), /pending/);
    state.zones.battlefield.cards[1] = original;
  }
  state.zones.battlefield.cards[0].kind = 'ability';
  assert.throws(() => drop('b'), /Only cards/);
});
test('dropping an attachment on bare battlefield detaches and ordinary zone moves stay ordinary', () => {
  const state = attachmentTable();
  state.zones.battlefield.cards[0].attached_to = 'b';
  assert.deepEqual(cardDropActions(state, 'p1', { cardId: 'a' }, { zoneId: 'battlefield', controller: 'p1' }).map(item => item.op), [
    { type: 'card', card: 'a', set: { attached_to: null } },
  ]);
  assert.deepEqual(cardDropActions(state, 'p1', { cardId: 'a' }, { zoneId: 'p1:graveyard' }).map(item => item.op), [
    { type: 'move', card: 'a', to: 'p1:graveyard', position: 'bottom' },
  ]);
});
