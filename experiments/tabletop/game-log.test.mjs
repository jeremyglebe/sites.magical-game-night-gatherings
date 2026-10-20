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
