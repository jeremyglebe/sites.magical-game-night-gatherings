import test from 'node:test';
import assert from 'node:assert/strict';
import { createTable, applyActions, observe } from './table.mjs';
import { turnWithCounts } from '../shared/turn-counts.mjs';
import { previewHumanActions } from '../shared/human-preview.mjs';

const fixture = (series) => createTable({ series, shuffle: false,
  players: ['a', 'b', 'c'].map(id => ({ id, deck: [{ name: 'Forest', count: 10 }] })) });
const act = (state, actor, ...actions) => applyActions(state, actor, state.revision, actions, 'Turn count fixture');
const start = state => act(state, 'a', { type: 'turn', set: { phase: 'Main 1' } });
const pass = (state, next, extra = {}) => act(state, state.turn.active, { type: 'pass_turn', next, ...extra });
const stats = turn => ({ counts: turn.counts, total: turn.totalTurns, complete: turn.countsComplete });
function assertCounts(turn, counts, complete = true) {
  assert.deepEqual(stats(turn), { counts, total: Object.values(counts).reduce((a, b) => a + b, 0), complete });
}
function legacy(state) {
  const old = structuredClone(state);
  function strip(turn) { if (turn) for (const field of ['counts', 'totalTurns', 'countsComplete']) delete turn[field]; }
  strip(old.turn);
  for (const event of old.events) for (const change of [
    ...(event.outcomes || []), ...(event.public?.changes || []),
    ...Object.values(event.seats || {}).flatMap(seat => seat.changes || []),
  ]) strip(change.set);
  return old;
}

test('setup and priority are not turns; phase changes and editable numbers never double-count a start', () => {
  let state = fixture();
  assertCounts(state.turn, { a: 0, b: 0, c: 0 });
  state = act(state, 'a', { type: 'draw', count: 7 }, { type: 'turn', set: { phase: 'Mulligans', active: 'b' } }, { type: 'pass', next: 'b' });
  assertCounts(state.turn, { a: 0, b: 0, c: 0 });
  state = act(state, 'b', { type: 'turn', set: { phase: 'Untap', priority: 'b' } });
  assertCounts(state.turn, { a: 0, b: 1, c: 0 });
  state = act(state, 'b', { type: 'turn', set: { phase: 'Upkeep' } }, { type: 'turn', set: { phase: 'Main 1', number: 99 } }, { type: 'pass', next: 'a' });
  state = act(state, 'a', { type: 'pass', next: 'b' });
  assertCounts(state.turn, { a: 0, b: 1, c: 0 });
  assert.equal(state.turn.number, 99, 'the old editable global marker is retained');
  assertCounts(observe(state).turn, state.turn.counts);
  assertCounts(state.events.at(-3).public.changes[0].set, { a: 0, b: 1, c: 0 });
});

test('explicit starts track extra turns, skipped seats and active-player changes without assuming cycles', () => {
  let state = start(fixture());
  state = pass(state, 'b');
  state = pass(state, 'b', { number: 2 }); // same-player extra turn, even when number is unchanged
  state = pass(state, 'a'); // c is skipped
  assertCounts(state.turn, { a: 2, b: 2, c: 0 });
  state = act(state, 'a', { type: 'turn', set: { active: 'c', priority: 'c', phase: 'Main 1' } });
  assertCounts(state.turn, { a: 2, b: 2, c: 1 });
  const before = structuredClone(state);
  assert.throws(() => act(state, 'c', { type: 'turn', set: { phase: 'Upkeep', counts: { c: 99 } } }), /Unsupported turn field/);
  assert.deepEqual(state, before, 'failed changes do not corrupt counters');
});

test('passing from setup starts only the recipient, and human drafts match commits and undo cleanly', () => {
  let state = fixture();
  const actions = [{ type: 'pass_turn', next: 'c' }];
  const view = observe(state, 'a');
  const draft = previewHumanActions(view, 'a', actions);
  state = act(state, 'a', ...actions);
  assertCounts(state.turn, { a: 0, b: 0, c: 1 });
  assert.deepEqual(draft.table.turn, state.turn);
  assertCounts(previewHumanActions(view, 'a', []).table.turn, { a: 0, b: 0, c: 0 });
  const phaseDraft = previewHumanActions(view, 'a', [{ type: 'turn', set: { phase: 'Main 1' } }]);
  assertCounts(phaseDraft.table.turn, { a: 1, b: 0, c: 0 });
  assertCounts(pass(fixture(), 'b', { phase: 'Setup' }).turn, { a: 0, b: 1, c: 0 }, true);
});

test('legacy history reconstructs actual starts and the next accepted action persists them', () => {
  let state = start(fixture());
  state = pass(pass(pass(state, 'b'), 'b'), 'a');
  const old = legacy(state), snapshot = structuredClone(old);
  assertCounts(turnWithCounts(old), { a: 2, b: 2, c: 0 });
  assertCounts(observe(old, 'b').turn, { a: 2, b: 2, c: 0 });
  assert.deepEqual(old, snapshot, 'migration on read never rewrites the save');
  state = pass(old, 'c');
  assertCounts(state.turn, { a: 2, b: 2, c: 1 });
  assertCounts(state.events.at(-1).public.changes[0].set, { a: 2, b: 2, c: 1 });
});

test('missing history or ambiguous old number edits are partial, never estimated by division', () => {
  let state = pass(start(fixture()), 'b');
  const old = legacy(state);
  old.events = [];
  old.turn.number = 100;
  assertCounts(turnWithCounts(old), { a: 0, b: 0, c: 0 }, false);
  assertCounts(pass(old, 'a').turn, { a: 1, b: 0, c: 0 }, false);
  state = act(state, 'b', { type: 'turn', set: { number: 50 } });
  assertCounts(turnWithCounts(legacy(state)), { a: 1, b: 1, c: 0 }, false);
  assertCounts(state.turn, { a: 1, b: 1, c: 0 });
});

test('series records finished-game counts and resets before the next chosen starter begins', () => {
  let state = pass(start(fixture({ mode: 'first_to', winsRequired: 2 })), 'b');
  state = act(state, 'b', { type: 'result', winners: ['b'] });
  assertCounts(state.series.games[0].turn, { a: 1, b: 1, c: 0 });
  state = act(state, 'a', { type: 'ready_next_game', starting_player: 'c' });
  state = act(state, 'b', { type: 'ready_next_game' });
  state = act(state, 'c', { type: 'ready_next_game' });
  assertCounts(state.turn, { a: 0, b: 0, c: 0 });
  assert.equal(state.turn.active, 'c');
  assertCounts(turnWithCounts(legacy(state)), { a: 0, b: 0, c: 0 });
  const resetOnly = legacy(state);
  resetOnly.events = resetOnly.events.slice(-1);
  assertCounts(turnWithCounts(resetOnly), { a: 0, b: 0, c: 0 });
  state = act(state, 'c', { type: 'turn', set: { phase: 'Untap' } });
  assertCounts(state.turn, { a: 0, b: 0, c: 1 });
  assertCounts(turnWithCounts(legacy(state)), { a: 0, b: 0, c: 1 });
  assertCounts(state.series.games[0].turn, { a: 1, b: 1, c: 0 });
});
