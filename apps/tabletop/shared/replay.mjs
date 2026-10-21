import { revealedCardSnapshots } from './revealed-cards.mjs';

// Browser-compatible owner-review helpers. Replay applies recorded deltas;
// it never executes game actions, shuffles again, or interprets game rules.
const clone = value => structuredClone(value);
const stateFields = ['revision', 'players', 'turn', 'notes', 'result', 'preparation', 'series'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const unsafeKey = key => ['__proto__', 'constructor', 'prototype'].includes(key);
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };

export function validateRecordedSeries(series) {
  requireThat(record(series) && ['single', 'best_of', 'first_to'].includes(series.mode)
    && ['playing', 'between_games', 'complete'].includes(series.status)
    && Number.isSafeInteger(series.gameNumber) && series.gameNumber >= 1
    && record(series.scores) && Object.entries(series.scores).every(([id, score]) => !unsafeKey(id) && Number.isSafeInteger(score) && score >= 0)
    && Array.isArray(series.games) && series.games.every(game => record(game) && Number.isSafeInteger(game.number) && game.number >= 1
      && record(game.result) && Array.isArray(game.result.winners) && game.result.winners.every(id => typeof id === 'string')
      && Number.isSafeInteger(game.endedRevision) && game.endedRevision >= 0), 'A recorded match series is invalid.');
  return series;
}

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
  if (initial.preparation !== undefined) requireThat(record(initial.preparation) && Array.isArray(initial.preparation.players)
    && Array.isArray(initial.preparation.packets), 'The starting preparation state is invalid.');
  if (initial.series !== undefined) validateRecordedSeries(initial.series);
  for (const [index, frame] of value.frames.entries()) {
    requireThat(record(frame) && record(frame.delta) && record(frame.event), `Recorded action ${index + 1} is incomplete.`);
    requireThat(Number.isSafeInteger(frame.event.revision) && frame.event.revision >= 0, `Recorded action ${index + 1} has an invalid revision.`);
    const delta = frame.delta;
    if (Object.hasOwn(delta, 'series')) validateRecordedSeries(delta.series);
    if (Object.hasOwn(delta, 'revision')) requireThat(Number.isSafeInteger(delta.revision) && delta.revision >= 0, 'A recorded revision is invalid.');
    if (Object.hasOwn(delta, 'players')) requireThat(Array.isArray(delta.players) && delta.players.every(p => record(p) && typeof p.id === 'string'), 'A recorded player list is invalid.');
    if (Object.hasOwn(delta, 'turn')) requireThat(record(delta.turn), 'A recorded turn marker is invalid.');
    if (Object.hasOwn(delta, 'notes')) requireThat(Array.isArray(delta.notes), 'Recorded notes are invalid.');
    if (Object.hasOwn(delta, 'result')) requireThat(delta.result === null || (record(delta.result) && Array.isArray(delta.result.winners)), 'A recorded result is invalid.');
    if (Object.hasOwn(delta, 'preparation')) requireThat(record(delta.preparation) && Array.isArray(delta.preparation.players)
      && Array.isArray(delta.preparation.packets), 'A recorded preparation state is invalid.');
    for (const collection of ['cards', 'zones']) {
      if (!Object.hasOwn(delta, collection)) continue;
      const changes = delta[collection];
      requireThat(record(changes) && record(changes.set) && Array.isArray(changes.removed)
        && changes.removed.every(key => typeof key === 'string' && !unsafeKey(key))
        && Object.entries(changes.set).every(([key, item]) => !unsafeKey(key) && record(item)), `Recorded ${collection} changes are invalid.`);
    }
  }
  if (value.gameDecks !== undefined) requireThat(Array.isArray(value.gameDecks) && value.gameDecks.every(game => record(game)
    && Number.isSafeInteger(game.gameNumber) && game.gameNumber >= 1 && Number.isSafeInteger(game.revision) && game.revision >= 0
    && Array.isArray(game.players) && game.players.every(player => record(player) && typeof player.id === 'string'
      && [player.cards, player.sideboard].every(list => Array.isArray(list) && list.every(row => record(row)
        && Number.isSafeInteger(row.count) && row.count >= 1 && record(row.definition) && typeof row.definition.name === 'string')))), 'Recorded game decks are invalid.');
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
  // Packet-selection sessions start with empty libraries. Preserve the complete
  // constructed list, independent of later draws, tokens or ownership changes.
  const preparation = recording.frames.findLast(frame => frame.delta.preparation)?.delta.preparation || recording.initial.preparation;
  const constructed = recording.constructedDecks || preparation?.decks;
  return recording.initial.players.map(player => {
    const players = Array.isArray(recording.setup?.players) ? recording.setup.players : [];
    const prepared = record(constructed) && Object.hasOwn(constructed, player.id) ? constructed[player.id] : undefined;
    const saved = prepared || players.find(p => p?.id === player.id)?.deck;
    const hasDeck = Array.isArray(saved) && saved.length > 0 && saved.every(entry => record(entry) && typeof entry.name === 'string'
      && Number.isSafeInteger(entry.count ?? 1) && (entry.count ?? 1) > 0);
    let entries;
    if (hasDeck) {
      entries = saved.map(({ count = 1, ...definition }) => ({ count, definition }));
    } else if (preparation?.status === 'selecting') {
      entries = [];
    } else {
      // Legacy recordings can begin after opening hands or prearranged boards.
      // Use ownership across all recorded zones, not just the remaining library.
      const ids = new Set(Object.values(recording.initial.zones).filter(zone => !zone.id?.endsWith(':sideboard')).flatMap(zone => Array.isArray(zone.cards) ? zone.cards : []));
      entries = [...ids].map(id => recording.initial.cards[id])
        .filter(card => card?.owner === player.id && card.kind !== 'ability' && record(card.definition))
        .map(card => ({ count: 1, definition: { ...card.definition, ...(card.token ? { token: true } : {}) } }));
    }
    const cards = groupDefinitions(entries);
    return {
      id: player.id, name: player.name || player.id, cards,
      total: cards.reduce((sum, card) => sum + card.count, 0),
      source: hasDeck ? prepared ? 'preparation' : 'setup' : preparation?.status === 'selecting' ? 'preparation-pending' : 'initial-state',
      ...(hasDeck ? prepared ? { note: 'Complete deck assembled from the selected Jumpstart packets.' } : {}
        : { note: preparation?.status === 'selecting' ? 'Packet selection is not complete; no deck has been constructed yet.'
          : 'Reconstructed from first saved position; an earlier deck list was not saved.' }),
    };
  });
}

function chatChange(change) {
  const result = { type: typeof change?.type === 'string' ? change.type : 'event' };
  for (const key of ['summary', 'actor', 'player', 'next', 'from', 'to']) if (typeof change?.[key] === 'string') result[key] = change[key];
  if (Number.isFinite(change?.count)) result.count = change.count;
  if (Array.isArray(change?.cards)) result.cards = change.cards.filter(card => typeof card === 'string');
  // Keep the display facts already present in the public projection, without
  // pulling card identities or private annotations back out of host state.
  if (typeof change?.zone === 'string') result.zone = change.zone;
  else if (record(change?.zone)) {
    result.zone = Object.fromEntries(['id', 'owner', 'visibility', 'name', 'label']
      .filter(key => typeof change.zone[key] === 'string').map(key => [key, change.zone[key]]));
    if (change.zone.owner === null) result.zone.owner = null;
  }
  const fields = result.type === 'card' ? ['tapped', 'face_down', 'controller', 'damage', 'counters', 'note', 'face', 'attached_to']
    : result.type === 'player' ? ['life', 'counters', 'mana', 'note', 'status']
    : ['turn', 'pass_turn', 'ready_next_game'].includes(result.type) ? ['number', 'phase', 'active', 'priority', 'counts', 'totalTurns', 'countsComplete'] : [];
  if (record(change?.set)) {
    const set = {};
    for (const key of fields) {
      const value = change.set[key];
      if (key === 'counts' && record(value)) {
        set[key] = Object.fromEntries(Object.entries(value).filter(([id, count]) => !unsafeKey(id) && Number.isSafeInteger(count) && count >= 0));
      } else if (['counters', 'mana'].includes(key) && record(value)) {
        set[key] = Object.fromEntries(Object.entries(value).filter(([name, count]) => !unsafeKey(name) && Number.isFinite(count)));
      } else if (typeof value === 'string' || typeof value === 'boolean' || Number.isFinite(value)
        || (value === null && ['attached_to', 'priority'].includes(key))) set[key] = value;
    }
    if (Object.keys(set).length) result.set = set;
  }
  if (record(change?.result) && Array.isArray(change.result.winners)) {
    result.result = { winners: change.result.winners.filter(id => typeof id === 'string') };
    for (const key of ['explanation', 'reported_by']) if (typeof change.result[key] === 'string') result.result[key] = change.result[key];
  }
  if (Number.isSafeInteger(change?.game_number)) result.game_number = change.game_number;
  if (typeof change?.game_started === 'boolean') result.game_started = change.game_started;
  const revealed = revealedCardSnapshots(change);
  if (revealed.length) result.revealedCards = revealed;
  if (['say', 'note'].includes(result.type) && typeof change?.text === 'string') result.text = change.text;
  if (['pass', 'pass_turn', 'select_packets', 'ready_next_game'].includes(result.type) && typeof change?.message === 'string') result.message = change.message;
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
    case 'select_packets': return `${actor} selected ${(op.packetIds || []).map(id => state.preparation?.packets.find(packet => packet.id === id)?.name || id).join(' + ')}`;
    case 'sideboard': return `${actor} adjusted their deck between games`;
    case 'ready_next_game': return `${actor} is ready for the next game`;
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
        // Legacy requests can supply public markers, but not card identities
        // or card edits whose visibility was never recorded for this viewer.
        ...(['turn', 'player'].includes(op.type) ? { set: op.set } : {}),
        ...(op.type === 'draw' ? { from: op.from || saved.actor + ':library', to: op.to || saved.actor + ':hand', count: saved.outcomes?.[i]?.count } : {}),
        ...(op.type === 'move' ? { to: op.to } : {}),
        ...(op.type === 'shuffle' ? { zone: op.zone || saved.actor + ':library' } : {}),
        ...(op.type === 'peek' ? { zone: op.zone, count: saved.outcomes?.[i]?.count } : {}),
        ...(op.type === 'result' ? { result: { winners: op.winners, explanation: op.explanation, reported_by: saved.actor } } : {}),
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


/** Each segment starts at the recorded reset/setup position, never by replaying actions. */
export function gameSegments(recording) {
  validateRecording(recording);
  let number = recording.initial.series?.gameNumber || 1;
  let selecting = recording.initial.preparation?.status === 'selecting';
  let turn = recording.initial.turn;
  let players = recording.initial.players;
  const segments = [{ gameNumber: number, position: 0, revision: recording.initial.revision, result: clone(recording.initial.result), turn: clone(turn), players: clone(players) }];
  for (const [index, frame] of recording.frames.entries()) {
    const nextNumber = frame.delta.series?.gameNumber || number;
    if (nextNumber !== number) {
      number = nextNumber;
      segments.push({ gameNumber: number, position: index + 1, revision: frame.event.revision, result: null });
    }
    const segment = segments.at(-1);
    if (frame.delta.preparation?.status === 'selecting') selecting = true;
    if (selecting && frame.delta.preparation?.status === 'complete') {
      segment.position = index + 1; segment.revision = frame.event.revision; selecting = false;
    }
    if (frame.delta.result) segment.result = clone(frame.delta.result);
    if (frame.delta.turn) turn = frame.delta.turn;
    if (frame.delta.players) players = frame.delta.players;
    segment.turn = clone(turn);
    segment.players = clone(players);
  }
  return segments;
}

/** Host-only review inventory, captured before draws or other gameplay changes. */
export function gameDeckSnapshot(state) {
  return {
    gameNumber: state.series?.gameNumber || 1, revision: state.revision,
    players: state.players.map(player => {
      const roster = state.series?.rosters?.[player.id];
      if (roster?.cards?.length) {
        const allocated = sideboard => groupDefinitions(roster.cards
          .map(card => ({ count: sideboard ? card.total - card.main : card.main,
            definition: { ...card.definition, ...(card.token ? { token: true } : {}) } }))
          .filter(card => card.count > 0));
        return { id: player.id, name: player.name || player.id, cards: allocated(false), sideboard: allocated(true) };
      }
      const contents = suffix => groupDefinitions((state.zones[`${player.id}:${suffix}`]?.cards || [])
        .map(id => state.cards[id]).filter(card => card?.kind !== 'ability' && record(card?.definition))
        .map(card => ({ count: 1, definition: { ...card.definition, ...(card.token ? { token: true } : {}) } })));
      return { id: player.id, name: player.name || player.id, cards: contents('library'), sideboard: contents('sideboard') };
    }),
  };
}

export function decksForGame(recording, gameNumber = 1) {
  validateRecording(recording);
  const segments = gameSegments(recording);
  const segment = segments.find(game => game.gameNumber === gameNumber);
  requireThat(segment, 'That game is not present in this recording.');
  let saved = recording.gameDecks?.find(game => game.gameNumber === gameNumber);
  if (!saved && (gameNumber > 1 || segment.position > 0)) saved = gameDeckSnapshot(createReplay(recording).stateAt(segment.position));
  if (saved) return saved.players.map(player => ({ ...clone(player),
    total: player.cards.reduce((sum, row) => sum + row.count, 0),
    sideboardTotal: player.sideboard.reduce((sum, row) => sum + row.count, 0), source: 'game-start',
    ...(recording.initial.preparation && gameNumber === 1 ? { note: 'Complete deck assembled from the selected Jumpstart packets.' } : {}),
  }));
  return startingDecks(recording).map(player => {
    const configured = recording.setup?.players?.find?.(entry => entry.id === player.id)?.sideboard;
    const sideboard = Array.isArray(configured) ? groupDefinitions(configured.map(({ count = 1, ...definition }) => ({ count, definition })))
      : gameDeckSnapshot(recording.initial).players.find(entry => entry.id === player.id)?.sideboard || [];
    return { ...player, sideboard, sideboardTotal: sideboard.reduce((sum, row) => sum + row.count, 0) };
  });
}
