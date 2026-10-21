// A projection of a draft, never an authoritative game state. In particular,
// hidden-zone cards do not carry enough information to predict a draw or shuffle.
const copy = value => structuredClone(value);
const requireThat = (value, message) => { if (!value) throw new Error(message); };
function integer(value, min = -100000, max = 100000) {
  requireThat(Number.isSafeInteger(value) && value >= min && value <= max, 'Invalid integer');
  return value;
}
function text(value, max = 2000) {
  requireThat(typeof value === 'string' && value.length <= max, 'Invalid text');
  return value;
}
function counters(value) {
  requireThat(value && typeof value === 'object' && !Array.isArray(value), 'Expected counter map');
  return Object.fromEntries(Object.entries(value).map(([key, count]) => [text(key, 100), integer(count, 0)]));
}
function player(table, id) {
  const found = table.players.find(p => p.id === id);
  requireThat(found, 'Unknown player');
  return found;
}
function zone(table, id) {
  const found = Object.hasOwn(table.zones, id) && table.zones[id];
  requireThat(found, 'Unknown zone');
  return found;
}
function findCard(table, id) {
  for (const z of Object.values(table.zones)) {
    const card = z.cards.find(c => c.id === id);
    if (card) {
      requireThat(!card.draft && card.editable !== false, 'This card will be available to edit after sending the queued actions');
      return { card, zone: z };
    }
  }
  throw new Error('Card is no longer available in the draft. Undo or remove this dependent action');
}
function syncCount(z) { z.hidden_count = Math.max(0, z.count - z.cards.length); }
function detach(table, ids) {
  for (const z of Object.values(table.zones)) for (const card of z.cards) {
    if (ids.has(card.attached_to)) card.attached_to = null;
  }
}
const zoneVisible = (z, actor) => z.visibility === 'public' || (z.visibility === 'owner' && z.owner === actor);
function obscureIdentity(card) {
  for (const key of ['name', 'type_line', 'mana_cost', 'power', 'toughness', 'scryfall_id', 'image_url', 'oracle_text', 'rulings', 'rulings_cache', 'token', 'kind', 'face', 'note']) delete card[key];
  card.name = 'Face-down card';
}

function perform(table, actor, op, index, warn) {
  requireThat(op && typeof op === 'object', 'Invalid action');
  let serial = 0;
  const temporary = card => ({ ...card, id: `draft:${index}:${serial++}`, draft: true, editable: false });
  const unknown = (owner = actor) => temporary({
    name: 'Unknown card', owner, controller: owner, tapped: false, face_down: false,
    counters: {}, damage: 0, attached_to: null, preview_unknown: true,
  });
  function relocate(card, from, to, position = 'bottom') {
    requireThat(['top', 'bottom'].includes(position), 'Position must be top or bottom');
    from.cards = from.cards.filter(c => c.id !== card.id);
    from.count--;
    to.count++;
    if (to.visibility !== 'public') {
      detach(table, new Set([card.id]));
      card = temporary({ ...card, attached_to: null });
    }
    if (zoneVisible(to, actor)) {
      // Moving clears explicit knowledge on the server, even on a public move.
      if (card.face_down && card.controller !== actor) obscureIdentity(card);
      if (position === 'top') to.cards.unshift(card);
      else to.cards.push(card);
    }
    syncCount(from); syncCount(to);
  }
  switch (op.type) {
    case 'move': {
      const { card, zone: from } = findCard(table, op.card);
      relocate(card, from, zone(table, op.to), op.position);
      break;
    }
    case 'draw': {
      const count = integer(op.count ?? 1, 0, 100);
      const from = zone(table, op.from || `${actor}:library`);
      const to = zone(table, op.to || `${actor}:hand`);
      const drawn = Math.min(count, from.count);
      if (!drawn) break;
      if (zoneVisible(from, actor) && from.cards.length === from.count && !from.order_pending) {
        for (const card of [...from.cards.slice(0, drawn)]) relocate(card, from, to);
      } else {
        // A projected library contains only the known subset, with no absolute
        // indices. Even a known card cannot safely be assumed to be on top.
        detach(table, new Set(from.cards.map(c => c.id)));
        from.cards = [];
        from.count -= drawn;
        to.count += drawn;
        if (zoneVisible(to, actor)) for (let i = 0; i < drawn; i++) to.cards.push(unknown(from.owner || actor));
        syncCount(from); syncCount(to);
        warn('Drawn card identities are available after sending');
      }
      break;
    }
    case 'shuffle': {
      const z = zone(table, op.zone || `${actor}:library`);
      detach(table, new Set(z.cards.map(c => c.id)));
      z.cards = zoneVisible(z, actor)
        ? z.cards.map(c => temporary({ ...c, attached_to: null }))
        : [];
      // Existing visible cards are a collection, not a predicted shuffled order.
      z.order_pending = true;
      syncCount(z);
      warn('Shuffled order and new card handles are available after sending');
      break;
    }
    case 'peek': {
      const z = zone(table, op.zone);
      const count = Math.min(integer(op.count ?? 1, 1, 100), z.count);
      if (!zoneVisible(z, actor)) {
        // Do not guess which previously known cards overlap the requested top N.
        // Keep knowledge conservative and show the pending look as card backs.
        detach(table, new Set(z.cards.map(c => c.id)));
        z.cards = Array.from({ length: count }, () => unknown(z.owner || actor));
        syncCount(z);
      }
      warn('Looked-at card identities are available after sending');
      break;
    }
    case 'reveal': {
      const { card } = findCard(table, op.card);
      requireThat(card.name !== 'Face-down card' && !card.preview_unknown, 'Cannot reveal an identity you cannot see');
      requireThat(op.to === undefined || Array.isArray(op.to), 'Expected player list');
      for (const id of op.to || []) player(table, id);
      break;
    }
    case 'card': {
      const { card } = findCard(table, op.card);
      requireThat(op.set && typeof op.set === 'object' && !Array.isArray(op.set), 'Expected card changes');
      const identityWasHidden = card.name === 'Face-down card';
      for (const [key, value] of Object.entries(op.set)) {
        switch (key) {
          case 'tapped': case 'face_down':
            requireThat(typeof value === 'boolean', 'Expected boolean'); card[key] = value; break;
          case 'controller': player(table, value); card.controller = value; break;
          case 'damage': card.damage = integer(value, 0); break;
          case 'counters': card.counters = counters(value); break;
          case 'note': case 'face': card[key] = text(value); break;
          case 'attached_to':
            if (value !== null) {
              findCard(table, value);
              requireThat(value !== card.id, 'Cannot attach a card to itself');
            }
            card.attached_to = value; break;
          default: throw new Error(`Unsupported card field: ${key}`);
        }
      }
      if (card.face_down && card.controller !== actor) obscureIdentity(card);
      else if (identityWasHidden) {
        // Flipping a card does not allow the browser to invent its identity.
        card.name = 'Unknown card'; card.preview_unknown = true; card.editable = false;
        warn('This card’s identity is available after sending');
      }
      break;
    }
    case 'player': {
      const p = player(table, op.player || actor);
      requireThat(op.set && typeof op.set === 'object' && !Array.isArray(op.set), 'Expected player changes');
      for (const [key, value] of Object.entries(op.set)) {
        if (key === 'life') p.life = integer(value);
        else if (key === 'counters' || key === 'mana') p[key] = counters(value);
        else if (key === 'note') p.note = text(value);
        else if (key === 'status') {
          requireThat(['active', 'eliminated', 'conceded'].includes(value), 'Invalid player status');
          p.status = value;
        } else throw new Error(`Unsupported player field: ${key}`);
      }
      break;
    }
    case 'turn':
      requireThat(op.set && typeof op.set === 'object' && !Array.isArray(op.set), 'Expected turn changes');
      for (const [key, value] of Object.entries(op.set)) {
        if (key === 'number') table.turn.number = integer(value, 1);
        else if (key === 'phase') table.turn.phase = text(value, 100);
        else if (key === 'active' || key === 'priority') {
          if (value !== null || key === 'active') player(table, value);
          table.turn[key] = value;
        } else throw new Error(`Unsupported turn field: ${key}`);
      }
      break;
    case 'pass':
      player(table, op.next); table.turn.priority = op.next;
      if (op.message !== undefined) requireThat(text(op.message).trim(), 'Public speech must not be empty');
      break;
    case 'pass_turn':
      player(table, op.next);
      table.turn = { number: integer(op.number ?? table.turn.number + 1, 1), active: op.next, priority: op.next, phase: text(op.phase ?? 'Untap', 100) };
      if (op.message !== undefined) requireThat(text(op.message).trim(), 'Public speech must not be empty');
      break;
    case 'token': case 'stack_item': {
      const owner = op.type === 'stack_item' ? actor : op.owner || actor;
      player(table, owner);
      const z = zone(table, op.type === 'stack_item' ? 'stack' : op.to || 'battlefield');
      requireThat(op.definition && typeof op.definition === 'object', 'Expected card definition');
      requireThat(text(op.definition.name, 200).trim(), 'Card name is required');
      const count = op.type === 'stack_item' ? 1 : integer(op.count ?? 1, 1, 100);
      for (let i = 0; i < count; i++) {
        const card = temporary({
          ...copy(op.definition), owner, controller: owner, token: op.type === 'token',
          kind: op.type === 'stack_item' ? 'ability' : 'card', tapped: false,
          face_down: false, face: 'front', counters: {}, damage: 0, attached_to: null, note: '',
        });
        z.count++;
        if (zoneVisible(z, actor)) {
          if (op.type === 'stack_item') z.cards.unshift(card);
          else z.cards.push(card);
        }
      }
      syncCount(z);
      break;
    }
    case 'remove_token': case 'remove_stack_item': {
      const { card, zone: z } = findCard(table, op.card);
      requireThat(op.type === 'remove_token' ? card.token : card.kind === 'ability', 'Only tokens or ability objects can be removed');
      z.cards = z.cards.filter(c => c.id !== card.id); z.count--; syncCount(z);
      detach(table, new Set([card.id]));
      break;
    }
    case 'zone':
      requireThat(typeof op.id === 'string' && /^[a-zA-Z0-9_:-]{1,80}$/.test(op.id), 'Invalid zone ID');
      requireThat(!['__proto__', 'constructor', 'prototype'].includes(op.id), 'Reserved zone ID');
      requireThat(!Object.hasOwn(table.zones, op.id), 'Zone already exists');
      requireThat(['public', 'owner', 'hidden'].includes(op.visibility), 'Invalid visibility');
      if (op.owner !== undefined && op.owner !== null) player(table, op.owner);
      requireThat(op.visibility !== 'owner' || op.owner, 'Private zone needs an owner');
      table.zones[op.id] = { id: op.id, owner: op.owner || null, visibility: op.visibility, cards: [], count: 0, hidden_count: 0 };
      break;
    case 'result':
      requireThat(Array.isArray(op.winners), 'Supply winner IDs, or [] for a draw');
      for (const id of op.winners) player(table, id);
      table.result = { winners: [...new Set(op.winners)], explanation: text(op.explanation || ''), reported_by: actor };
      break;
    case 'say': requireThat(text(op.text).trim(), 'Public speech must not be empty'); break;
    case 'note': text(op.text); break;
    default: throw new Error('Unknown action type');
  }
}

/** Recompute a seat's unsent actions. No logs, revision changes, or hidden reads. */
export function previewHumanActions(seatFilteredTable, actor, actions) {
  let table = copy(seatFilteredTable);
  const errors = [], warnings = [];
  let appliedCount = 0;
  try {
    player(table, actor);
    requireThat(Array.isArray(actions) && actions.length <= 30, 'A play can contain up to 30 actions');
  } catch (error) {
    return { table, valid: false, errors: [{ index: -1, message: error.message }], warnings, appliedCount };
  }
  for (const [index, action] of actions.entries()) {
    const next = copy(table), stepWarnings = [];
    try {
      if (action?.type === 'pass' || action?.type === 'pass_turn') requireThat(index === actions.length - 1, 'A handoff must be the last action');
      perform(next, actor, action, index, message => stepWarnings.push({ index, message }));
      table = next; appliedCount++;
      warnings.push(...stepWarnings);
    } catch (error) {
      errors.push({ index, message: error.message });
      break; // Later actions may depend on this one; never present them as valid.
    }
  }
  return { table, valid: errors.length === 0, errors, warnings, appliedCount };
}
