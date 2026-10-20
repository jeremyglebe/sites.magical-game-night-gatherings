import { randomInt, randomUUID } from 'node:crypto';

const copy = value => structuredClone(value);
function requireThat(value, message) {
  if (!value) throw new Error(message);
}
function integer(value, min = -100000, max = 100000) {
  requireThat(Number.isSafeInteger(value) && value >= min && value <= max, 'Invalid integer');
  return value;
}
function text(value, max = 2000) {
  requireThat(typeof value === 'string' && value.length <= max, 'Invalid text');
  return value;
}
function player(state, id) {
  const found = state.players.find(p => p.id === id);
  requireThat(found, 'Unknown player');
  return found;
}
function zone(state, id) {
  const found = Object.hasOwn(state.zones, id) && state.zones[id];
  requireThat(found, 'Unknown zone');
  return found;
}
function counters(value) {
  requireThat(value && typeof value === 'object' && !Array.isArray(value), 'Expected counter map');
  return Object.fromEntries(Object.entries(value).map(([key, count]) => [text(key, 100), integer(count, 0)]));
}
function definition(value) {
  requireThat(value && typeof value === 'object', 'Expected card definition');
  const result = { name: text(value.name, 200) };
  requireThat(result.name.trim(), 'Card name is required');
  for (const key of ['type_line', 'oracle_text', 'mana_cost', 'power', 'toughness', 'scryfall_id']) {
    if (value[key] !== undefined) result[key] = text(value[key], 12000);
  }
  if (value.image_url) {
    const url = new URL(value.image_url);
    requireThat(url.protocol === 'https:' && url.hostname === 'cards.scryfall.io', 'Use a Scryfall image URL');
    result.image_url = url.href;
  }
  return result;
}
function addCard(state, owner, destination, data, token = false) {
  player(state, owner);
  const id = randomUUID();
  state.cards[id] = {
    id, owner, controller: owner, definition: definition(data), token, kind: 'card',
    tapped: false, face_down: false, face: 'front', counters: {}, damage: 0,
    attached_to: null, note: '', known_to: [],
  };
  zone(state, destination).cards.push(id);
  return id;
}
function location(state, id) {
  return Object.values(state.zones).find(z => z.cards.includes(id));
}
function visible(state, actor, id) {
  const card = state.cards[id];
  const place = location(state, id);
  if (!card || !place) return false;
  return place.visibility === 'public'
    || (place.visibility === 'owner' && place.owner === actor)
    || card.known_to.includes(actor);
}
function identityVisible(state, actor, id) {
  const card = state.cards[id];
  return visible(state, actor, id) && (!card.face_down
    || card.controller === actor || card.known_to.includes(actor));
}
function visibleCard(state, actor, id) {
  requireThat(visible(state, actor, id), 'Card is not available in your view');
  return state.cards[id];
}
// A concealed card gets a new handle so previously exposed IDs cannot track it.
function conceal(state, id) {
  const card = state.cards[id];
  const newId = randomUUID();
  delete state.cards[id];
  card.id = newId;
  card.known_to = [];
  card.attached_to = null;
  state.cards[newId] = card;
  for (const z of Object.values(state.zones)) z.cards = z.cards.map(c => c === id ? newId : c);
  for (const c of Object.values(state.cards)) if (c.attached_to === id) c.attached_to = null;
  return newId;
}
function shuffle(state, id) {
  const z = zone(state, id);
  for (const card of [...z.cards]) conceal(state, card);
  for (let i = z.cards.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [z.cards[i], z.cards[j]] = [z.cards[j], z.cards[i]];
  }
}
function move(state, id, destination, position = 'bottom') {
  const from = location(state, id);
  requireThat(from, 'Card not found');
  requireThat(['top', 'bottom'].includes(position), 'Position must be top or bottom');
  const to = zone(state, destination);
  from.cards.splice(from.cards.indexOf(id), 1);
  if (position === 'top') to.cards.unshift(id);
  else to.cards.push(id);
  state.cards[id].known_to = [];
  if (to.visibility !== 'public') conceal(state, id);
}

export function createTable(config) {
  requireThat(Array.isArray(config.players) && config.players.length >= 1, 'Supply at least one player');
  requireThat(config.references === undefined || (Array.isArray(config.references)
    && config.references.every(p => typeof p === 'string')), 'References must be a list of paths');
  const state = {
    version: 1, title: text(config.title || 'Playtest table', 200), revision: 0,
    created_at: new Date().toISOString(), players: [], zones: {}, cards: {},
    turn: { number: 1, active: config.players[0].id, priority: null, phase: 'Setup' },
    notes: [], result: null, events: [], references: config.references || [],
  };
  function makeZone(id, owner, visibility) {
    state.zones[id] = { id, owner, visibility, cards: [] };
  }
  for (const p of config.players) {
    requireThat(typeof p.id === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(p.id), 'Invalid player ID');
    requireThat(!state.players.some(other => other.id === p.id), 'Duplicate player ID');
    state.players.push({ id: p.id, name: text(p.name || p.id, 100), life: integer(p.life ?? 20), counters: {}, mana: {}, note: '' });
    makeZone(p.id + ':library', p.id, 'hidden');
    makeZone(p.id + ':hand', p.id, 'owner');
    makeZone(p.id + ':sideboard', p.id, 'owner');
    for (const name of ['graveyard', 'exile', 'command']) makeZone(p.id + ':' + name, p.id, 'public');
  }
  makeZone('battlefield', null, 'public');
  makeZone('stack', null, 'public');
  for (const p of config.players) {
    requireThat(Array.isArray(p.deck) && p.deck.length > 0, 'Supply a deck for each player');
    for (const entry of p.deck) {
      const count = integer(entry.count ?? 1, 1, 500);
      for (let i = 0; i < count; i++) addCard(state, p.id, p.id + ':library', entry, entry.token === true);
    }
    if (config.shuffle !== false) shuffle(state, p.id + ':library');
  }
  return state;
}

export function cardDetails(state, actor, id) {
  const card = visibleCard(state, actor, id);
  requireThat(identityVisible(state, actor, id), 'Card identity is concealed');
  return { ...copy(card.definition), id };
}

export function observe(state, actor = null) {
  if (actor !== null) player(state, actor);
  const zones = {};
  for (const z of Object.values(state.zones)) {
    const cards = [];
    for (const id of z.cards) {
      if (!visible(state, actor, id)) continue;
      const c = state.cards[id];
      const publicState = {
        id, owner: c.owner, controller: c.controller, tapped: c.tapped,
        face_down: c.face_down, counters: copy(c.counters), damage: c.damage,
        attached_to: c.attached_to && visible(state, actor, c.attached_to) ? c.attached_to : null,
      };
      if (identityVisible(state, actor, id)) {
        const { oracle_text, image_url, ...briefDefinition } = c.definition;
        Object.assign(publicState, briefDefinition, { token: c.token, kind: c.kind, face: c.face, note: c.note });
        if (actor === null && image_url) publicState.image_url = image_url;
      } else publicState.name = 'Face-down card';
      cards.push(publicState);
    }
    zones[z.id] = { id: z.id, owner: z.owner, visibility: z.visibility, count: z.cards.length, cards };
  }
  return {
    title: state.title, revision: state.revision, players: copy(state.players),
    turn: copy(state.turn), zones, notes: copy(state.notes), result: copy(state.result),
    events: state.events.slice(-12).map(e => projectEvent(e, actor)),
  };
}

function projectEvent(event, actor) {
  const projection = actor === null ? event.public : event.seats?.[actor];
  return {
    revision: event.revision, actor: event.actor, at: event.at,
    summary: projection?.summary ?? event.summary,
    ...(projection?.changes ? { changes: copy(projection.changes) } : {}),
    ...(event.actor === actor ? { reason: event.reason } : {}),
  };
}

// History is projected when the event happens, so a later reveal cannot expose
// an earlier private draw and a later hidden move cannot erase a public play.
export function eventsSince(state, actor = null, since = 0) {
  if (actor !== null) player(state, actor);
  requireThat(Number.isSafeInteger(since) && since >= 0 && since <= state.revision, 'Invalid event revision');
  return {
    revision: state.revision,
    events: state.events.filter(event => event.revision > since).map(event => projectEvent(event, actor)),
  };
}

function perform(state, actor, op) {
  requireThat(op && typeof op === 'object', 'Invalid action');
  switch (op.type) {
    case 'draw': {
      const count = integer(op.count ?? 1, 0, 100);
      const from = zone(state, op.from || actor + ':library');
      const to = zone(state, op.to || actor + ':hand');
      // Explicit tools manipulate the table; card effects and permission to use
      // them remain the players' responsibility. No hidden identities in logs.
      const drawn = [...from.cards.slice(0, count)];
      for (const id of drawn) move(state, id, to.id);
      return actor + ' drew ' + drawn.length + ' card(s) from ' + from.id + ' to ' + to.id;
    }
    case 'move': {
      visibleCard(state, actor, op.card);
      const from = location(state, op.card).id;
      move(state, op.card, op.to, op.position);
      return actor + ' moved a card from ' + from + ' to ' + op.to;
    }
    case 'shuffle':
      shuffle(state, op.zone || actor + ':library');
      return actor + ' shuffled ' + (op.zone || actor + ':library');
    case 'peek': {
      const z = zone(state, op.zone);
      const count = integer(op.count ?? 1, 1, 100);
      for (const id of z.cards.slice(0, count)) {
        if (!state.cards[id].known_to.includes(actor)) state.cards[id].known_to.push(actor);
      }
      return actor + ' looked at up to ' + count + ' card(s) in ' + z.id;
    }
    case 'reveal': {
      const c = visibleCard(state, actor, op.card);
      requireThat(identityVisible(state, actor, op.card), 'Cannot reveal an identity you cannot see');
      const seats = op.to || state.players.map(p => p.id);
      requireThat(Array.isArray(seats), 'Expected player list');
      for (const seat of seats) { player(state, seat); if (!c.known_to.includes(seat)) c.known_to.push(seat); }
      if (op.to === undefined && !c.known_to.includes(null)) c.known_to.push(null);
      return actor + ' revealed a card to ' + seats.join(', ');
    }
    case 'card': {
      const c = visibleCard(state, actor, op.card);
      const changes = op.set;
      requireThat(changes && typeof changes === 'object', 'Expected card changes');
      for (const [key, value] of Object.entries(changes)) {
        switch (key) {
          case 'tapped': case 'face_down':
            requireThat(typeof value === 'boolean', 'Expected boolean'); c[key] = value; break;
          case 'controller': player(state, value); c.controller = value; break;
          case 'damage': c.damage = integer(value, 0); break;
          case 'counters': c.counters = counters(value); break;
          case 'note': case 'face': c[key] = text(value); break;
          case 'attached_to':
            if (value !== null) {
              visibleCard(state, actor, value);
              requireThat(value !== c.id, 'Cannot attach a card to itself');
            }
            c.attached_to = value; break;
          default: throw new Error('Unsupported card field: ' + key);
        }
      }
      return actor + ' updated a card: ' + Object.keys(changes).join(', ');
    }
    case 'player': {
      const p = player(state, op.player || actor);
      requireThat(op.set && typeof op.set === 'object', 'Expected player changes');
      for (const [key, value] of Object.entries(op.set)) {
        if (key === 'life') p.life = integer(value);
        else if (key === 'counters' || key === 'mana') p[key] = counters(value);
        else if (key === 'note') p.note = text(value);
        else throw new Error('Unsupported player field: ' + key);
      }
      return actor + ' updated ' + p.id + ': ' + Object.keys(op.set).join(', ');
    }
    case 'turn':
      requireThat(op.set && typeof op.set === 'object', 'Expected turn changes');
      for (const [key, value] of Object.entries(op.set)) {
        if (key === 'number') state.turn.number = integer(value, 1);
        else if (key === 'phase') state.turn.phase = text(value, 100);
        else if (key === 'active' || key === 'priority') {
          if (value !== null || key === 'active') player(state, value);
          state.turn[key] = value;
        } else throw new Error('Unsupported turn field: ' + key);
      }
      return actor + ' updated the turn marker';
    case 'pass':
      player(state, op.next);
      state.turn.priority = op.next;
      return actor + ' passed priority to ' + op.next;
    case 'token': {
      const count = integer(op.count ?? 1, 1, 100);
      for (let i = 0; i < count; i++) addCard(state, op.owner || actor, op.to || 'battlefield', op.definition, true);
      return actor + ' created ' + count + ' token(s)';
    }
    case 'stack_item': {
      const id = addCard(state, actor, 'stack', op.definition);
      state.cards[id].kind = 'ability';
      move(state, id, 'stack', 'top');
      return actor + ' added an ability to the stack';
    }
    case 'remove_stack_item':
    case 'remove_token': {
      const c = visibleCard(state, actor, op.card);
      requireThat(op.type === 'remove_token' ? c.token : c.kind === 'ability', 'Only tokens or ability objects can be removed; move ordinary cards to a zone');
      const z = location(state, c.id);
      z.cards = z.cards.filter(id => id !== c.id);
      delete state.cards[c.id];
      for (const other of Object.values(state.cards)) if (other.attached_to === c.id) other.attached_to = null;
      return actor + ' removed a ' + (c.token ? 'token' : 'stack ability');
    }
    case 'zone': {
      requireThat(typeof op.id === 'string' && /^[a-zA-Z0-9_:-]{1,80}$/.test(op.id), 'Invalid zone ID');
      requireThat(!['__proto__', 'constructor', 'prototype'].includes(op.id), 'Reserved zone ID');
      requireThat(!Object.hasOwn(state.zones, op.id), 'Zone already exists');
      requireThat(['public', 'owner', 'hidden'].includes(op.visibility), 'Invalid visibility');
      if (op.owner !== undefined && op.owner !== null) player(state, op.owner);
      requireThat(op.visibility !== 'owner' || op.owner, 'Private zone needs an owner');
      state.zones[op.id] = { id: op.id, owner: op.owner || null, visibility: op.visibility, cards: [] };
      return actor + ' created zone ' + op.id;
    }
    case 'note':
      state.notes.push({ actor, text: text(op.text) });
      return actor + ': ' + text(op.text);
    case 'result':
      requireThat(Array.isArray(op.winners), 'Supply winner IDs, or [] for a draw');
      for (const id of op.winners) player(state, id);
      state.result = { winners: [...new Set(op.winners)], explanation: text(op.explanation || ''), reported_by: actor };
      return actor + ' reported a game result';
    default: throw new Error('Unknown action type');
  }
}

function captureAction(state, actor, op) {
  requireThat(op && typeof op === 'object', 'Invalid action');
  const change = { type: op.type, actor, cards: [] };
  if (op.card && state.cards[op.card]) {
    change.cards.push(state.cards[op.card]);
    change.from = location(state, op.card)?.id;
  }
  if (op.type === 'draw' || op.type === 'peek') {
    const from = zone(state, op.type === 'draw' ? (op.from || actor + ':library') : op.zone);
    const count = integer(op.count ?? 1, op.type === 'draw' ? 0 : 1, 100);
    change.cards = from.cards.slice(0, count).map(id => state.cards[id]);
    change.from = from.id;
    change.count = change.cards.length;
    if (op.type === 'draw') change.to = op.to || actor + ':hand';
    // A peek grants knowledge at this point even if a later operation conceals
    // those cards again within the same atomic batch.
    if (op.type === 'peek') change.disclosedTo = [actor];
  }
  if (op.type === 'reveal') change.disclosedTo = op.to || [null, ...state.players.map(p => p.id)];
  if (op.type === 'move') change.to = op.to;
  if (op.type === 'shuffle') change.zone = op.zone || actor + ':library';
  if (op.type === 'token' || op.type === 'stack_item') change.previousCards = new Set(Object.values(state.cards));
  return change;
}

function finishAction(state, actor, op, change, summary) {
  change.summary = summary;
  if (change.previousCards) {
    change.cards = Object.values(state.cards).filter(card => !change.previousCards.has(card));
    change.count = change.cards.length;
    change.to = op.type === 'stack_item' ? 'stack' : (op.to || 'battlefield');
    delete change.previousCards;
  }
  if (op.type === 'card') {
    change.set = copy(op.set);
    if (op.set.attached_to) change.attachedTo = state.cards[op.set.attached_to];
  }
  if (op.type === 'player') {
    change.player = op.player || actor;
    change.set = copy(op.set);
  }
  if (op.type === 'turn') change.set = copy(op.set);
  if (op.type === 'pass') change.next = op.next;
  if (op.type === 'note') change.text = op.text;
  if (op.type === 'result') change.result = copy(state.result);
  if (op.type === 'zone') change.zone = copy(state.zones[op.id]);
  return change;
}

function describeChanges(original, state, changes, viewer, initialIds, host = false) {
  function identityKnown(card, change) {
    if (host) return true;
    const initialId = initialIds.get(card);
    return (initialId && identityVisible(original, viewer, initialId))
      || (state.cards[card.id] === card && identityVisible(state, viewer, card.id))
      || change.disclosedTo?.includes(viewer);
  }
  const descriptions = changes.map(change => {
    const cards = change.cards.filter(card => identityKnown(card, change)).map(card => card.definition.name);
    const detail = { type: change.type, summary: change.summary };
    if (cards.length) detail.cards = cards;
    for (const key of ['from', 'to', 'count', 'next', 'player', 'text', 'result', 'zone']) {
      if (change[key] !== undefined) detail[key] = copy(change[key]);
    }
    const label = cards.length ? cards.join(', ') : 'a concealed card';
    if (change.type === 'move') detail.summary = `${change.actor} moved ${label} from ${change.from} to ${change.to}`;
    if (change.type === 'draw' && cards.length) detail.summary += ': ' + cards.join(', ');
    if (change.type === 'peek' && cards.length) detail.summary += ': ' + cards.join(', ');
    if (change.type === 'reveal' && cards.length) detail.summary = `${change.summary}: ${cards.join(', ')}`;
    if (change.type === 'token' || change.type === 'stack_item') {
      if (cards.length) detail.summary += ': ' + cards.join(', ');
    }
    if (change.type === 'remove_token' || change.type === 'remove_stack_item') {
      if (cards.length) detail.summary += ': ' + cards.join(', ');
    }
    if (change.type === 'card') {
      const card = change.cards[0];
      // Do not leak transient intermediate states (e.g. move face down then
      // conceal) or private annotations through the public history.
      const isVisible = host || (state.cards[card.id] === card && visible(state, viewer, card.id));
      const seesIdentity = host || (isVisible && identityVisible(state, viewer, card.id));
      const set = {};
      if (isVisible) for (const [key, value] of Object.entries(change.set)) {
        if (['note', 'face'].includes(key) && !seesIdentity) continue;
        if (key === 'attached_to' && value !== null) {
          const target = host ? change.attachedTo : state.cards[value];
          if (!target || (!host && !identityVisible(state, viewer, value))) continue;
          set[key] = target.definition.name;
        } else set[key] = copy(value);
      }
      detail.summary = `${change.actor} updated ${label}`;
      if (Object.keys(set).length) {
        detail.set = set;
        detail.summary += ': ' + Object.entries(set).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(', ');
      }
    } else if (change.set) {
      detail.set = copy(change.set);
      detail.summary += ': ' + Object.entries(change.set).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(', ');
    }
    if (change.result) detail.summary += ': ' + (change.result.winners.length ? change.result.winners.join(', ') + ' won' : 'draw')
      + (change.result.explanation ? '; ' + change.result.explanation : '');
    return detail;
  });
  return { summary: descriptions.map(change => change.summary).join('; '), changes: descriptions };
}

export function applyActions(original, actor, expectedRevision, actions, reason) {
  player(original, actor);
  requireThat(expectedRevision === original.revision, 'Table changed. Read the table and retry with its current revision.');
  requireThat(Array.isArray(actions) && actions.length > 0 && actions.length <= 30, 'Supply 1–30 actions');
  text(reason);
  requireThat(reason.trim().length > 0, 'Give a short reason for the action');
  const state = copy(original);
  const initialIds = new Map(Object.entries(state.cards).map(([id, card]) => [card, id]));
  const changes = actions.map(op => {
    const before = captureAction(state, actor, op);
    const summary = perform(state, actor, op);
    return finishAction(state, actor, op, before, summary);
  });
  const publicEvent = describeChanges(original, state, changes, null, initialIds);
  const outcomes = describeChanges(original, state, changes, null, initialIds, true).changes;
  const seats = Object.fromEntries(state.players.map(p => [p.id, describeChanges(original, state, changes, p.id, initialIds)]));
  state.revision++;
  state.events.push({
    revision: state.revision, at: new Date().toISOString(), actor,
    summary: publicEvent.summary, reason, actions: copy(actions),
    public: publicEvent, seats,
    // Administrator-only per-operation outcomes preserve what happened inside a
    // batch (especially shuffle/draw/draw). projectEvent never exposes this field.
    outcomes,
  });
  return state;
}
