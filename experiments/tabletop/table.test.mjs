import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTable, observe, applyActions, cardDetails, eventsSince } from './table.mjs';
import { referenceLines } from './references.mjs';

const setup = () => ({
  shuffle: false,
  players: ['p1', 'p2'].map((id, i) => ({ id, deck: [
    { name: 'Secret ' + id, oracle_text: 'Only visible to ' + id, type_line: 'Creature — Human', power: '1', toughness: '1' },
    { name: 'Land ' + id, type_line: 'Basic Land — Plains', count: 3 },
    { name: 'Aura ' + id, type_line: 'Enchantment — Aura' },
  ] })),
});
const act = (state, actor, ...actions) => applyActions(state, actor, state.revision, actions, 'Table test');
function checkConservation(state, expected) {
  const ids = Object.values(state.zones).flatMap(z => z.cards);
  assert.equal(ids.length, expected);
  assert.equal(new Set(ids).size, expected);
  assert.deepEqual([...ids].sort(), Object.keys(state.cards).sort());
}

test('each seat sees its own hand, public observers see counts, and secret IDs do not escape', () => {
  let state = createTable(setup());
  const originalLibraryIDs = [...state.zones['p1:library'].cards];
  state = act(state, 'p1', { type: 'draw', count: 2 });
  state = act(state, 'p2', { type: 'draw', count: 1 });
  const a = observe(state, 'p1');
  const b = observe(state, 'p2');
  const spectator = observe(state);
  assert.equal(a.zones['p1:hand'].cards[0].name, 'Secret p1');
  assert.equal(a.zones['p2:hand'].count, 1);
  assert.deepEqual(a.zones['p2:hand'].cards, []);
  assert.deepEqual(b.zones['p1:hand'].cards, []);
  assert.deepEqual(a.zones['p1:library'].cards, []);
  assert.deepEqual(spectator.zones['p1:hand'].cards, []);
  assert.doesNotMatch(JSON.stringify(spectator), /Secret p1|Secret p2|Only visible/);
  const id = a.zones['p1:hand'].cards[0].id;
  assert.ok(!originalLibraryIDs.includes(id));
  assert.equal(cardDetails(state, 'p1', id).oracle_text, 'Only visible to p1');
  assert.throws(() => cardDetails(state, 'p2', id), /not available/);
  assert.throws(() => act(state, 'p2', { type: 'move', card: id, to: 'battlefield' }), /not available/);
  checkConservation(state, 10);
});

test('failed batches and stale concurrent writes leave the table intact', () => {
  const start = createTable(setup());
  const snapshot = structuredClone(start);
  assert.throws(() => act(start, 'p1', { type: 'draw' }, { type: 'move', card: 'missing', to: 'battlefield' }), /not available/);
  assert.deepEqual(start, snapshot);
  const next = act(start, 'p1', { type: 'draw' });
  assert.throws(() => applyActions(next, 'p2', start.revision, [{ type: 'draw' }], 'Stale action'), /Table changed/);
  assert.equal(next.zones['p2:hand'].cards.length, 0);
  assert.throws(() => act(next, 'p1', { type: 'zone', id: '__proto__', visibility: 'public' }), /Reserved/);
  assert.throws(() => act(next, 'p1', { type: 'shuffle', zone: '__proto__' }), /Unknown zone/);
  checkConservation(next, 10);
});

test('stack, attachments, control, tap, damage, and counters are explicit bookkeeping', () => {
  let state = act(createTable(setup()), 'p1', { type: 'draw', count: 5 });
  const hand = observe(state, 'p1').zones['p1:hand'].cards;
  const creature = hand[0].id;
  const aura = hand[4].id;
  state = act(state, 'p1',
    { type: 'move', card: creature, to: 'stack', position: 'top' },
    { type: 'move', card: aura, to: 'stack', position: 'top' });
  assert.deepEqual(state.zones.stack.cards, [aura, creature]);
  state = act(state, 'p1',
    { type: 'move', card: creature, to: 'battlefield' },
    { type: 'move', card: aura, to: 'battlefield' },
    { type: 'card', card: aura, set: { attached_to: creature } },
    { type: 'card', card: creature, set: { tapped: true, damage: 3, counters: { '+1/+1': 2 }, controller: 'p2' } },
    { type: 'player', player: 'p2', set: { life: 0, counters: { poison: 10 }, mana: { G: 2 } } },
    { type: 'turn', set: { phase: 'Cleanup', active: 'p2', priority: 'p1', number: 2 } });
  assert.equal(state.cards[creature].tapped, true);
  assert.equal(state.cards[creature].damage, 3);
  assert.equal(state.cards[aura].attached_to, creature);
  assert.equal(state.cards[creature].owner, 'p1');
  assert.equal(state.players[1].mana.G, 2);
  assert.equal(state.result, null, 'No rules engine declares a loss or performs cleanup');
  state = act(state, 'p2', { type: 'card', card: creature, set: { damage: 0, counters: {}, tapped: false } });
  assert.deepEqual(state.cards[creature].counters, {});
  checkConservation(state, 10);
});

test('facedown cards conceal identity and shuffling invalidates every known library handle', () => {
  let state = act(createTable(setup()), 'p1', { type: 'draw' });
  const id = observe(state, 'p1').zones['p1:hand'].cards[0].id;
  state = act(state, 'p1',
    { type: 'move', card: id, to: 'battlefield' },
    { type: 'card', card: id, set: { face_down: true, note: 'Private identity hint' } });
  const publicCard = observe(state).zones.battlefield.cards[0];
  assert.equal(publicCard.name, 'Face-down card');
  assert.equal(publicCard.note, undefined);
  assert.equal(publicCard.type_line, undefined);
  assert.equal(cardDetails(state, 'p1', id).name, 'Secret p1');
  assert.throws(() => cardDetails(state, 'p2', id), /concealed/);
  state = act(state, 'p1', { type: 'move', card: id, to: 'p1:library', position: 'top' });
  assert.equal(state.cards[id], undefined);
  state = act(state, 'p1', { type: 'peek', zone: 'p1:library', count: 5 });
  const handles = observe(state, 'p1').zones['p1:library'].cards.map(c => c.id);
  state = act(state, 'p1', { type: 'shuffle' });
  assert.deepEqual(observe(state, 'p1').zones['p1:library'].cards, []);
  assert.ok(handles.every(id => !state.cards[id]));
  checkConservation(state, 10);
});

test('private and public reveals stay visible only until the next hidden move', () => {
  let state = act(createTable(setup()), 'p1', { type: 'draw' });
  const id = observe(state, 'p1').zones['p1:hand'].cards[0].id;
  state = act(state, 'p1', { type: 'reveal', card: id, to: ['p2'] });
  assert.equal(observe(state, 'p2').zones['p1:hand'].cards[0].name, 'Secret p1');
  assert.equal(observe(state).zones['p1:hand'].cards.length, 0);
  state = act(state, 'p1', { type: 'reveal', card: id });
  assert.equal(observe(state).zones['p1:hand'].cards[0].name, 'Secret p1');
  state = act(state, 'p1', { type: 'move', card: id, to: 'p1:library', position: 'bottom' });
  assert.equal(observe(state, 'p2').zones['p1:library'].cards.length, 0);
  checkConservation(state, 10);
});

test('custom zones, tokens and abilities support manual variants without changing ordinary cards', () => {
  let state = act(createTable(setup()), 'p1',
    { type: 'zone', id: 'schemes', visibility: 'hidden' },
    { type: 'token', definition: { name: 'Test token', type_line: 'Token Creature — Robot' }, count: 2 },
    { type: 'stack_item', definition: { name: 'Test trigger', type_line: 'Ability', oracle_text: 'Test instruction.' } });
  const ability = observe(state).zones.stack.cards[0];
  assert.equal(ability.kind, 'ability');
  assert.equal(cardDetails(state, 'p2', ability.id).oracle_text, 'Test instruction.');
  const tokens = observe(state).zones.battlefield.cards;
  state = act(state, 'p2',
    { type: 'remove_stack_item', card: ability.id },
    { type: 'remove_token', card: tokens[0].id },
    { type: 'result', winners: ['p1'], explanation: 'Player judgment after consulting the custom format.' });
  assert.equal(state.result.reported_by, 'p2');
  assert.equal(state.zones.stack.cards.length, 0);
  checkConservation(state, 11);
  state = act(state, 'p1', { type: 'draw', count: 100 });
  assert.equal(state.zones['p1:hand'].cards.length, 5);
  assert.throws(() => act(state, 'p1', { type: 'remove_token', card: state.zones['p1:hand'].cards[0] }), /Only tokens/);
});

test('physical tokens can be imported into a Horde library, drawn and moved explicitly', () => {
  const config = setup();
  config.players[1].deck = [{ name: 'Robot', type_line: 'Token Creature — Robot', count: 4, token: true }];
  let state = act(createTable(config), 'p2', { type: 'draw', count: 2 });
  const drawn = observe(state, 'p2').zones['p2:hand'].cards;
  assert.ok(drawn.every(c => c.token));
  state = act(state, 'p2', { type: 'move', card: drawn[0].id, to: 'battlefield' });
  assert.equal(observe(state).zones.battlefield.cards[0].name, 'Robot');
  state = act(state, 'p2', { type: 'remove_token', card: drawn[0].id });
  checkConservation(state, 8);
});

test('format references contain their expanded procedures and cannot access other files', () => {
  const lines = referenceLines('formats/horde/variants/classic.md');
  assert.ok(!lines.some(line => line.includes('<!--@include')));
  const partial = readFileSync(new URL('../../.vitepress/partials/classic-horde-turn.md', import.meta.url), 'utf8').trim();
  assert.ok(lines.join('\n').includes(partial));
  assert.throws(() => referenceLines('package.json'), /Invalid reference path/);
});

test('both supplied precons contain 60 verified cards and the demo preserves those lists', async () => {
  const { demoSetup } = await import('./demo.mjs');
  const precons = JSON.parse(readFileSync(new URL('./precons.json', import.meta.url), 'utf8'));
  const demo = demoSetup();
  for (const [i, p] of precons.players.entries()) {
    assert.equal(p.deck.reduce((sum, c) => sum + c.count, 0), 60);
    for (const c of p.deck) {
      assert.ok(c.scryfall_id && c.type_line && c.image_url);
      assert.equal(typeof c.oracle_text, 'string');
    }
    const counts = entries => entries.reduce((all, c) => { all[c.name] = (all[c.name] || 0) + c.count; return all; }, {});
    assert.deepEqual(counts(demo.players[i].deck), counts(p.deck));
  }
});

test('the core supports one or many players while requiring nonempty unique seats', () => {
  for (const count of [1, 6, 12]) {
    let state = createTable({
      shuffle: false,
      players: Array.from({ length: count }, (_, i) => ({
        id: 'seat' + i, deck: [{ name: 'Private ' + i, count: 2 }],
      })),
    });
    const last = 'seat' + (count - 1);
    state = act(state, last, { type: 'draw', count: 1 });
    const view = observe(state, last);
    assert.equal(view.players.length, count);
    assert.equal(view.zones[last + ':hand'].cards[0].name, 'Private ' + (count - 1));
    assert.equal(observe(state).zones[last + ':hand'].cards.length, 0);
    checkConservation(state, count * 2);
  }
  assert.throws(() => createTable({ players: [] }), /at least one/);
  assert.throws(() => createTable({ players: [setup().players[0], setup().players[0]] }), /Duplicate player/);
});

test('a pass is a recorded event even when board and priority do not change', () => {
  let state = createTable({ shuffle: false, players: [setup().players[0]] });
  state = act(state, 'p1', { type: 'pass', next: 'p1' });
  const board = structuredClone(state.cards);
  state = act(state, 'p1', { type: 'pass', next: 'p1' });
  assert.equal(state.revision, 2);
  assert.deepEqual(state.cards, board);
  const history = eventsSince(state, null, 0);
  assert.equal(history.events.length, 2);
  assert.equal(history.events[1].changes[0].type, 'pass');
  assert.equal(history.events[1].changes[0].next, 'p1');
  assert.match(history.events[1].summary, /passed priority to p1/);
  assert.throws(() => act(state, 'p1', { type: 'pass', next: 'absent' }), /Unknown player/);
  assert.throws(() => act(state, 'p1', { type: 'no_op' }), /Unknown action/);
});

test('complete history retains private draws without exposing them to another seat or spectator', () => {
  let state = createTable(setup());
  state = applyActions(state, 'p1', 0, [{ type: 'draw' }], 'Keep Secret p1 for later');
  const drawn = observe(state, 'p1').zones['p1:hand'].cards[0];
  for (let i = 0; i < 15; i++) state = act(state, 'p2', { type: 'pass', next: 'p1' });
  assert.equal(observe(state, 'p1').events.length, 12);
  assert.equal(eventsSince(state, 'p1').events.length, 16);
  assert.equal(eventsSince(state, 'p1', 14).events.length, 2);
  assert.match(eventsSince(state, 'p1').events[0].summary, /Secret p1/);
  assert.match(eventsSince(state, 'p1').events[0].reason, /Keep Secret/);
  for (const viewer of [null, 'p2']) {
    const json = JSON.stringify(eventsSince(state, viewer));
    assert.doesNotMatch(json, /Secret p1|Keep Secret|oracle_text/);
    assert.ok(!json.includes(drawn.id));
  }
  // Revealing it later must not rewrite knowledge in the first event.
  state = act(state, 'p1', { type: 'reveal', card: drawn.id });
  assert.doesNotMatch(eventsSince(state).events[0].summary, /Secret p1/);
  assert.match(eventsSince(state).events.at(-1).summary, /Secret p1/);
  assert.throws(() => eventsSince(state, null, -1), /Invalid event revision/);
  assert.throws(() => eventsSince(state, null, state.revision + 1), /Invalid event revision/);
  assert.throws(() => eventsSince(state, 'absent'), /Unknown player/);
});

test('historical public plays retain names and outcomes after cards are concealed again', () => {
  let state = act(createTable(setup()), 'p1', { type: 'draw' });
  const card = observe(state, 'p1').zones['p1:hand'].cards[0];
  state = act(state, 'p1',
    { type: 'move', card: card.id, to: 'battlefield' },
    { type: 'player', player: 'p2', set: { life: 17 } });
  state = act(state, 'p1', { type: 'move', card: card.id, to: 'p1:library' }, { type: 'shuffle' });
  const events = eventsSince(state).events;
  assert.match(events[1].summary, /Secret p1.*battlefield.*life=17/);
  assert.deepEqual(events[1].changes[1].set, { life: 17 });
  assert.match(events[2].summary, /Secret p1.*p1:library.*shuffled/);
  assert.doesNotMatch(JSON.stringify(events[2]), /"id":|"cards":\["Land/);
});

test('history does not reveal transient face-up identities or private face-down annotations in atomic batches', () => {
  let state = act(createTable(setup()), 'p1', { type: 'draw' });
  const card = observe(state, 'p1').zones['p1:hand'].cards[0];
  state = act(state, 'p1',
    { type: 'move', card: card.id, to: 'battlefield' },
    { type: 'card', card: card.id, set: { face_down: true, note: 'Secret p1 private annotation' } });
  for (const viewer of [null, 'p2']) {
    assert.doesNotMatch(JSON.stringify(eventsSince(state, viewer)), /Secret p1|private annotation/);
  }
  assert.match(JSON.stringify(eventsSince(state, 'p1')), /Secret p1/);
});

test('restricted reveals and peeks are recorded only for the recipients', () => {
  let state = createTable(setup());
  state = act(state, 'p1', { type: 'peek', zone: 'p1:library', count: 1 }, { type: 'shuffle' });
  assert.match(eventsSince(state, 'p1').events[0].summary, /Secret p1/);
  assert.doesNotMatch(eventsSince(state, 'p2').events[0].summary, /Secret p1/);
  assert.doesNotMatch(eventsSince(state).events[0].summary, /Secret p1/);
  state = act(state, 'p1', { type: 'draw' });
  const card = observe(state, 'p1').zones['p1:hand'].cards[0];
  state = act(state, 'p1', { type: 'reveal', card: card.id, to: ['p2'] }, { type: 'move', card: card.id, to: 'p1:library' });
  assert.ok(eventsSince(state, 'p2').events.at(-1).changes[0].cards.includes(card.name));
  assert.ok(!JSON.stringify(eventsSince(state).events.at(-1)).includes(card.name));
});

test('legacy event history remains readable without exposing raw actions', () => {
  const state = createTable(setup());
  state.revision = 1;
  state.events = [{ revision: 1, actor: 'p1', at: 'then', summary: 'p1 drew a card', reason: 'private', actions: [{ secret: 'do not expose' }] }];
  assert.deepEqual(eventsSince(state).events, [{ revision: 1, actor: 'p1', at: 'then', summary: 'p1 drew a card' }]);
  assert.equal(eventsSince(state, 'p1').events[0].reason, 'private');
});
