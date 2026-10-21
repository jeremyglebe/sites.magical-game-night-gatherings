import test from 'node:test';
import assert from 'node:assert/strict';
import { createTable, applyActions, observe, eventsSince } from './table.mjs';
import { createRecording, appendRecording, applyFrame, recordingMarkdown } from './game-log.mjs';

test('host log reconstructs real shuffles, concealed handles and actions without credentials', () => {
  const setup = { shuffle: false, players: ['one', 'two'].map(id => ({
    id, deck: [{ name: `Hidden ${id}`, count: 3 }, { name: 'Other', count: 2 }],
  })) };
  let state = createTable(setup);
  let recording = createRecording(state, setup);
  const act = (seat, actions) => {
    const next = applyActions(state, seat, state.revision, actions, 'Test action');
    recording = appendRecording(recording, state, next);
    state = next;
  };
  act('one', [{ type: 'shuffle' }]);
  act('one', [{ type: 'draw', count: 2 }]);
  act('one', [{ type: 'move', card: state.zones['one:hand'].cards[0], to: 'battlefield' }]);
  act('one', [{ type: 'pass', next: 'two' }]);
  let reconstructed = recording.initial;
  for (const frame of recording.frames) reconstructed = applyFrame(reconstructed, frame);
  const { events, ...expected } = state;
  assert.deepEqual(reconstructed, expected);
  const text = recordingMarkdown(recording);
  assert.match(text, /Draw from one:library/);
  assert.match(text, /Pass priority to two/);
  assert.match(text, /Hidden one/);
  assert.equal(recording.frames.length, 4);
  assert.doesNotMatch(JSON.stringify(recording), /credentials/);
});

test('Markdown uses actual per-operation outcomes for consecutive draws and shuffle-then-draw', () => {
  const setup = { shuffle: false, players: [{
    id: 'one', deck: [{ name: 'First' }, { name: 'Second' }, { name: 'Third' }, { name: 'Fourth' }],
  }] };
  const initial = createTable(setup);
  const next = applyActions(initial, 'one', 0, [{ type: 'draw' }, { type: 'draw' }], 'Two consecutive draws');
  let recording = appendRecording(createRecording(initial, setup), initial, next);
  let text = recordingMarkdown(recording);
  assert.match(text, /- Draw from one:library: First\.\n- Draw from one:library: Second\./);
  assert.deepEqual(next.events[0].outcomes.map(outcome => outcome.cards), [['First'], ['Second']]);
  const shuffled = applyActions(next, 'one', 1, [{ type: 'shuffle' }, { type: 'draw', count: 2 }], 'Shuffle, then draw');
  recording = appendRecording(recording, next, shuffled);
  const actuallyDrawn = shuffled.zones['one:hand'].cards.slice(-2).map(id => shuffled.cards[id].definition.name);
  text = recordingMarkdown(recording);
  assert.ok(text.includes('Draw from one:library: ' + actuallyDrawn.join(', ') + '.'));
  assert.deepEqual(shuffled.events[1].outcomes[1].cards, actuallyDrawn);
  // Host details must not make their way into either public event surface.
  assert.doesNotMatch(JSON.stringify(observe(shuffled)), /"outcomes"|"First"|"Second"|"Third"|"Fourth"/);
  assert.doesNotMatch(JSON.stringify(eventsSince(shuffled)), /"outcomes"|"First"|"Second"|"Third"|"Fourth"/);
});

test('legacy batches do not guess draw identities from the pre-batch position', () => {
  const setup = { shuffle: false, players: [{ id: 'one', deck: [{ name: 'First' }, { name: 'Second' }] }] };
  const initial = createTable(setup);
  const next = applyActions(initial, 'one', 0, [{ type: 'draw' }, { type: 'draw' }], 'Old batch');
  delete next.events[0].outcomes;
  const text = recordingMarkdown(appendRecording(createRecording(initial, setup), initial, next));
  assert.match(text, /identities were not captured for this legacy batch/);
  assert.doesNotMatch(text, /Draw from one:library: First/);
});

test('host Markdown renders attributed public speech after each action and replays turn handoffs', () => {
  const setup = { shuffle: false, players: ['one', 'two'].map(id => ({ id, name: id === 'one' ? 'First player' : 'Second player', deck: [{ name: 'Card' }] })) };
  const initial = createTable(setup);
  const next = applyActions(initial, 'one', 0, [
    { type: 'turn', set: { phase: 'Main 1' } },
    { type: 'say', text: 'I keep this hand.\nReady when you are.' },
    { type: 'pass', next: 'two', message: 'Any response?' },
  ], 'Private short justification');
  let recording = appendRecording(createRecording(initial, setup), initial, next);
  const final = applyActions(next, 'two', 1, [{ type: 'pass_turn', next: 'one', message: 'Your turn.' }], 'End my turn');
  recording = appendRecording(recording, next, final);
  const markdown = recordingMarkdown(recording);
  assert.match(markdown, /- Speak to the table\.\n\n> First player: I keep this hand\.\n> Ready when you are\./);
  assert.match(markdown, /- Pass priority to Second player\.\n\n> First player: Any response\?/);
  assert.match(markdown, /- Pass the turn to First player \(turn 2, Untap\)\.\n\n> Second player: Your turn\./);
  let replay = recording.initial;
  for (const frame of recording.frames) replay = applyFrame(replay, frame);
  assert.deepEqual(replay.turn, final.turn);
  assert.deepEqual(replay.notes, final.notes);
});

test('reported player outcomes and corrections survive log export and replay', () => {
  const setup = { shuffle: false, players: ['one', 'two', 'three'].map(id => ({ id, deck: [{ name: 'Card' }] })) };
  let state = createTable(setup);
  let recording = createRecording(state, setup);
  for (const actions of [
    [{ type: 'player', player: 'two', set: { status: 'eliminated' } }],
    [{ type: 'player', player: 'two', set: { status: 'active' } }],
    [{ type: 'player', player: 'three', set: { status: 'conceded' } }, { type: 'result', winners: ['one'], explanation: 'The table reported its outcome.' }],
  ]) {
    const next = applyActions(state, 'one', state.revision, actions, 'Report player outcome');
    recording = appendRecording(recording, state, next);
    state = next;
  }
  const saved = JSON.parse(JSON.stringify(recording));
  let replay = saved.initial;
  for (const frame of saved.frames) replay = applyFrame(replay, frame);
  assert.deepEqual(replay.players, state.players);
  assert.deepEqual(replay.result, state.result);
  const markdown = recordingMarkdown(saved);
  assert.match(markdown, /two: \{"status":"eliminated"\}/);
  assert.match(markdown, /two: \{"status":"active"\}/);
  assert.match(markdown, /three: \{"status":"conceded"\}/);
  assert.match(markdown, /Reported result: one/);
});

test('Jumpstart recording retains selections and forty-card inventories from initially empty libraries', async () => {
  const { createReplay, startingDecks, conversationEvents } = await import('../shared/replay.mjs');
  const setup = { preparation: { kind: 'jumpstart', source: 'zombies-vs-plants-v0.1' },
    players: [{ id: 'one', name: 'Plants player', faction: 'plants', deck: [] },
      { id: 'two', name: 'Zombies player', faction: 'zombies', deck: [] }],
  };
  let state = createTable(setup);
  let recording = createRecording(state, setup);
  const initial = structuredClone(state);
  const act = (seat, actions) => {
    const next = applyActions(state, seat, state.revision, actions, 'Choose packets');
    recording = appendRecording(recording, state, next);
    state = next;
  };
  const packetIds = faction => state.preparation.packets.filter(packet => packet.faction === faction).slice(0, 2).map(packet => packet.id);
  assert.equal(startingDecks(recording)[0].source, 'preparation-pending');
  assert.match(recordingMarkdown(recording), /no deck has been constructed yet/);
  act('one', [{ type: 'select_packets', packetIds: packetIds('plants'), message: 'I chose these nature themes.' }]);
  const intermediate = structuredClone(state);
  assert.equal(recording.constructedDecks, undefined);
  act('two', [{ type: 'select_packets', packetIds: packetIds('zombies'), message: 'I chose these undead themes.' }]);
  assert.equal(Object.keys(recording.initial.cards).length, 0);
  assert.equal(recording.frames[0].delta.preparation.players[0].ready, true);
  assert.equal(recording.frames[1].delta.preparation.status, 'complete');
  assert.equal(recording.constructedDecks.one.reduce((sum, row) => sum + row.count, 0), 40);
  const inventory = structuredClone(recording.constructedDecks);
  act('one', [{ type: 'draw', count: 7 }]);
  act('one', [{ type: 'token', definition: { name: 'Later token' } }]);
  assert.deepEqual(recording.constructedDecks, inventory);
  const saved = JSON.parse(JSON.stringify(recording));
  assert.deepEqual(saved.frames.reduce(applyFrame, saved.initial), (({ events, ...rest }) => rest)(state));
  const replay = createReplay(saved);
  assert.deepEqual(replay.stateAt(0), (({ events, ...rest }) => rest)(initial));
  assert.deepEqual(replay.stateAt(1), (({ events, ...rest }) => rest)(intermediate));
  assert.deepEqual(replay.stateAt(4), (({ events, ...rest }) => rest)(state));
  const decks = startingDecks(saved);
  assert.deepEqual(decks.map(deck => deck.total), [40, 40]);
  assert(decks.every(deck => deck.source === 'preparation'));
  assert(!decks.some(deck => deck.cards.some(card => card.definition.name === 'Later token')));
  assert(decks.every(deck => deck.cards.some(card => card.definition.oracle_text && card.definition.scryfall_id)));
  const text = recordingMarkdown(saved);
  assert.match(text, /Select Jumpstart packets:/);
  assert.match(text, /> Plants player: I chose these nature themes\./);
  assert.match(text, /Complete deck assembled from the selected Jumpstart packets/);
  assert(text.includes(decks[0].cards[0].definition.name));
  assert.equal(conversationEvents(saved)[0].event.changes[0].message, 'I chose these nature themes.');
  // A recording resumed after selection, or an older copy without the inventory
  // convenience field, still reconstructs the exact complete deck definitions.
  assert.deepEqual(startingDecks(createRecording(state, setup)), decks);
  delete saved.constructedDecks;
  assert.deepEqual(startingDecks(saved), decks);
});

test('series recording preserves every reset, per-game sideboard allocation and replay boundary', async () => {
  const { gameSegments, decksForGame, createReplay, conversationEvents } = await import('../shared/replay.mjs');
  const setup = { shuffle: false, series: { mode: 'first_to', winsRequired: 2, sideboarding: true },
    players: ['one', 'two'].map(id => ({ id, name: id, deck: [{ name: id + ' Main', count: 2 }], sideboard: [{ name: id + ' Reserve' }] })),
  };
  let state = createTable(setup), recording = createRecording(state, setup);
  const snapshots = [structuredClone(recording.initial)];
  const act = (actor, actions) => {
    const next = applyActions(state, actor, state.revision, actions, 'Series fixture');
    recording = appendRecording(recording, state, next); state = next;
    snapshots.push((({ events, ...rest }) => rest)(structuredClone(state)));
  };
  act('one', [{ type: 'draw' }, { type: 'token', definition: { name: 'Temporary token' } }, { type: 'player', set: { life: 2 } }]);
  act('one', [{ type: 'result', winners: ['one'], explanation: 'Game one win.' }]);
  const pool = state.series.rosters.one.cards;
  const main = pool.find(card => card.definition.name === 'one Main');
  const reserve = pool.find(card => card.definition.name === 'one Reserve');
  act('one', [{ type: 'sideboard', main: [{ id: main.id, count: 1 }, { id: reserve.id, count: 1 }] }]);
  act('one', [{ type: 'ready_next_game', message: 'Ready for another game.' }]);
  act('two', [{ type: 'ready_next_game' }]);
  act('two', [{ type: 'draw' }]);
  act('one', [{ type: 'result', winners: ['one'], explanation: 'Game two win.' }]);
  const saved = JSON.parse(JSON.stringify(recording));
  const replay = createReplay(saved);
  for (let i = snapshots.length - 1; i >= 0; i--) assert.deepEqual(replay.stateAt(i), snapshots[i]);
  assert.deepEqual(gameSegments(saved).map(game => [game.gameNumber, game.position]), [[1, 0], [2, 5]]);
  assert.deepEqual(gameSegments(saved).map(game => game.result.explanation), ['Game one win.', 'Game two win.']);
  const first = decksForGame(saved, 1)[0], second = decksForGame(saved, 2)[0];
  assert.deepEqual(first.cards.map(row => [row.definition.name, row.count]), [['one Main', 2]]);
  assert.deepEqual(first.sideboard.map(row => [row.definition.name, row.count]), [['one Reserve', 1]]);
  assert.deepEqual(second.cards.map(row => [row.definition.name, row.count]), [['one Main', 1], ['one Reserve', 1]]);
  assert.deepEqual(second.sideboard.map(row => [row.definition.name, row.count]), [['one Main', 1]]);
  assert(!JSON.stringify(saved.gameDecks).includes('Temporary token'));
  assert.equal(conversationEvents(saved)[3].event.changes[0].message, 'Ready for another game.');
  const markdown = recordingMarkdown(saved);
  assert.match(markdown, /### Game 2/);
  assert.match(markdown, /## Match outcome/);
  assert.match(markdown, /Sideboard \(1\)/);
  assert.match(markdown, /one 2 · two 0/);
  delete saved.gameDecks;
  assert.deepEqual(decksForGame(saved, 2), [second, decksForGame(recording, 2)[1]], 'reset snapshot reconstructs inventories if convenience field is absent');
});

test('resetting to packet selection records the new game deck only after new choices complete', async () => {
  const { gameSegments, decksForGame } = await import('../shared/replay.mjs');
  const setup = { preparation: { kind: 'jumpstart', source: 'zombies-vs-plants-v0.1' },
    series: { mode: 'first_to', winsRequired: 2, resetTo: 'preparation' },
    players: [{ id: 'one', name: 'Plants', faction: 'plants', deck: [] }, { id: 'two', name: 'Zombies', faction: 'zombies', deck: [] }],
  };
  let state = createTable(setup), recording = createRecording(state, setup);
  const act = (actor, actions) => {
    const next = applyActions(state, actor, state.revision, actions, 'Repick fixture');
    recording = appendRecording(recording, state, next); state = next;
  };
  const select = offset => {
    for (const [id, faction] of [['one', 'plants'], ['two', 'zombies']]) act(id, [{ type: 'select_packets',
      packetIds: state.preparation.packets.filter(packet => packet.faction === faction).slice(offset, offset + 2).map(packet => packet.id) }]);
  };
  select(0);
  const first = structuredClone(recording.gameDecks[0]);
  act('one', [{ type: 'result', winners: ['one'] }]);
  act('one', [{ type: 'ready_next_game' }]);
  act('two', [{ type: 'ready_next_game' }]);
  assert.equal(state.series.gameNumber, 2);
  assert.equal(state.preparation.status, 'selecting');
  assert.equal(recording.gameDecks.length, 1, 'empty selecting libraries are not a deck');
  select(2);
  assert.equal(recording.gameDecks.length, 2);
  assert.deepEqual(recording.gameDecks[0], first);
  const oldDeck = decksForGame(recording, 1)[0], newDeck = decksForGame(recording, 2)[0];
  assert.equal(oldDeck.total, 40);
  assert.equal(newDeck.total, 40);
  assert.notDeepEqual(oldDeck.cards, newDeck.cards);
  assert.deepEqual(gameSegments(recording).map(game => [game.gameNumber, game.position]), [[1, 2], [2, 7]]);
});

test('review and exported logs retain per-game actual turns across extra turns, skipped players and resets', async () => {
  const { gameSegments, conversationEvents } = await import('../shared/replay.mjs');
  const setup = { shuffle: false, series: { mode: 'first_to', winsRequired: 2 },
    players: ['one', 'two', 'three'].map(id => ({ id, name: id, deck: [{ name: 'Card' }] })),
  };
  let state = createTable(setup), recording = createRecording(state, setup);
  const act = (actor, actions) => {
    const next = applyActions(state, actor, state.revision, actions, 'Turn-count review fixture');
    recording = appendRecording(recording, state, next); state = next;
  };
  act('one', [{ type: 'turn', set: { phase: 'Main 1' } }, { type: 'pass_turn', next: 'two' }]);
  act('two', [{ type: 'pass_turn', next: 'one' }]);
  act('one', [{ type: 'pass_turn', next: 'one' }]);
  act('one', [{ type: 'turn', set: { number: 90 } }, { type: 'pass_turn', next: 'three' }]);
  act('three', [{ type: 'result', winners: ['one'] }]);
  for (const id of ['one', 'two', 'three']) act(id, [{ type: 'ready_next_game' }]);
  act('two', [{ type: 'turn', set: { phase: 'Untap' } }]);
  const segments = gameSegments(recording);
  assert.deepEqual(segments[0].turn.counts, { one: 3, two: 1, three: 1 });
  assert.equal(segments[0].turn.totalTurns, 5);
  assert.deepEqual(segments[1].turn.counts, { one: 0, two: 1, three: 0 });
  assert.equal(segments[1].turn.totalTurns, 1);
  const handoff = conversationEvents(recording)[1].event.changes.find(change => change.type === 'pass_turn');
  assert.deepEqual(handoff.set.counts, { one: 2, two: 1, three: 0 });
  assert.equal(handoff.set.totalTurns, 3);
  assert.equal(handoff.set.countsComplete, true);
  const markdown = recordingMarkdown(recording);
  assert.match(markdown, /Turns begun: one 3 · two 1 · three 1 · 5 individual turns total/);
  assert.match(markdown, /Turns begun: one 0 · two 1 · three 0 · 1 individual turn total/);
  assert.match(markdown, /Pass the turn to one \(turn 3, Untap\)/);
});

test('older exports identify a global turn marker without inventing per-player counts', () => {
  const state = createTable({ players: [{ id: 'one', name: 'Alice', deck: [{ name: 'Card' }] }] });
  delete state.turn.counts;
  delete state.turn.totalTurns;
  delete state.turn.countsComplete;
  state.turn.number = 15;
  const recording = createRecording(state);
  const text = recordingMarkdown(recording);
  assert.match(text, /Per-player turn counts unavailable for this recording/);
  assert.doesNotMatch(text, /15 individual turns|Turns begun:/);
});
