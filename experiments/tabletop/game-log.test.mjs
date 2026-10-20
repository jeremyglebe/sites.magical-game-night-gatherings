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
