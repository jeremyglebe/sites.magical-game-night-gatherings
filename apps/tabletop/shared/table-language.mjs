// Presentation only: callers supply the viewer's already-filtered event details.
// Never resolve a card handle against live state or rewrite player-authored text.
const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const join = (items) => items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
const quantity = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
const title = (value) => String(value || '').replace(/[_-]+/g, ' ').replace(/\b\p{L}/gu, letter => letter.toUpperCase());
const zones = { library: 'Deck', hand: 'Hand', graveyard: 'Graveyard', exile: 'Exile', command: 'Command Zone', sideboard: 'Sideboard', battlefield: 'Battlefield', stack: 'Stack' };

export function playerLabel(id, players = []) {
  const index = players.findIndex(player => player.id === id);
  if (index >= 0) return players[index].name || `Player ${index + 1}`;
  if (id === null || id === undefined || id === '') return 'Table';
  const numbered = /^p(\d+)$/i.exec(String(id));
  return numbered ? `Player ${numbered[1]}` : 'Unknown player';
}

export function turnNumberLabel(turn = {}, playerId = turn.active) {
  const count = turn.counts?.[playerId];
  if (Number.isSafeInteger(count) && count >= 0) {
    if (count === 0) return turn.countsComplete === true ? 'turn not started' : 'no turn recorded';
    return `${turn.countsComplete === true ? 'turn' : 'recorded turn'} ${count}`;
  }
  return Number.isSafeInteger(turn.number) ? `turn marker ${turn.number}` : 'turn count unavailable';
}

export function turnLabel(turn = {}, players = []) {
  if (turn.countsComplete === true && turn.totalTurns === 0) return 'Setup';
  if (!Number.isSafeInteger(turn.counts?.[turn.active])) {
    return `${turnNumberLabel(turn).replace(/^turn/, 'Turn')} · ${playerLabel(turn.active, players)}`;
  }
  return `${playerLabel(turn.active, players)}'s ${turnNumberLabel(turn)}`;
}

export function turnCountSummary(turn = {}, players = []) {
  if (!Number.isSafeInteger(turn.totalTurns) || turn.totalTurns < 0 || !players.length
    || !players.every(player => Number.isSafeInteger(turn.counts?.[player.id]) && turn.counts[player.id] >= 0)) {
    return 'Per-player turn counts unavailable for this recording.';
  }
  const complete = turn.countsComplete === true;
  const counts = players.map(player => `${playerLabel(player.id, players)} ${turn.counts[player.id]}`).join(' · ');
  return `${complete ? 'Turns begun' : 'Recorded turns begun'}: ${counts} · ${quantity(turn.totalTurns, 'individual turn')} ${complete ? 'total' : 'recorded'}`;
}

export function zoneLabel(zoneOrId, players = []) {
  if (!zoneOrId) return 'Zone';
  const zone = typeof zoneOrId === 'string' ? { id: zoneOrId } : zoneOrId;
  // Explicit names (for example a particular player's battlefield) are labels,
  // not internal identifiers, and may be supplied by a view component.
  if (zone.name && zone.name !== zone.id) return zone.name;
  const id = String(zone.id || '');
  const owner = zone.owner || [...players].sort((a, b) => b.id.length - a.id.length)
    .find(player => id.startsWith(`${player.id}:`))?.id || (/^p\d+:/i.test(id) ? id.slice(0, id.indexOf(':')) : null);
  const suffix = owner && id.startsWith(`${owner}:`) ? id.slice(owner.length + 1) : id;
  const label = zones[suffix] || zone.label || title(suffix || zone.kind || 'Zone');
  return owner ? `${playerLabel(owner, players)}'s ${label}` : label;
}

export function phaseLabel(phase) {
  if (!phase) return 'Setup';
  const normal = String(phase).trim().toLowerCase().replace(/[_-]+/g, ' ');
  const labels = {
    'main 1': 'Main Phase 1', 'main1': 'Main Phase 1', 'first main': 'Main Phase 1', 'precombat main': 'Main Phase 1',
    'main 2': 'Main Phase 2', 'main2': 'Main Phase 2', 'second main': 'Main Phase 2', 'postcombat main': 'Main Phase 2',
    'beginning of combat': 'Beginning of Combat', 'end of combat': 'End of Combat',
    'declare attackers': 'Declare Attackers', 'declare blockers': 'Declare Blockers', 'combat damage': 'Combat Damage',
    'first strike damage': 'First Strike Damage', 'end step': 'End Step',
  };
  return labels[normal] || title(phase);
}

function listCounters(values) {
  return Object.entries(values || {}).map(([kind, count]) => `${count} ${kind}`).join(', ');
}

// Old recordings may have only prose. Translate specific machine-generated
// grammar, never globally replace IDs (an ID could also be part of a card name).
function legacyText(change, actor, players) {
  const summary = typeof change.summary === 'string' ? change.summary : '';
  if (!summary) return 'Table updated';
  if (!actor || !players.length || !summary.startsWith(`${actor} `)) return summary;
  const name = playerLabel(actor, players);
  const rest = summary.slice(String(actor).length + 1);
  if (rest.startsWith('selected ')) return `${name} selects ${rest.slice(9)}`;
  if (rest.startsWith('updated their main deck and sideboard for game ')) return `${name} prepares their main deck and sideboard for game ${rest.slice(47)}`;
  const pass = /^(passed priority|passed the turn) to ([^\s;]+)$/.exec(rest);
  if (pass) return `${name} ${pass[1] === 'passed priority' ? 'passes priority' : 'passes the turn'} to ${playerLabel(pass[2], players)}`;
  const ability = /^added an ability to the stack(?:: (.*))?$/.exec(rest);
  if (ability) return `${name} announces ${ability[1] || 'an ability'}`;
  // At least replace the actor in a recognized generated sentence. The tail is
  // left byte-for-byte intact when structured details are unavailable.
  if (/^(drew |moved |shuffled |looked at |revealed |updated |created |removed |reported |is ready )/.test(rest)) return `${name} ${rest}`;
  return summary;
}

export function actionText(change = {}, { players = [], actor: eventActor } = {}) {
  const actor = change.actor ?? eventActor;
  const name = playerLabel(actor, players);
  const names = Array.isArray(change.cards) ? change.cards.filter(card => typeof card === 'string') : [];
  const card = names.length ? join(names) : 'a concealed card';
  const fallback = () => legacyText(change, actor, players);
  const zone = (id) => zoneLabel(id, players);
  const actionZone = (id) => {
    const zoneId = typeof id === 'string' ? id : id?.id;
    if (actor && typeof zoneId === 'string' && zoneId.startsWith(`${actor}:`)) {
      const kind = zoneId.slice(String(actor).length + 1);
      if (own(zones, kind)) return `their ${zones[kind].toLowerCase()}`;
    }
    if (zoneId === 'battlefield' || zoneId === 'stack') return `the ${zoneId}`;
    return zone(id);
  };
  const set = change.set;
  switch (change.type) {
    case 'say': return typeof change.text === 'string' ? change.text : '';
    case 'note': return typeof change.text === 'string' ? `Note: ${change.text}` : fallback();
    case 'move':
      if (change.to === 'battlefield' && change.from === 'stack') {
        return `${names.length ? card : 'A concealed card'} ${names.length > 1 ? 'resolve' : 'resolves'}`;
      }
      if (actor && change.to === 'battlefield' && change.from === `${actor}:hand`) return `${name} plays ${card}`;
      return change.from && change.to ? `${name} moves ${card} from ${actionZone(change.from)} to ${actionZone(change.to)}` : fallback();
    case 'draw': {
      if (!Number.isFinite(change.count)) return fallback();
      const destination = change.to && change.to !== `${actor}:hand` ? ` into ${actionZone(change.to)}` : '';
      const source = change.from && change.from !== `${actor}:library` ? ` from ${actionZone(change.from)}` : '';
      return `${name} draws ${quantity(change.count, 'card')}${source}${destination}${names.length ? ': ' + names.join(', ') : ''}`;
    }
    case 'shuffle': return change.zone ? `${name} shuffles ${actionZone(change.zone)}` : fallback();
    case 'peek':
      return change.from ? `${name} looks at ${Number.isFinite(change.count) ? quantity(change.count, 'card') : 'cards'} in ${actionZone(change.from)}${names.length ? ': ' + names.join(', ') : ''}` : fallback();
    case 'reveal': return actor ? `${name} reveals ${names.length ? join(names) : 'a card'}` : fallback();
    case 'token': return actor ? `${name} creates ${names.length ? join(names) : quantity(change.count ?? 1, 'token')}${change.to ? ' in ' + zone(change.to) : ''}` : fallback();
    case 'stack_item': return names.length ? `${name} announces ${join(names)}` : fallback();
    case 'remove_stack_item': return actor ? `${name} removes ${names.length ? join(names) : 'an ability'} from the stack` : fallback();
    case 'remove_token': return actor ? `${name} removes ${names.length ? join(names) : 'a token'}` : fallback();
    case 'card': {
      if (!set || !Object.keys(set).length) return actor ? `${name} updates ${card}` : fallback();
      const lines = [];
      if (own(set, 'tapped')) lines.push(`${name} ${set.tapped ? 'taps' : 'untaps'} ${card}`);
      if (own(set, 'face_down')) lines.push(`${name} turns ${card} face ${set.face_down ? 'down' : 'up'}`);
      if (own(set, 'controller')) lines.push(`${name} gives control of ${card} to ${playerLabel(set.controller, players)}`);
      if (own(set, 'damage')) lines.push(set.damage === 0 ? `${name} clears marked damage from ${card}` : `${name} marks ${set.damage} damage on ${card}`);
      if (own(set, 'counters')) lines.push(Object.keys(set.counters || {}).length ? `${name} sets the counters on ${card} to ${listCounters(set.counters)}` : `${name} removes all counters from ${card}`);
      if (own(set, 'attached_to')) lines.push(set.attached_to === null ? `${name} detaches ${card}` : `${name} attaches ${card} to ${set.attached_to}`);
      if (own(set, 'face')) lines.push(`${name} changes ${card} to ${set.face}`);
      if (own(set, 'note')) lines.push(`${name} notes on ${card}: ${set.note}`);
      return lines.length ? lines.join('; ') : fallback();
    }
    case 'player': {
      if (!set) return fallback();
      const target = playerLabel(change.player || actor, players);
      const lines = [];
      if (own(set, 'life')) lines.push(`${target} is now at ${set.life} life`);
      if (own(set, 'counters')) lines.push(Object.keys(set.counters || {}).length ? `${target}'s counters are now ${listCounters(set.counters)}` : `${target} has no counters`);
      if (own(set, 'mana')) lines.push(Object.keys(set.mana || {}).length ? `${target}'s mana pool is now ${listCounters(set.mana)}` : `${target}'s mana pool is empty`);
      if (own(set, 'status')) lines.push(set.status === 'conceded' ? `${target} concedes` : set.status === 'eliminated' ? `${target} is eliminated` : `${target} is back in the game`);
      if (own(set, 'note')) lines.push(`${target}: ${set.note}`);
      return lines.length ? lines.join('; ') : fallback();
    }
    case 'turn': {
      if (!set) return fallback();
      const lines = [];
      if (own(set, 'number') || own(set, 'active')) lines.push(set.counts && set.active
        ? turnLabel(set, players)
        : `Turn marker${own(set, 'number') ? ' ' + set.number : ''}${set.active ? ': ' + playerLabel(set.active, players) : ''}`);
      if (own(set, 'phase')) lines.push(`${name} moves to ${phaseLabel(set.phase)}`);
      if (own(set, 'priority')) lines.push(set.priority === null ? 'No player has priority' : `${playerLabel(set.priority, players)} has priority`);
      return lines.length ? lines.join('; ') : fallback();
    }
    case 'pass': return change.next ? `${name} passes priority to ${playerLabel(change.next, players)}` : fallback();
    case 'pass_turn': return change.next ? `${name} passes the turn to ${playerLabel(change.next, players)}${set ? ' · ' + turnNumberLabel(set, change.next) : ''}${set?.phase ? ' · ' + phaseLabel(set.phase) : ''}` : fallback();
    case 'zone': return change.zone ? `${name} creates ${zone(change.zone)}` : fallback();
    case 'result': {
      if (!Array.isArray(change.result?.winners)) return fallback();
      const winners = change.result.winners.map(id => playerLabel(id, players));
      return `${name} reports ${winners.length ? join(winners) + (winners.length === 1 ? ' wins' : ' win') : 'a draw'}${change.result.explanation ? ': ' + change.result.explanation : ''}`;
    }
    case 'select_packets': return fallback(); // Packet names live in the projected summary.
    case 'sideboard': return actor ? `${name} prepares their main deck and sideboard${Number.isFinite(change.series?.gameNumber) ? ' for game ' + (change.series.gameNumber + 1) : ''}` : fallback();
    case 'ready_next_game': {
      if (!actor) return fallback();
      const starter = set?.active || change.next;
      return `${name} is ready for the next game${change.game_started ? '; game ' + change.game_number + ' begins' + (starter ? ' with ' + playerLabel(starter, players) : '') : ''}`;
    }
    default: return fallback();
  }
}
