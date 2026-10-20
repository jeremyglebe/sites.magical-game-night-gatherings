import { createReplay, startingDecks, conversationEvents, validateRecording } from '/review/replay.mjs';
import { appendRevealedCards, revealedCardSnapshots } from '/revealed-cards.mjs';

const $ = id => document.getElementById(id);
const make = (tag, className = '', text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
};
const colors = ['#b9d8b1', '#b3cde2', '#dbd3a8', '#d2bce5', '#efa797', '#a6d9d3'];
let games = [], game = null, recording = null, replay = null, deckData = [], events = [];
let position = 0, selectedDeckId = null, selectedTab = 'replay', playback = null, requestId = 0;

function formatDate(value, options = { dateStyle: 'medium', timeStyle: 'short' }) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, options).format(date) : 'Date unavailable';
}
function errorMessage(error) {
  $('page-error').textContent = error?.message || 'The saved game could not be opened.';
  $('page-error').hidden = false;
}
async function getJSON(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    let message;
    try { message = (await response.json()).error; } catch { /* Use HTTP status below. */ }
    throw new Error(typeof message === 'string' ? message : `Unable to read saved game (HTTP ${response.status}).`);
  }
  return response.json();
}
function applyHostMetadata(data) {
  if (typeof data.liveTableUrl !== 'string') return;
  try {
    const url = new URL(data.liveTableUrl, location.origin);
    if (url.origin === location.origin || (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.protocol === 'http:'))
      $('live-table-link').href = url.href;
  } catch { /* A malformed optional link does not prevent reviewing a game. */ }
}
function playerConfig(id) {
  return game?.players?.find(player => player.id === id) || recording?.setup?.players?.find(player => player.id === id) || {};
}
function playerName(id, state = recording?.initial) {
  return state?.players?.find(player => player.id === id)?.name || playerConfig(id).name || id || 'Table';
}
function modelLabel(player) {
  if (player.ai === false) return 'Human player';
  return [player.model?.replace(/^gpt-/, ''), player.reasoning ? `${player.reasoning[0].toUpperCase()}${player.reasoning.slice(1)} reasoning` : ''].filter(Boolean).join(' · ') || 'Player';
}
function avatar(player, seat = 0) {
  const badge = make('span', 'avatar', seat >= 0 ? seat + 1 : '•');
  badge.setAttribute('aria-hidden', 'true');
  if (/^robot-(orc|wizard|dwarf|elf-ranger|knight|rogue|cleric|bard)$/.test(player.avatar)) {
    const image = make('img');
    image.src = `/avatars/${player.avatar}.png`;
    image.alt = '';
    image.loading = 'lazy';
    image.addEventListener('error', () => image.remove(), { once: true });
    badge.append(image);
  }
  return badge;
}
function cardImage(definition) {
  try {
    const url = new URL(definition?.image_url);
    return url.protocol === 'https:' && url.hostname === 'cards.scryfall.io' ? url.href : null;
  } catch { return null; }
}
function appendImage(parent, definition, className = '') {
  const source = cardImage(definition);
  if (!source) return false;
  const image = make('img', className);
  image.src = source;
  image.alt = definition.name || 'Card';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener('error', () => image.remove(), { once: true });
  parent.append(image);
  return true;
}
function resultLabel(summary) {
  if (!summary.result) return 'Unfinished';
  const winners = summary.result?.winners || [];
  const outcome = winners.length ? `${winners.map(id => summary.players?.find(p => p.id === id)?.name || id).join(' & ')} won` : 'Draw';
  return outcome + (summary.feedback?.status === 'pending' ? ' · Feedback pending' : '');
}
function navigate(path) {
  stopPlayback();
  if (location.pathname !== path) history.pushState(null, '', path);
  route();
}
function localLink(anchor, path) {
  anchor.href = path;
  anchor.addEventListener('click', event => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(path);
  });
}

function renderLibrary() {
  const query = $('game-search').value.trim().toLocaleLowerCase();
  const filter = $('game-filter').value;
  const visible = games.filter(saved => {
    const matchesText = `${saved.title} ${(saved.players || []).map(p => p.name).join(' ')}`.toLocaleLowerCase().includes(query);
    const matchesStatus = filter === 'all' || (filter === 'completed' ? saved.completed
      : filter === 'feedback' ? saved.feedback?.status === 'pending' : !saved.result);
    return matchesText && matchesStatus;
  });
  $('game-count').textContent = `${visible.length} ${visible.length === 1 ? 'game' : 'games'}`;
  const list = $('game-list');
  list.replaceChildren();
  if (!visible.length) {
    list.append(make('p', 'empty-state', games.length ? 'No games match these filters.' : 'Your saved games will appear here after a playtest is created.'));
    return;
  }
  for (const saved of visible) {
    const card = make('a', 'game-card');
    localLink(card, `/games/${encodeURIComponent(saved.id)}`);
    const top = make('div', 'game-card-top');
    const heading = make('div');
    heading.append(make('h2', '', saved.title || 'Untitled game'), make('p', 'game-result', resultLabel(saved)));
    const date = make('time', '', formatDate(saved.startedAt, { month: 'short', day: 'numeric' }));
    date.title = formatDate(saved.startedAt);
    top.append(heading, date);
    const players = make('div', 'player-chips');
    for (const [seat, player] of (saved.players || []).entries()) {
      const chip = make('span', 'player-chip');
      chip.title = modelLabel(player);
      chip.append(avatar(player, seat), make('span', '', player.name || player.id));
      players.append(chip);
    }
    const foot = make('div', 'game-card-foot');
    foot.append(make('span', '', `${saved.frameCount ?? 0} recorded batches · Revision ${saved.revision ?? 0}`), make('span', '', 'Review →'));
    card.append(top, players, foot);
    list.append(card);
  }
}
async function loadLibrary() {
  const token = ++requestId;
  game = null;
  $('game-review').hidden = true;
  $('library').hidden = false;
  $('refresh-library').disabled = true;
  $('page-error').hidden = true;
  try {
    const data = await getJSON('/api/games');
    if (token !== requestId) return;
    applyHostMetadata(data);
    games = [...(data.games || [])].sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
    $('archive-warning').textContent = (data.warnings || []).join(' ');
    $('archive-warning').hidden = !data.warnings?.length;
    renderLibrary();
  } catch (error) { if (token === requestId) errorMessage(error); }
  finally {
    if (token === requestId) { $('loading').hidden = true; $('refresh-library').disabled = false; }
  }
}
async function openGame(id, preserve = false) {
  const token = ++requestId;
  stopPlayback();
  const previousPosition = position;
  const previousScroll = $('conversation-log').scrollTop;
  const openGroups = new Set(preserve ? [...$('conversation-log').querySelectorAll('details[open]')].map(node => node.dataset.actionGroup) : []);
  $('refresh-game').disabled = true;
  $('page-error').hidden = true;
  if (!preserve) {
    $('library').hidden = true;
    $('game-review').hidden = true;
    $('loading').hidden = false;
    selectedDeckId = null;
    selectedTab = location.hash === '#feedback' ? 'feedback' : 'replay';
  }
  try {
    const data = await getJSON(`/api/games/${encodeURIComponent(id)}`);
    if (token !== requestId) return;
    const nextRecording = validateRecording(data.recording);
    const nextReplay = createReplay(nextRecording);
    const nextDecks = startingDecks(nextRecording);
    const nextEvents = conversationEvents(nextRecording);
    applyHostMetadata(data);
    game = { ...data.game, id };
    recording = nextRecording;
    replay = nextReplay;
    deckData = nextDecks;
    events = nextEvents;
    $('review-title').textContent = game.title || recording.title || 'Saved game';
    $('review-date').textContent = formatDate(game.startedAt || recording.started_at);
    $('review-description').textContent = `${resultLabel(game)} · ${recording.initial.players.length} players · Last recorded revision ${game.revision ?? recording.initial.revision} · Saved ${formatDate(game.updatedAt || recording.started_at)}`;
    $('download-recording').href = `/api/games/${encodeURIComponent(id)}/recording`;
    $('position-slider').max = replay.length;
    document.title = `${game.title || 'Saved game'} · Game Night`;
    renderConversation();
    for (const details of $('conversation-log').querySelectorAll('details')) details.open = openGroups.has(details.dataset.actionGroup);
    renderDeckTabs();
    renderFeedback();
    selectTab(selectedTab);
    $('game-review').hidden = false;
    seek(preserve ? Math.min(previousPosition, replay.length) : replay.length);
    if (preserve) $('conversation-log').scrollTop = previousScroll;
    else $('conversation-log').scrollTop = $('conversation-log').scrollHeight;
  } catch (error) { if (token === requestId) errorMessage(error); }
  finally {
    if (token === requestId) { $('loading').hidden = true; $('refresh-game').disabled = false; }
  }
}
function route() {
  stopPlayback();
  const match = location.pathname.match(/^\/games\/([^/]+)\/?$/);
  if (match) {
    try { openGame(decodeURIComponent(match[1])); } catch (error) { errorMessage(error); }
  } else {
    document.title = 'Saved games · Game Night';
    loadLibrary();
  }
}

function stopPlayback() {
  if (playback) clearInterval(playback);
  playback = null;
  $('toggle-playback').textContent = '▶ Play';
  $('toggle-playback').setAttribute('aria-label', 'Play recording');
}
function startPlayback() {
  if (!replay?.length) return;
  if (position >= replay.length) seek(0, true);
  $('toggle-playback').textContent = 'Ⅱ Pause';
  $('toggle-playback').setAttribute('aria-label', 'Pause recording');
  playback = setInterval(() => {
    seek(position + 1, true);
    if (position === replay.length) stopPlayback();
  }, Number($('playback-speed').value));
}
function scrollToCurrent() {
  const list = $('conversation-log');
  const current = [...list.children].find(item => Number(item.dataset.position) === position);
  if (current) list.scrollTop += current.getBoundingClientRect().top - list.getBoundingClientRect().top - 10;
  else if (position === 0) list.scrollTop = 0;
}
function seek(next, scroll = false) {
  if (!replay) return;
  position = Math.max(0, Math.min(replay.length, Number(next)));
  const state = replay.stateAt(position);
  $('position-slider').value = position;
  $('position-slider').setAttribute('aria-valuetext', position === 0 ? 'Initial setup' : `Batch ${position} of ${replay.length}, revision ${state.revision}`);
  $('position-label').textContent = position === 0 ? `Initial setup · ${replay.length} batches saved` : `Batch ${position} of ${replay.length} · Revision ${state.revision}`;
  $('replay-position-note').textContent = `${position === replay.length ? 'Latest saved position' : position === 0 ? 'Original recorded setup' : 'Earlier position — later messages are dimmed'} · Revision ${state.revision}${position ? ' · ' + formatDate(recording.frames[position - 1].event.at, { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : ''}`;
  $('first-position').disabled = $('previous-position').disabled = position === 0;
  $('last-position').disabled = $('next-position').disabled = position === replay.length;
  $('toggle-playback').disabled = $('position-slider').disabled = replay.length === 0;
  $('jump-current').disabled = position === 0;
  for (const item of $('conversation-log').children) {
    const at = Number(item.dataset.position);
    item.classList.toggle('future', at > position);
    item.classList.toggle('current', at === position);
    const jump = item.querySelector('.jump-action');
    if (jump) { if (at === position) jump.setAttribute('aria-current', 'step'); else jump.removeAttribute('aria-current'); }
  }
  renderTable(state);
  if (scroll) scrollToCurrent();
}
function selectTab(tab) {
  selectedTab = tab;
  if (tab !== 'replay') stopPlayback();
  for (const name of ['replay', 'decks', 'feedback']) {
    $(`${name}-tab`).setAttribute('aria-selected', String(name === tab));
    $(`${name}-tab`).tabIndex = name === tab ? 0 : -1;
    $(`${name}-panel`).hidden = name !== tab;
  }
}

function renderConversation() {
  const list = $('conversation-log');
  list.replaceChildren();
  if (!events.length) { list.append(make('li', 'empty-state', 'No table actions have been recorded yet.')); return; }
  for (const { position: at, event } of events) {
    const seat = recording.initial.players.findIndex(player => player.id === event.actor);
    const item = make('li', `chat-event${recording.initial.players.length === 2 && seat === 1 ? ' align-end' : ''}`);
    item.style.setProperty('--speaker-color', colors[Math.max(0, seat) % colors.length]);
    item.dataset.position = at;
    const body = make('div', 'chat-body');
    const meta = make('div', 'activity-meta');
    const jump = make('button', 'jump-action', `#${at} · ${formatDate(event.at, { hour: 'numeric', minute: '2-digit' })}`);
    jump.title = `Show batch ${at}, revision ${event.revision}`;
    jump.setAttribute('aria-label', `${playerName(event.actor)}, batch ${at}, revision ${event.revision}. Show this position.`);
    jump.addEventListener('click', () => { stopPlayback(); seek(at); });
    meta.append(make('strong', '', playerName(event.actor)), jump);
    const bubble = make('div', 'activity-bubble');
    bubble.addEventListener('click', event => {
      if (event.target.closest('summary, button, a') || window.getSelection()?.toString()) return;
      stopPlayback();
      seek(at);
    });
    let actions = [], groupIndex = 0;
    function flush() {
      if (!actions.length) return;
      const group = make(actions.length > 2 ? 'details' : 'div', 'activity-actions');
      if (actions.length > 2) {
        group.dataset.actionGroup = `${at}:${groupIndex++}`;
        group.append(make('summary', '', `${actions.length} table actions`));
      }
      for (const action of actions) group.append(make('p', `activity-line${action.note ? ' activity-note' : ''}`, action.text));
      bubble.append(group);
      actions = [];
    }
    function speech(text) {
      if (typeof text !== 'string' || !text.trim()) return;
      flush();
      bubble.append(make('p', 'activity-speech', text));
    }
    for (const change of event.changes?.length ? event.changes : [event]) {
      if (change.type === 'say') speech(change.text);
      else if (revealedCardSnapshots(change).length) {
        flush();
        bubble.append(make('p', 'activity-line', change.summary || 'Revealed cards'));
        appendRevealedCards(bubble, change, { onInspect: card => inspectCard(card) });
      } else {
        actions.push({ text: change.type === 'note' ? `Note: ${change.text}` : change.summary || 'Table updated', note: change.type === 'note' });
        if (['pass', 'pass_turn'].includes(change.type)) speech(change.message);
      }
    }
    flush();
    body.append(meta, bubble);
    item.append(avatar(playerConfig(event.actor), seat), body);
    list.append(item);
  }
}

function cardsIn(state, zone) {
  return (state.zones[zone]?.cards || []).map(id => state.cards[id]).filter(Boolean);
}
function statusLabel(player, state) {
  if (state.result?.winners?.includes(player.id)) return 'WINNER';
  if (player.status === 'conceded') return 'CONCEDED';
  if (player.status === 'eliminated') return 'DEAD';
  if (state.result && !state.result.winners?.length) return 'DRAW';
  return '';
}
function cardButton(card, { reveal = false } = {}) {
  const definition = card.definition || {};
  const concealed = card.face_down && !reveal;
  const name = concealed ? 'Face-down card' : definition.name || 'Unnamed card';
  const button = make('button', `card-thumb${card.tapped ? ' tapped' : ''}${concealed ? ' face-down' : ''}`);
  button.title = [name, card.tapped ? 'Tapped' : '', card.damage ? `${card.damage} damage` : ''].filter(Boolean).join(' · ');
  button.setAttribute('aria-label', `Inspect ${button.title}`);
  if (!concealed) appendImage(button, definition);
  // Keep a useful name when an image is unavailable, without covering card art.
  const label = make('span', 'card-name', name);
  if (button.querySelector('img')) label.classList.add('sr-only');
  button.querySelector('img')?.addEventListener('error', () => label.classList.remove('sr-only'), { once: true });
  button.append(label);
  const markers = Object.entries(card.counters || {}).map(([key, value]) => `${value} ${key}`);
  if (card.damage) markers.push(`${card.damage} dmg`);
  if (markers.length) button.append(make('span', 'card-badge', markers.join(' · ')));
  button.addEventListener('click', () => inspectCard(definition, card));
  return button;
}
function makeBoard(player, seat, state) {
  const board = make('section', `replay-board${state.turn.active === player.id ? ' active' : ''}`);
  board.setAttribute('aria-label', `${player.name || player.id}'s board`);
  const head = make('div', 'board-heading');
  const identity = make('div', 'board-identity');
  const info = make('div');
  const seatLabel = game.layout === 'emperor' && state.players.length === 6
    ? `${seat < 3 ? 'Team A' : 'Team B'} · ${seat % 3 === 1 ? 'Emperor' : 'Flank'}`
    : `Seat ${seat + 1}`;
  info.append(make('p', 'small', seatLabel));
  const title = make('h3', '', player.name || player.id);
  const outcome = statusLabel(player, state);
  if (outcome) title.append(make('span', `board-status${['DEAD', 'CONCEDED'].includes(outcome) ? ' out' : ''}`, outcome));
  else if (state.turn.priority === player.id) title.append(make('span', 'board-status', 'Priority'));
  info.append(title);
  info.title = modelLabel(playerConfig(player.id));
  identity.append(avatar(playerConfig(player.id), seat), info);
  const life = make('div', 'board-life', player.life ?? '—');
  life.append(make('small', '', 'life'));
  head.append(identity, life);
  const counts = make('div', 'board-counts');
  for (const [label, zone] of [['library', 'library'], ['hand', 'hand']]) counts.append(make('span', '', `${state.zones[`${player.id}:${zone}`]?.cards?.length || 0} ${label}`));
  for (const [key, value] of Object.entries(player.counters || {})) if (value) counts.append(make('span', '', `${value} ${key}`));
  for (const [key, value] of Object.entries(player.mana || {})) if (value) counts.append(make('span', '', `${value} ${key} mana`));
  board.append(head, counts);
  const battlefield = cardsIn(state, 'battlefield').filter(card => (card.controller || card.owner) === player.id);
  const isLand = card => /\bLand\b/.test(card.definition?.type_line || '');
  for (const [label, cards] of [['Permanents', battlefield.filter(card => !isLand(card))], ['Lands', battlefield.filter(isLand)]]) {
    const lane = make('div', 'board-lane');
    const labelNode = make('div', 'lane-title');
    labelNode.append(make('span', '', label), make('span', '', cards.length));
    const row = make('div', 'board-cards');
    if (!cards.length) row.append(make('span', 'muted small', 'Empty'));
    for (const card of cards) row.append(cardButton(card));
    lane.append(labelNode, row);
    board.append(lane);
  }
  const footer = make('div', 'board-footer');
  for (const [label, suffix] of [['Hand', 'hand'], ['Library', 'library'], ['Grave', 'graveyard'], ['Exile', 'exile'], ['Command', 'command']]) {
    const id = `${player.id}:${suffix}`;
    const cards = cardsIn(state, id);
    const button = make('button', '', `${label} ${cards.length}`);
    button.title = `Inspect ${player.name || player.id}'s ${suffix}`;
    button.addEventListener('click', () => inspectZone(`${player.name || player.id} · ${label}`, cards));
    footer.append(button);
  }
  board.append(footer);
  if (player.note) board.append(make('p', 'board-note', player.note));
  return board;
}
function sharedStrip(state) {
  const strip = make('div', 'shared-strip');
  const turn = make('div');
  turn.append(make('p', 'turn-label', `Turn ${state.turn.number ?? '—'} · ${playerName(state.turn.active, state)}`));
  turn.append(make('p', 'muted small', `${state.turn.phase || 'No phase marked'} · Priority: ${playerName(state.turn.priority, state)}`));
  if (state.result) turn.append(make('p', 'small', state.result.explanation || 'Result reported by the players.'));
  const stack = make('div', 'stack');
  stack.append(make('span', '', 'STACK · TOP FIRST'));
  const cards = cardsIn(state, 'stack');
  if (!cards.length) stack.append(make('span', 'muted small', 'Stack is empty'));
  for (const [index, card] of cards.entries()) {
    const item = make('div', 'stack-card');
    item.append(make('span', 'stack-position', index === 0 ? 'TOP' : `#${index + 1}`), cardButton(card));
    stack.append(item);
  }
  strip.append(turn, stack);
  return strip;
}
function renderTable(state) {
  const root = $('replay-boards');
  root.replaceChildren();
  const players = state.players;
  const columns = players.length <= 6 ? Math.max(1, Math.ceil(players.length / 2)) : 3;
  if (players.length === 1) root.append(sharedStrip(state));
  for (let start = 0; start < players.length; start += columns) {
    if (start > 0) root.append(start === columns ? sharedStrip(state) : make('div', 'row-gap'));
    const row = make('div', 'board-row');
    const rowPlayers = players.slice(start, start + columns);
    row.style.setProperty('--columns', rowPlayers.length);
    row.dataset.count = rowPlayers.length;
    rowPlayers.forEach((player, offset) => row.append(makeBoard(player, start + offset, state)));
    root.append(row);
  }
  $('replay-notes').textContent = (state.notes || []).filter(note => note.kind !== 'speech').at(-1)?.text || '';
}

function renderDeckTabs() {
  const tabs = $('deck-player-tabs');
  tabs.replaceChildren();
  if (!deckData.some(deck => deck.id === selectedDeckId)) selectedDeckId = deckData[0]?.id;
  for (const [seat, deck] of deckData.entries()) {
    const button = make('button');
    button.id = `deck-tab-${seat}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', 'deck-content');
    button.setAttribute('aria-selected', String(deck.id === selectedDeckId));
    button.tabIndex = deck.id === selectedDeckId ? 0 : -1;
    button.append(avatar(playerConfig(deck.id), seat), make('span', '', deck.name));
    button.addEventListener('click', () => selectDeck(deck.id));
    tabs.append(button);
  }
  renderDeck();
}
function selectDeck(id) {
  selectedDeckId = id;
  [...$('deck-player-tabs').children].forEach((tab, index) => {
    const selected = deckData[index].id === id;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  renderDeck();
}
function renderDeck() {
  const root = $('deck-content');
  root.replaceChildren();
  const deck = deckData.find(deck => deck.id === selectedDeckId);
  if (!deck) return;
  root.setAttribute('aria-labelledby', `deck-tab-${deckData.indexOf(deck)}`);
  const heading = make('div', 'deck-heading');
  const title = make('div');
  title.append(make('h2', '', `${deck.name}'s deck`), make('p', 'deck-model', modelLabel(playerConfig(deck.id))));
  heading.append(title, make('p', 'muted', `${deck.total} cards · ${deck.cards.length} entries`));
  root.append(heading);
  root.append(make('p', 'deck-source', deck.source === 'setup' ? 'Full starting deck saved with this game. Select a card for its cached Oracle text and rulings.' : deck.note || 'Reconstructed from the first saved position; an earlier deck list was not saved.'));
  const list = make('div', 'deck-list');
  if (!deck.cards.length) list.append(make('p', 'empty-state', 'No card definitions were saved for this player.'));
  for (const { count, definition } of deck.cards) {
    const card = make('button', 'deck-card');
    card.setAttribute('aria-label', `${count} ${definition.name || 'Unnamed card'}, inspect card`);
    card.append(make('span', 'deck-quantity', `${count}×`));
    appendImage(card, definition);
    const info = make('div', 'deck-card-info');
    info.append(make('p', 'deck-card-name', definition.name || 'Unnamed card'));
    if (definition.type_line) info.append(make('p', 'deck-card-type', definition.type_line));
    if (definition.mana_cost) info.append(make('p', 'deck-card-cost', definition.mana_cost));
    card.append(info);
    card.addEventListener('click', () => inspectCard(definition));
    list.append(card);
  }
  root.append(list);
}
function showDialog(title, kicker) {
  $('card-title').textContent = title;
  $('card-kicker').textContent = kicker;
  $('card-content').replaceChildren();
  if (!$('card-dialog').open) $('card-dialog').showModal();
}
function inspectCard(definition, card) {
  showDialog(definition.name || 'Unnamed card', 'SAVED CARD REFERENCE');
  const layout = make('div', 'card-detail-layout');
  const art = make('div');
  if (!appendImage(art, definition, 'card-detail-art')) art.append(make('p', 'empty-state', 'No card image saved.'));
  const detail = make('div');
  if (definition.mana_cost) detail.append(make('p', '', definition.mana_cost));
  if (definition.type_line) detail.append(make('p', 'card-type', definition.type_line));
  detail.append(make('p', 'card-oracle', definition.oracle_text || 'No Oracle text was saved for this card.'));
  if (definition.power !== undefined || definition.toughness !== undefined) detail.append(make('p', '', `${definition.power ?? '—'} / ${definition.toughness ?? '—'}`));
  if (definition.loyalty !== undefined) detail.append(make('p', '', `Loyalty: ${definition.loyalty}`));
  if (card) {
    const properties = [card.tapped ? 'Tapped' : 'Untapped', card.face_down ? 'Face down' : '', card.damage ? `${card.damage} damage` : ''];
    for (const [key, value] of Object.entries(card.counters || {})) properties.push(`${value} ${key}`);
    detail.append(make('p', 'card-type', properties.filter(Boolean).join(' · ')));
    if (card.attached_to) detail.append(make('p', 'small muted', `Attached to ${replay.stateAt(position).cards[card.attached_to]?.definition?.name || card.attached_to}`));
    if (card.note) detail.append(make('p', 'card-oracle', card.note));
  }
  const rulings = make('div', 'card-rulings');
  rulings.append(make('h3', '', 'Saved rulings'));
  if (!definition.rulings?.length) rulings.append(make('p', '', 'No rulings were saved for this card.'));
  for (const ruling of definition.rulings || []) {
    if (typeof ruling === 'string') rulings.append(make('p', '', ruling));
    else rulings.append(make('p', '', [ruling.published_at, ruling.comment || ruling.text].filter(Boolean).join(' · ')));
  }
  detail.append(rulings);
  layout.append(art, detail);
  $('card-content').append(layout);
}
function inspectZone(title, cards) {
  showDialog(title, `${cards.length} CARDS · OWNER REVIEW`);
  const grid = make('div', 'zone-grid');
  if (!cards.length) grid.append(make('p', 'empty-state', 'This zone is empty at this position.'));
  for (const card of cards) grid.append(cardButton(card, { reveal: true }));
  $('card-content').append(grid);
}

function optionLabel(options, value) {
  const option = (options || []).find(item => (typeof item === 'string' ? item : item.value || item.id) === value);
  return typeof option === 'string' ? option.replaceAll('_', ' ') : option?.label || String(value || 'Not supplied').replaceAll('_', ' ');
}
function ratingAnchors(rating) {
  return Object.entries(rating.anchors || {}).map(([score, text]) => `${score}: ${text}`).join(' · ');
}
function feedbackEvidence(revision) {
  if (!Number.isSafeInteger(revision)) return null;
  const index = recording.frames.findIndex(frame => frame.event.revision === revision);
  const at = revision === recording.initial.revision ? 0 : index >= 0 ? index + 1 : null;
  if (at === null) return make('span', 'small muted', `Revision ${revision} · position not recorded`);
  const button = make('button', 'quiet evidence-link', `View revision ${revision} ↗`);
  button.addEventListener('click', () => {
    stopPlayback(); selectTab('replay'); seek(at, true);
    $('replay-panel').scrollIntoView({ block: 'start' });
  });
  return button;
}
function renderFeedback() {
  const root = $('feedback-content');
  root.replaceChildren();
  const survey = recording?.postgame;
  if (!survey) {
    root.append(make('div', 'empty-state', 'No post-game questionnaire was recorded for this game. The conversation and replay are still available for your own review.'));
    return;
  }
  const schema = survey.schema || {};
  const players = survey.players || recording.initial.players;
  const responses = survey.responses || {};
  const submitted = players.filter(player => responses[player.id]);
  const completed = ['complete', 'completed'].includes(survey.status);
  const header = make('div', 'feedback-heading');
  header.append(make('h2', '', schema.title || 'Post-game feedback'), make('p', 'feedback-count', `${submitted.length} of ${players.length} responses · ${completed ? 'Complete' : 'Feedback pending'}`));
  root.append(header, make('p', 'feedback-context', 'Independent player assessments from this game. Ratings reflect each player’s perspective, not a verified rules judgment or a conclusion about every matchup. AI enjoyment ratings estimate the human play experience.'));
  if (!completed) {
    const missing = players.filter(player => !responses[player.id]).map(player => player.name || player.id);
    root.append(make('p', 'notice', `Awaiting ${missing.join(', ')}. The game outcome is recorded; the playtest is complete once all feedback is submitted.`));
  }
  if (submitted.length) {
    const ratings = make('div', 'feedback-ratings');
    for (const rating of schema.ratings || []) {
      const scores = submitted.map(player => responses[player.id].answers?.ratings?.[rating.id]?.score).filter(score => Number.isFinite(score));
      const card = make('div', 'feedback-rating-summary');
      card.append(make('h3', '', rating.label || rating.id));
      if (rating.id === 'deck_strength') {
        card.append(make('strong', 'rating-value', scores.length ? (Math.min(...scores) === Math.max(...scores) ? `${scores[0]}/10` : `${Math.min(...scores)}–${Math.max(...scores)}/10`) : 'Not rated'));
        card.append(make('p', 'small muted', 'Range of players’ own-deck ratings'));
      } else {
        card.append(make('strong', 'rating-value', scores.length ? `${(scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1)}/10` : 'Not rated'));
        card.append(make('p', 'small muted', rating.id === 'complexity' ? 'Average difficulty · higher means harder' : 'Average player rating'));
      }
      card.append(make('p', 'small muted', `${scores.length} rated · ${submitted.length - scores.length} not enough evidence`));
      card.append(make('p', 'rating-anchors', ratingAnchors(rating)));
      ratings.append(card);
    }
    root.append(ratings);
  }
  const list = make('div', 'feedback-responses');
  for (const [seat, player] of players.entries()) {
    const response = responses[player.id];
    const card = make('section', 'feedback-response');
    const heading = make('div', 'feedback-player');
    const title = make('div');
    title.append(make('h3', '', player.name || player.id), make('p', 'small muted', response ? `Submitted ${formatDate(response.submittedAt)} · ${player.ai === false ? 'Human player' : 'AI player'}` : 'Awaiting independent feedback'));
    heading.append(avatar(playerConfig(player.id), seat), title);
    card.append(heading);
    if (!response) { list.append(card); continue; }
    const answers = response.answers || {};
    const confidence = optionLabel(schema.confidenceOptions, answers.confidence);
    card.append(make('p', 'feedback-confidence', `Confidence in this assessment: ${confidence}`));
    const scoreList = make('dl', 'feedback-score-list');
    for (const rating of schema.ratings || []) {
      const answer = answers.ratings?.[rating.id];
      const row = make('div');
      const term = make('dt', '', player.ai !== false && rating.aiLabel ? rating.aiLabel : rating.label || rating.id);
      term.title = ratingAnchors(rating);
      const value = make('dd');
      value.append(make('strong', '', Number.isFinite(answer?.score) ? `${answer.score}/10` : 'Not enough evidence'));
      if (answer?.reason) value.append(make('p', '', answer.reason));
      row.append(term, value); scoreList.append(row);
    }
    card.append(scoreList);
    for (const question of schema.textQuestions || []) {
      const section = make('div', 'feedback-answer');
      section.append(make('h4', '', question.label || question.id));
      section.append(make('p', answers[question.id] ? '' : 'muted', answers[question.id] || 'No observation supplied.'));
      card.append(section);
    }
    const incidents = make('div', 'feedback-answer');
    incidents.append(make('h4', '', 'Rules observations'), make('p', '', optionLabel(schema.rulesObservationOptions, answers.rules_observation)));
    for (const incident of answers.rules_incidents || []) {
      const entry = make('div', 'feedback-incident');
      entry.append(make('p', '', incident.description), make('p', 'small muted', `${optionLabel(schema.incidentStatusOptions, incident.status)} · ${optionLabel(schema.incidentImpactOptions, incident.impact)} impact`));
      const evidence = feedbackEvidence(incident.revision);
      if (evidence) entry.append(evidence);
      incidents.append(entry);
    }
    card.append(incidents); list.append(card);
  }
  root.append(list);
}

function keyboardTabs(container, callback) {
  container.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...container.querySelectorAll('[role=tab]')];
    const index = tabs.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    callback(next);
    tabs[next].focus();
  });
}
localLink($('back-library'), '/games');
localLink(document.querySelector('.brand'), '/games');
$('refresh-library').addEventListener('click', loadLibrary);
$('refresh-game').addEventListener('click', () => game && openGame(game.id, true));
$('game-search').addEventListener('input', renderLibrary);
$('game-filter').addEventListener('change', renderLibrary);
for (const [id, getPosition] of [['first-position', () => 0], ['previous-position', () => position - 1], ['next-position', () => position + 1], ['last-position', () => replay.length]])
  $(id).addEventListener('click', () => { stopPlayback(); seek(getPosition(), true); });
$('position-slider').addEventListener('input', event => { stopPlayback(); seek(Number(event.target.value), true); });
$('toggle-playback').addEventListener('click', () => playback ? stopPlayback() : startPlayback());
$('playback-speed').addEventListener('change', () => { if (playback) { stopPlayback(); startPlayback(); } });
$('jump-current').addEventListener('click', scrollToCurrent);
$('replay-tab').addEventListener('click', () => selectTab('replay'));
$('decks-tab').addEventListener('click', () => selectTab('decks'));
$('feedback-tab').addEventListener('click', () => selectTab('feedback'));
keyboardTabs(document.querySelector('.review-tabs'), index => selectTab(['replay', 'decks', 'feedback'][index]));
keyboardTabs($('deck-player-tabs'), index => selectDeck(deckData[index].id));
$('close-card').addEventListener('click', () => $('card-dialog').close());
$('card-dialog').addEventListener('click', event => { if (event.target === $('card-dialog')) $('card-dialog').close(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopPlayback(); });
window.addEventListener('popstate', route);
window.addEventListener('hashchange', () => { if (game && location.hash === '#feedback') selectTab('feedback'); });
route();
