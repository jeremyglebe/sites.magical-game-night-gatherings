import test from 'node:test';
import assert from 'node:assert/strict';
import { createTable, applyActions, observe, eventsSince, cardDetails } from './table.mjs';
import { createRecording, appendRecording } from './game-log.mjs';

const revealed = {
  name: 'Revealed test creature', type_line: 'Creature — Test', mana_cost: '{1}{G}',
  oracle_text: 'A card identity that the table was explicitly shown.', power: '2', toughness: '2',
  image_url: 'https://cards.scryfall.io/normal/front/a/b/reveal-test.jpg',
};
const setup = () => ({ shuffle: false, players: ['one', 'two', 'three'].map(id => ({
  id, deck: id === 'one' ? [revealed, { name: 'Unrevealed secret' }] : [{ name: `Other ${id}` }],
})) });
const act = (state, actor, ...actions) => applyActions(state, actor, state.revision, actions, 'Reveal test');
const lastChange = (state, viewer = null) => eventsSince(state, viewer).events.at(-1).changes[0];

test('a public reveal adds an inspectable identity snapshot without exposing the rest of the hand', () => {
  let state = act(createTable(setup()), 'one', { type: 'draw', count: 2 });
  const id = observe(state, 'one').zones['one:hand'].cards[0].id;
  state = act(state, 'one', { type: 'card', card: id, set: { note: 'Private tactical note' } });
  state = act(state, 'one', { type: 'reveal', card: id });
  for (const viewer of [null, 'one', 'two', 'three']) {
    const snapshot = lastChange(state, viewer).revealedCards[0];
    assert.deepEqual(snapshot, { ...revealed, kind: 'card', token: false });
    assert.equal(snapshot.id, undefined, 'historical identities are not live card handles');
    assert.equal(snapshot.note, undefined, 'private annotations are not part of a disclosure');
  }
  assert.doesNotMatch(JSON.stringify(eventsSince(state)), /Unrevealed secret|Private tactical note/);
  const returned = lastChange(state).revealedCards[0];
  returned.name = 'Changed by a caller';
  assert.equal(lastChange(state).revealedCards[0].name, revealed.name, 'projections are detached copies');
});

test('a targeted reveal provides snapshots only to the revealer and selected recipients', () => {
  let state = act(createTable(setup()), 'one', { type: 'draw' });
  const id = observe(state, 'one').zones['one:hand'].cards[0].id;
  state = act(state, 'one', { type: 'reveal', card: id, to: ['two'] });
  for (const viewer of ['one', 'two']) assert.equal(lastChange(state, viewer).revealedCards[0].name, revealed.name);
  for (const viewer of [null, 'three']) {
    assert.equal(lastChange(state, viewer).revealedCards, undefined);
    assert.doesNotMatch(JSON.stringify(eventsSince(state, viewer)), /Revealed test creature|reveal-test\.jpg|explicitly shown/);
  }
  assert.equal(state.events.at(-1).outcomes[0].revealedCards[0].name, revealed.name, 'host-only outcomes retain the reveal');
});

test('reveal snapshots survive concealment in the same batch and JSON recording without tracking a hidden handle', () => {
  let state = act(createTable(setup()), 'one', { type: 'draw' });
  const id = observe(state, 'one').zones['one:hand'].cards[0].id;
  const before = state;
  state = act(state, 'one',
    { type: 'reveal', card: id },
    { type: 'move', card: id, to: 'one:library', position: 'bottom' },
    { type: 'shuffle' },
  );
  assert.throws(() => cardDetails(state, null, id), /not available/);
  assert.equal(observe(state).zones['one:library'].cards.length, 0);
  const recorded = JSON.parse(JSON.stringify(appendRecording(createRecording(before), before, state)));
  const change = recorded.frames[0].event.public.changes[0];
  assert.deepEqual(change.revealedCards[0], { ...revealed, kind: 'card', token: false });
  const history = JSON.parse(JSON.stringify(state));
  assert.deepEqual(lastChange(history).revealedCards, change.revealedCards);
  for (const liveId of Object.keys(state.cards)) assert.ok(!JSON.stringify(change.revealedCards).includes(liveId));
});

test('drawing, peeking, and moving a card never fabricate reveal attachments', () => {
  let state = act(createTable(setup()), 'one', { type: 'peek', zone: 'one:library' });
  const id = observe(state, 'one').zones['one:library'].cards[0].id;
  state = act(state, 'one', { type: 'move', card: id, to: 'battlefield' });
  state = act(state, 'one', { type: 'draw' });
  for (const viewer of [null, 'one', 'two', 'three']) {
    assert.ok(eventsSince(state, viewer).events.every(event => event.changes.every(change => change.revealedCards === undefined)));
  }
});
