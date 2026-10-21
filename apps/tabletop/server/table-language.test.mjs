import test from 'node:test';
import assert from 'node:assert/strict';
import { playerLabel, zoneLabel, phaseLabel, turnLabel, turnNumberLabel, turnCountSummary, actionText } from '../shared/table-language.mjs';
import { createTable, applyActions, eventsSince } from './table.mjs';

const players = [{ id: 'p1', name: 'Frederick' }, { id: 'p2', name: 'Gianmarco' }];
const context = { players, actor: 'p2' };
const text = (change) => actionText(change, context);

test('labels use configured names, readable zones, and common phase names without changing identifiers', () => {
  assert.equal(playerLabel('p2', players), 'Gianmarco');
  assert.equal(playerLabel('p7'), 'Player 7');
  assert.equal(zoneLabel('p2:graveyard', players), "Gianmarco's Graveyard");
  assert.equal(zoneLabel('p1:library', players), "Frederick's Deck");
  assert.equal(zoneLabel({ id: 'battlefield', owner: 'p2' }, players), "Gianmarco's Battlefield");
  assert.equal(zoneLabel({ id: 'battlefield', name: 'A shared battlefield' }, players), 'A shared battlefield');
  assert.equal(zoneLabel('stack', players), 'Stack');
  const custom = [{ id: 'seat:one', name: 'P2 the Player' }, { id: 'seat', name: 'Other' }];
  assert.equal(zoneLabel('seat:one:graveyard', custom), "P2 the Player's Graveyard");
  assert.equal(phaseLabel('end of combat'), 'End of Combat');
  assert.equal(phaseLabel('Main 1'), 'Main Phase 1');
  assert.equal(phaseLabel('declare_blockers'), 'Declare Blockers');
});

test('projected action fields produce readable handoffs, phase changes, and unresolved abilities', () => {
  assert.equal(text({ type: 'turn', set: { phase: 'End of combat' } }), 'Gianmarco moves to End of Combat');
  assert.equal(text({ type: 'turn', set: { number: 4, active: 'p1', priority: 'p2', phase: 'Main 2' } }), 'Turn marker 4: Frederick; Gianmarco moves to Main Phase 2; Gianmarco has priority');
  assert.equal(text({ type: 'turn', set: { priority: null } }), 'No player has priority');
  assert.equal(text({ type: 'stack_item', cards: ['Shambling Ghast death trigger'] }), 'Gianmarco announces Shambling Ghast death trigger');
  assert.equal(text({ type: 'pass', next: 'p1' }), 'Gianmarco passes priority to Frederick');
  assert.equal(text({ type: 'pass_turn', next: 'p1', set: { number: 5, phase: 'Untap' } }), 'Gianmarco passes the turn to Frederick · turn marker 5 · Untap');
  assert.equal(text({ type: 'ready_next_game', game_started: true, game_number: 2, set: { active: 'p1' } }), 'Gianmarco is ready for the next game; game 2 begins with Frederick');
});

test('turn wording uses actual player counts rather than dividing the global marker', () => {
  const turn = { number: 90, active: 'p1', counts: { p1: 5, p2: 3 }, totalTurns: 8, countsComplete: true };
  assert.equal(turnLabel(turn, players), "Frederick's turn 5");
  assert.equal(turnCountSummary(turn, players), 'Turns begun: Frederick 5 · Gianmarco 3 · 8 individual turns total');
  assert.equal(text({ type: 'pass_turn', next: 'p1', set: { ...turn, phase: 'Untap' } }), 'Gianmarco passes the turn to Frederick · turn 5 · Untap');
  const partial = { ...turn, countsComplete: false };
  assert.equal(turnLabel(partial, players), "Frederick's recorded turn 5");
  assert.equal(turnCountSummary(partial, players), 'Recorded turns begun: Frederick 5 · Gianmarco 3 · 8 individual turns recorded');
  assert.equal(turnLabel({ ...turn, counts: { p1: 0, p2: 0 }, totalTurns: 0 }, players), 'Setup');
  assert.equal(turnNumberLabel(turn, 'p2'), 'turn 3');
  assert.equal(turnLabel({ number: 15, active: 'p2' }, players), 'Turn marker 15 · Gianmarco');
  assert.equal(turnCountSummary({ number: 15, active: 'p2' }, players), 'Per-player turn counts unavailable for this recording.');
});

test('physical card actions retain names and describe only supplied public details', () => {
  assert.equal(text({ type: 'move', cards: ['Regrowth'], from: 'p2:hand', to: 'p2:graveyard' }), 'Gianmarco moves Regrowth from their hand to their graveyard');
  assert.equal(text({ type: 'move', from: 'p2:hand', to: 'p2:library' }), 'Gianmarco moves a concealed card from their hand to their deck');
  assert.equal(text({ type: 'draw', count: 1, from: 'p2:library', to: 'p2:hand' }), 'Gianmarco draws 1 card');
  assert.equal(text({ type: 'draw', count: 2, cards: ['Forest', 'Swamp'], from: 'p2:library', to: 'p2:hand' }), 'Gianmarco draws 2 cards: Forest, Swamp');
  assert.equal(text({ type: 'card', cards: ['Forest'], set: { tapped: false } }), 'Gianmarco untaps Forest');
  assert.equal(text({ type: 'card', cards: ['Forest'], set: { tapped: true, counters: { '+1/+1': 2 }, damage: 1 } }), 'Gianmarco taps Forest; Gianmarco marks 1 damage on Forest; Gianmarco sets the counters on Forest to 2 +1/+1');
  assert.equal(text({ type: 'card', cards: ['p2 the Card'], set: { attached_to: 'p1 the Aura', note: 'p1 should check this' } }), 'Gianmarco attaches p2 the Card to p1 the Aura; Gianmarco notes on p2 the Card: p1 should check this');
  assert.equal(text({ type: 'card', set: { face_down: true } }), 'Gianmarco turns a concealed card face down');
  assert.equal(text({ type: 'remove_stack_item', cards: ['Death trigger'] }), 'Gianmarco removes Death trigger from the stack');
  assert.equal(text({ type: 'shuffle', zone: 'p2:library' }), 'Gianmarco shuffles their deck');
  assert.equal(text({ type: 'peek', from: 'p2:library', count: 2 }), 'Gianmarco looks at 2 cards in their deck');
  assert.equal(text({ type: 'reveal', cards: ['Forest'] }), 'Gianmarco reveals Forest');
});

test('play and resolution wording follows the recorded source and destination', () => {
  const play = { type: 'move', actor: 'p1', cards: ['Forest'], from: 'p1:hand', to: 'battlefield' };
  const before = structuredClone(play);
  assert.equal(text(play), 'Frederick plays Forest');
  assert.deepEqual(play, before, 'display wording must not alter the recorded move');
  assert.equal(text({ type: 'move', cards: ['Shambling Ghast'], from: 'stack', to: 'battlefield' }), 'Shambling Ghast resolves');
  assert.equal(text({ type: 'move', cards: ['Forest', 'Swamp'], from: 'stack', to: 'battlefield' }), 'Forest and Swamp resolve');
  assert.equal(text({ type: 'move', cards: ['Shambling Ghast'], from: 'p2:graveyard', to: 'battlefield' }), 'Gianmarco moves Shambling Ghast from their graveyard to the battlefield');
  assert.equal(text({ type: 'move', cards: ['Forest'], from: 'p2:library', to: 'battlefield' }), 'Gianmarco moves Forest from their deck to the battlefield');
  assert.equal(text({ type: 'move', cards: ['Shambling Ghast'], from: 'stack', to: 'p2:graveyard' }), 'Gianmarco moves Shambling Ghast from the stack to their graveyard');
  assert.equal(text({ type: 'move', cards: ['Forest'], from: 'p1:hand', to: 'battlefield' }), "Gianmarco moves Forest from Frederick's Hand to the battlefield");
  assert.doesNotMatch(text({ type: 'move', from: 'p2:hand', to: 'battlefield', summary: 'Legacy identity: Secret card' }), /Secret card|Legacy identity/);
});

test('own-zone wording never changes which player owns another deck', () => {
  assert.equal(actionText({ type: 'shuffle', zone: 'p1:library' }, { players, actor: 'p1' }), 'Frederick shuffles their deck');
  assert.equal(actionText({ type: 'shuffle', zone: 'p2:library' }, { players, actor: 'p1' }), "Frederick shuffles Gianmarco's Deck");
  assert.equal(text({ type: 'move', cards: ['Forest'], from: 'p2:hand', to: 'p1:graveyard' }), "Gianmarco moves Forest from their hand to Frederick's Graveyard");
  const custom = [{ id: 'seat:one', name: 'Rowan' }, { id: 'seat', name: 'Alex' }];
  assert.equal(actionText({ type: 'shuffle', zone: 'seat:one:library' }, { players: custom, actor: 'seat' }), "Alex shuffles Rowan's Deck");
});

test('life, mana, player status, and results avoid raw field syntax', () => {
  assert.equal(text({ type: 'player', player: 'p1', set: { life: 16, mana: {}, counters: { poison: 2 } } }), "Frederick is now at 16 life; Frederick's counters are now 2 poison; Frederick's mana pool is empty");
  assert.equal(text({ type: 'player', player: 'p2', set: { status: 'conceded' } }), 'Gianmarco concedes');
  assert.equal(text({ type: 'player', player: 'p1', set: { status: 'eliminated' } }), 'Frederick is eliminated');
  assert.equal(text({ type: 'result', result: { winners: ['p1'], explanation: 'Gianmarco conceded.' } }), 'Gianmarco reports Frederick wins: Gianmarco conceded.');
});

test('legacy fallbacks and authored text preserve card names and prose, without mutating data', () => {
  const input = { type: 'stack_item', summary: 'p2 added an ability to the stack: p1 the Card trigger' };
  const before = structuredClone(input);
  assert.equal(text(input), 'Gianmarco announces p1 the Card trigger');
  assert.deepEqual(input, before);
  assert.equal(text({ type: 'select_packets', summary: 'p2 selected The Turned + Ancient Tombs' }), 'Gianmarco selects The Turned + Ancient Tombs');
  assert.equal(text({ type: 'say', text: 'p1, nice move!' }), 'p1, nice move!');
  assert.equal(text({ type: 'note', text: 'Set phase="End of combat" after p1 responds' }), 'Note: Set phase="End of combat" after p1 responds');
  assert.equal(actionText({ type: 'move', summary: 'Played Mountain' }), 'Played Mountain');
  assert.equal(text({ type: 'unknown', summary: 'A custom p2 result' }), 'A custom p2 result');
});

test('real projected histories never reveal private cards or notes through friendly formatting', () => {
  let state = createTable({ shuffle: false, players: players.map(player => ({ ...player, deck: [{ name: `${player.name} secret card`, count: 2 }] })) });
  state = applyActions(state, 'p2', state.revision, [{ type: 'draw', count: 1 }], 'private reasoning');
  const publicEvent = eventsSince(state).events.at(-1);
  const privateEvent = eventsSince(state, 'p2').events.at(-1);
  assert.equal(actionText(publicEvent.changes[0], { players, actor: publicEvent.actor }), 'Gianmarco draws 1 card');
  assert.match(actionText(privateEvent.changes[0], { players, actor: privateEvent.actor }), /Gianmarco secret card/);
  assert.doesNotMatch(JSON.stringify(publicEvent.changes.map(change => actionText(change, { players, actor: publicEvent.actor }))), /secret card|private reasoning/);
});
