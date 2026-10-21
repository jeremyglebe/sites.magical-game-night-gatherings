import { revealedCardSnapshots } from './revealed-cards.mjs';

// Browser-compatible owner-review helpers. Replay applies recorded deltas;
// it never executes game actions, shuffles again, or interprets game rules.
const clone = value => structuredClone(value);
const stateFields = ['revision', 'players', 'turn', 'notes', 'result'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const unsafeKey = key => ['__proto__', 'constructor', 'prototype'].includes(key);
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };

export function validateRecording(value) {
  requireThat(record(value) && value.format === 'game-night-playtest-log', 'This is not a Game Night recording.');
  requireThat(value.version === 1, 'This recording version is not supported.');
  const initial = value.initial;
  requireThat(record(initial) && Array.isArray(initial.players) && record(initial.turn)
    && record(initial.cards) && record(initial.zones), 'The recording has no usable starting position.');
  requireThat(Number.isSafeInteger(initial.revision) && initial.revision >= 0, 'The starting revision is invalid.');
  requireThat(initial.players.every(p => record(p) && typeof p.id === 'string'), 'The starting player list is invalid.');
  requireThat(Array.isArray(value.frames), 'The recording has no action sequence.');
  for (const collection of ['cards', 'zones']) {
    requireThat(Object.entries(initial[collection]).every(([key, item]) => !unsafeKey(key) && record(item)), 'The starting position contains invalid objects.');
  }
  for (const [index, frame] of value.frames.entries()) {
    requireThat(record(frame) && record(frame.delta) && record(frame.event), `Recorded action ${index + 1} is incomplete.`);
    requireThat(Number.isSafeInteger(frame.event.revision) && frame.event.revision >= 0, `Recorded action ${index + 1} has an invalid revision.`);
    const delta = frame.delta;
    if (Object.hasOwn(delta, 'revision')) requireThat(Number.isSafeInteger(delta.revision) && delta.revision >= 0, 'A recorded revision is invalid.');
    if (Object.hasOwn(delta, 'players')) requireThat(Array.isArray(delta.players) && delta.players.every(p => record(p) && typeof p.id === 'string'), 'A recorded player list is invalid.');
    if (Object.hasOwn(delta, 'turn')) requireThat(record(delta.turn), 'A recorded turn marker is invalid.');
    if (Object.hasOwn(delta, 'notes')) requireThat(Array.isArray(delta.notes), 'Recorded notes are invalid.');
    if (Object.hasOwn(delta, 'result')) requireThat(delta.result === null || (record(delta.result) && Array.isArray(delta.result.winners)), 'A recorded result is invalid.');
    for (const collection of ['cards', 'zones']) {
      if (!Object.hasOwn(delta, collection)) continue;
      const changes = delta[collection];
      requireThat(record(changes) && record(changes.set) && Array.isArray(changes.removed)
        && changes.removed.every(key => typeof key === 'string' && !unsafeKey(key))
        && Object.entries(changes.set).every(([key, item]) => !unsafeKey(key) && record(item)), `Recorded ${collection} changes are invalid.`);
    }
  }
  return value;
}

function applyDelta(state, delta) {
  for (const key of stateFields) if (Object.hasOwn(delta, key)) state[key] = clone(delta[key]);
  for (const collection of ['cards', 'zones']) {
    if (!delta[collection]) continue;
    for (const id of delta[collection].removed) delete state[collection][id];
    for (const [id, item] of Object.entries(delta[collection].set)) state[collection][id] = clone(item);
  }
  return state;
}

export function createReplay(recording) {
  validateRecording(recording);
  // Keep only replay data, not a second copy of the potentially large event log.
  const initial = clone(recording.initial);
  const deltas = recording.frames.map(frame => clone(frame.delta));
  const checkpoints = new Map([[0, initial]]);
  let cursor = { position: 0, state: initial };
  function remember(position, state) {
    checkpoints.set(position, clone(state));
    // Bound memory even for long background runs. Position zero stays available.
    while (checkpoints.size > 17) checkpoints.delete([...checkpoints.keys()].find(key => key !== 0));
  }
  return {
    length: deltas.length,
    stateAt(position) {
      requireThat(Number.isSafeInteger(position) && position >= 0 && position <= deltas.length, 'Replay position is outside the recorded game.');
      if (position === cursor.position) return clone(cursor.state);
      let start = 0, base = initial;
      for (const [at, state] of checkpoints) if (at <= position && at >= start) { start = at; base = state; }
      if (cursor.position <= position && cursor.position >= start) { start = cursor.position; base = cursor.state; }
      const state = clone(base);
      for (let i = start; i < position; i++) {
        applyDelta(state, deltas[i]);
        if ((i + 1) % 25 === 0) remember(i + 1, state);
      }
      cursor = { position, state };
      return clone(state);
    },
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (record(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

function groupDefinitions(entries) {
  const groups = new Map();
  for (const { count, definition } of entries) {
    const key = JSON.stringify(canonical(definition));
    if (groups.has(key)) groups.get(key).count += count;
    else groups.set(key, { count, definition: clone(definition) });
  }
  return [...groups.values()].sort((a, b) => String(a.definition.name).localeCompare(String(b.definition.name)));
}

export function startingDecks(recording) {
  validateRecording(recording);
  return recording.initial.players.map(player => {
    const players = Array.isArray(recording.setup?.players) ? recording.setup.players : [];
    const saved = players.find(p => p?.id === player.id)?.deck;
    const hasDeck = Array.isArray(saved) && saved.length > 0 && saved.every(entry => record(entry) && typeof entry.name === 'string'
      && Number.isSafeInteger(entry.count ?? 1) && (entry.count ?? 1) > 0);
    let entries;
    if (hasDeck) {
      entries = saved.map(({ count = 1, ...definition }) => ({ count, definition }));
    } else {
      // Legacy recordings can begin after opening hands or prearranged boards.
      // Use ownership across all recorded zones, not just the remaining library.
      const ids = new Set(Object.values(recording.initial.zones).flatMap(zone => Array.isArray(zone.cards) ? zone.cards : []));
      entries = [...ids].map(id => recording.initial.cards[id])
        .filter(card => card?.owner === player.id && card.kind !== 'ability' && record(card.definition))
        .map(card => ({ count: 1, definition: { ...card.definition, ...(card.token ? { token: true } : {}) } }));
    }
    const cards = groupDefinitions(entries);
    return {
      id: player.id, name: player.name || player.id, cards,
      total: cards.reduce((sum, card) => sum + card.count, 0), source: hasDeck ? 'setup' : 'initial-state',
      ...(hasDeck ? {} : { note: 'Reconstructed from first saved position; an earlier deck list was not saved.' }),
    };
  });
}

function chatChange(change) {
  const result = { type: typeof change?.type === 'string' ? change.type : 'event' };
  for (const key of ['summary', 'actor', 'player', 'next', 'from', 'to']) if (typeof change?.[key] === 'string') result[key] = change[key];
  if (Number.isFinite(change?.count)) result.count = change.count;
  if (Array.isArray(change?.cards)) result.cards = change.cards.filter(card => typeof card === 'string');
  const revealed = revealedCardSnapshots(change);
  if (revealed.length) result.revealedCards = revealed;
  if (['say', 'note'].includes(result.type) && typeof change?.text === 'string') result.text = change.text;
  if (['pass', 'pass_turn'].includes(result.type) && typeof change?.message === 'string') result.message = change.message;
  if (!result.summary) result.summary = result.type === 'say' ? result.text || 'Spoke to the table' : 'Table updated';
  return result;
}

function describeLegacy(op, state, actor) {
  const name = id => state.players.find(p => p.id === id)?.name || id || 'player';
  const card = state.cards[op.card]?.definition?.name || 'a card';
  const fields = keys => Object.entries(op.set || {}).filter(([key]) => keys.includes(key))
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(', ');
  switch (op.type) {
    case 'draw': return `${actor} drew ${op.count ?? 1} card(s) from ${op.from || actor + ':library'} to ${op.to || actor + ':hand'}`;
    case 'move': return `${actor} moved ${card} to ${op.to || 'a zone'}`;
    case 'shuffle': return `${actor} shuffled ${op.zone || actor + ':library'}`;
    case 'peek': return `${actor} looked at up to ${op.count ?? 1} card(s) in ${op.zone || 'a zone'}`;
    case 'reveal': return `${actor} revealed ${card}`;
    case 'card': return `${actor} updated ${card}: ${fields(['tapped', 'face_down', 'face', 'damage', 'counters', 'controller', 'attached_to', 'note'])}`;
    case 'player': return `${actor} updated ${name(op.player || actor)}: ${fields(['life', 'counters', 'mana', 'note', 'status'])}`;
    case 'turn': return `${actor} updated the turn marker: ${fields(['number', 'active', 'priority', 'phase'])}`;
    case 'pass': return `${actor} passed priority to ${name(op.next)}`;
    case 'pass_turn': return `${actor} passed the turn to ${name(op.next)}`;
    case 'say': return `${actor} spoke to the table`;
    case 'token': return `${actor} created ${op.count ?? 1} ${op.definition?.name || 'token'}(s)`;
    case 'stack_item': return `${actor} added ${op.definition?.name || 'an ability'} to the stack`;
    case 'remove_token': case 'remove_stack_item': return `${actor} removed ${card}`;
    case 'zone': return `${actor} created zone ${op.id || ''}`;
    case 'note': return `${actor} added a table note`;
    case 'result': return `Reported result: ${Array.isArray(op.winners) && op.winners.length ? op.winners.map(name).join(' & ') + ' won' : 'draw'}`;
    default: return 'Recorded table action';
  }
}

export function conversationEvents(recording) {
  validateRecording(recording);
  let state = clone(recording.initial);
  return recording.frames.map((frame, index) => {
    const saved = frame.event;
    let changes;
    if (Array.isArray(saved.public?.changes)) changes = saved.public.changes.map(chatChange);
    else if (Array.isArray(saved.actions)) {
      changes = saved.actions.map((action, i) => {
        const op = record(action) ? action : {};
        return chatChange({
        type: op.type, actor: saved.actor, player: op.player, next: op.next,
        summary: saved.outcomes?.[i]?.summary || describeLegacy(op, state, saved.actor),
        text: op.text, message: op.message,
        });
      });
    } else changes = [];
    if (!changes.length) changes.push(chatChange({ summary: saved.public?.summary || saved.summary || 'Table updated' }));
    const event = {
      actor: typeof saved.actor === 'string' ? saved.actor : '', revision: saved.revision,
      at: typeof saved.at === 'string' ? saved.at : '',
      summary: changes.map(change => change.summary).join('; '), changes,
    };
    applyDelta(state, frame.delta);
    // Deliberately omit private decision reasons, seat projections, and all
    // unknown event properties from this conversation-oriented view.
    return { position: index + 1, event };
  });
}
