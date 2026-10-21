// These are starts of actual player turns, not the editable global turn marker.
// No seating-order arithmetic: extra turns, skipped players and eliminations
// are represented by the explicit turn changes that players submit.
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const ids = players => players.map(player => typeof player === 'string' ? player : player.id);
const setupPhase = phase => /^(setup|pack selection|preparation|opening hands?|mulligans?)(?:\b|$)/i.test(String(phase || '').trim());

export function freshTurnCounts(players, complete = true) {
  return { counts: Object.fromEntries(ids(players).map(id => [id, 0])), totalTurns: 0, countsComplete: complete };
}

export function hasTurnCounts(turn, players) {
  return record(turn?.counts) && typeof turn.countsComplete === 'boolean'
    && ids(players).every(id => Object.hasOwn(turn.counts, id) && Number.isSafeInteger(turn.counts[id]) && turn.counts[id] >= 0)
    && Number.isSafeInteger(turn.totalTurns)
    && turn.totalTurns === ids(players).reduce((total, id) => total + turn.counts[id], 0);
}

function countsFrom(turn, players) {
  return hasTurnCounts(turn, players)
    ? { counts: Object.fromEntries(ids(players).map(id => [id, turn.counts[id]])), totalTurns: turn.totalTurns, countsComplete: turn.countsComplete }
    : freshTurnCounts(players, false);
}

/** Return a new turn marker after one accepted operation. Never mutate inputs. */
export function advanceTurnCounts(before, after, action, players) {
  const stats = countsFrom(before, players);
  // pass_turn itself declares a new turn; its optional free-text phase label
  // cannot undo that declaration. Use pass for setup / mulligan handoffs.
  const startsTurn = action.type === 'pass_turn'
    || (action.type === 'turn' && !setupPhase(after.phase)
      && (before.active !== after.active || (stats.totalTurns === 0 && setupPhase(before.phase))));
  if (startsTurn && Object.hasOwn(stats.counts, after.active)) {
    stats.counts[after.active]++;
    stats.totalTurns++;
  }
  return { ...after, ...stats };
}

/**
 * Recover old saves from their explicit operations, never by dividing number.
 * Missing history stays visibly partial. A recorded next-game reset establishes
 * a fresh, complete starting point even when an earlier game's history is absent.
 * Observation is read-only; the next accepted action persists the recovered data.
 */
export function turnWithCounts(state) {
  const players = state.players || [];
  if (hasTurnCounts(state.turn, players)) return { ...state.turn, ...countsFrom(state.turn, players) };
  let turn = { number: 1, active: players[0]?.id, priority: null, phase: 'Setup', ...freshTurnCounts(players) };
  let previousRevision = 0;
  for (const event of state.events || []) {
    if (event.revision !== previousRevision + 1) turn.countsComplete = false;
    previousRevision = event.revision;
    const changes = event.outcomes || event.public?.changes || event.changes || [];
    const actions = Array.isArray(event.actions) ? event.actions : changes;
    if (!actions.length) { turn.countsComplete = false; continue; }
    for (const [index, action] of actions.entries()) {
      const outcome = changes[index] || action;
      if (action.type === 'ready_next_game' && outcome.game_started) {
        turn = { number: 1, active: outcome.set?.active || outcome.next, priority: outcome.set?.priority || outcome.next,
          phase: outcome.set?.phase || 'Setup', ...freshTurnCounts(players) };
      } else if (action.type === 'turn') {
        const after = { ...turn, ...action.set };
        // A legacy marker edit may have represented an unrecorded extra turn.
        // Preserve the known starts without pretending that edit proves one.
        if (action.set?.number !== undefined && action.set.number !== turn.number
          && after.active === turn.active && turn.totalTurns > 0 && !hasTurnCounts(outcome.set, players)) turn.countsComplete = false;
        turn = advanceTurnCounts(turn, after, action, players);
      } else if (action.type === 'pass_turn') {
        turn = advanceTurnCounts(turn, {
          number: action.number ?? outcome.set?.number ?? turn.number + 1,
          active: action.next, priority: action.next, phase: action.phase ?? outcome.set?.phase ?? 'Untap',
        }, action, players);
      } else if (action.type === 'pass') turn.priority = action.next;
      if (hasTurnCounts(outcome.set, players)) Object.assign(turn, countsFrom(outcome.set, players));
    }
  }
  if (previousRevision !== state.revision || turn.active !== state.turn?.active || turn.number !== state.turn?.number
    || (!setupPhase(state.turn?.phase) && setupPhase(turn.phase))) turn.countsComplete = false;
  return { ...state.turn, ...countsFrom(turn, players) };
}
