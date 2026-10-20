import { previewHumanActions } from './human-preview.mjs';
import { createCardDragController } from './card-drag.mjs';
import { cardDropActions } from './human-card-moves.mjs';

const make = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
};
const label = (text, control) => { const node = make('label', 'hc-field', text); control.setAttribute('aria-label', text); node.append(control); return node; };
const button = (text, action, className = '') => { const node = make('button', className, text); node.type = 'button'; node.addEventListener('click', action); return node; };
const input = (value = '', type = 'text') => { const node = make('input'); node.type = type; node.value = value; return node; };
const select = (items, value) => {
  const node = make('select');
  for (const [id, name] of items) { const option = make('option', '', name); option.value = id; node.append(option); }
  if (value !== undefined) node.value = value;
  return node;
};
const number = (node, min = -100000, max = 100000) => {
  const n = Number(node.value);
  if (!node.value.trim() || !Number.isSafeInteger(n) || n < min || n > max) throw Error(`Enter a whole number from ${min} to ${max}.`);
  return n;
};
const counterText = map => Object.entries(map || {}).map(([name, count]) => `${name}: ${count}`).join('\n');
function readCounters(node) {
  const pairs = node.value.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const split = line.lastIndexOf(':');
    const name = line.slice(0, split).trim(); const count = Number(line.slice(split + 1).trim());
    if (split < 1 || !name || !Number.isSafeInteger(count) || count < 0 || count > 100000) throw Error('Use one counter per line, for example +1/+1: 2. Counts must be whole numbers, zero or more.');
    return [name, count];
  });
  return Object.fromEntries(pairs);
}

export function createHumanControls({ root, composerRoot, interactionRoot = root, request, onChange = () => {}, onPreview = () => {}, onSeatChange = () => {} }) {
  root.classList.add('human-controls');
  root.setAttribute('aria-label', 'Human player controls');
  root.innerHTML = `<div class="hc-header"><div><div class="eyebrow">YOUR SEAT AT THE TABLE</div><h2>Human player</h2></div><div class="hc-seat-picker"><label>Play as <select class="hc-seat"></select></label><button type="button" class="hc-enter primary">Enter seat · show hand</button><button type="button" class="hc-hide quiet" hidden>Hide private controls</button></div></div>
    <p class="hc-status" role="status"></p><p class="hc-error" role="alert" hidden></p>
    <div class="hc-private" hidden>
      <p class="hc-help">Drag cards to a zone to queue a move. Undo in chat before sending. Click a card for details, or press Space to pick it up and choose a destination.</p>
      <div class="hc-selected" hidden><span class="hc-selected-text" role="status"></span><button type="button" class="hc-cancel-selection quiet">Cancel selection</button></div>
      <p class="hc-drag-status" role="status" aria-live="polite"></p>
      <div class="hc-zone-dock" aria-label="Card destinations"></div>
      <section class="hc-hand-section"><div class="hc-zone-head"><button type="button" class="hc-destination hc-hand-target">Your hand</button><span class="hc-hand-count"></span></div><div class="hc-hand hc-cards" aria-label="Your hand"></div></section>
      <div class="hc-tools"><label>Draw <input class="hc-draw-count" type="number" min="1" max="100" value="1" aria-label="Cards to draw"></label><button type="button" class="hc-draw" data-hc-act>Queue draw</button><button type="button" class="hc-shuffle" data-hc-act>Shuffle library</button><button type="button" class="hc-return" data-hc-act>Return entire hand</button><button type="button" class="hc-untap" data-hc-act>Untap my board</button><button type="button" class="hc-life" data-hc-act>Life & counters</button></div>
      <details class="hc-zone-browser"><summary>Browse zones &amp; known library cards</summary><div class="hc-main"><section class="hc-cards-section"><div class="hc-zone-head"><label>Cards <select class="hc-zone"></select></label><span class="hc-zone-count"></span></div><div class="hc-browse-cards hc-cards"></div></section></div></details>
      <details class="hc-more"><summary>More table controls</summary><div class="hc-tools"><button type="button" class="hc-markers" data-hc-act>Turn & phase markers</button><button type="button" class="hc-peek" data-hc-act>Look at library cards</button><button type="button" class="hc-token" data-hc-act>Create a token</button><button type="button" class="hc-ability" data-hc-act>Add a stack ability</button><button type="button" class="hc-outcome" data-hc-act>Concede or declare outcome</button></div><p class="hc-help">Use these physical table controls only when the rules or an agreed correction allow it. Moving a card does not clear its markers automatically.</p></details>
    </div>`;
  // Keep the private cards separate from the public chat until a seat is entered.
  if (!composerRoot) { composerRoot = make('section'); root.append(composerRoot); }
  composerRoot.classList.add('human-chat-composer');
  composerRoot.setAttribute('aria-label', 'Chat and pending actions');
  composerRoot.innerHTML = `<div class="hc-chat-entry"><p>Join the conversation from your human seat.</p><a class="hc-chat-enter" href="#${root.id || 'human-controls'}">Enter a human seat ↓</a></div>
    <div class="hc-compose" hidden><div class="hc-chat-heading"><strong class="hc-chat-identity"></strong><a class="hc-private-link" href="#${root.id || 'human-controls'}">Hand & controls ↓</a></div>
      <div class="hc-pending"><div class="hc-queue-heading"><span class="hc-draft-state"></span><div class="hc-queue-controls"><button type="button" class="hc-undo quiet">Undo last</button><button type="button" class="hc-clear quiet">Clear</button></div></div><ol class="hc-queue"></ol></div>
      <p class="hc-chat-error hc-error" role="alert" hidden></p>
      <label class="hc-field hc-message-field"><span class="hc-message-label">Message the table</span><textarea class="hc-message" aria-label="Message the table" maxlength="2000" rows="2" placeholder="Message the table…"></textarea></label>
      <div class="hc-handoff"><label>Pass to<select class="hc-recipient" aria-label="Pass to"></select></label></div>
      <div class="hc-send-row"><button type="button" class="hc-send primary">Send</button><button type="button" class="hc-pass" data-hc-act>Pass priority</button><button type="button" class="hc-turn" data-hc-act>Pass turn</button></div>
      <p class="hc-chat-hint hc-help"></p><p class="hc-key-hint hc-help">Enter to send · Shift+Enter for a new line</p>
    </div>`;
  const q = selector => root.querySelector(selector) || composerRoot.querySelector(selector);
  const all = selector => [...new Set([...root.querySelectorAll(selector), ...composerRoot.querySelectorAll(selector)])];
  const modal = make('dialog', 'hc-dialog');
  modal.setAttribute('aria-label', 'Human table action');
  root.append(modal);
  let app = null, publicTable = null, connected = false, matchId = '', playerId = '', visible = false;
  let view = null, queue = [], baseRevision = null, sending = false, fetching = false, generation = 0, cardSignature = '', choicesSignature = '', stateSignature = '', modalRevision = null, modalBoardRevision = null, savedRecipient = '', draftSignature = '';
  let preview = null, previewSignature = '', failedDraft = false, draftBoardRevision = null;
  let dragController = null, draftVersion = 0, selectedSource = null, selectedContext = '', handSignature = '', dockSignature = '', seatSignature = '';
  const draftKey = () => `game-night-human-draft:${matchId}:${playerId}`;
  function saveDraft() {
    if (!matchId || !playerId) return;
    try { sessionStorage.setItem(draftKey(), JSON.stringify({ queue, baseRevision, draftBoardRevision, failedDraft, message: q('.hc-message').value, recipient: q('.hc-recipient').value })); } catch {}
  }
  function restoreDraft() {
    queue = []; baseRevision = null; draftBoardRevision = null; failedDraft = false; q('.hc-message').value = '';
    try {
      const data = JSON.parse(sessionStorage.getItem(draftKey()) || 'null');
      if (data && Array.isArray(data.queue) && data.queue.length <= 30 && data.queue.every(item => item && typeof item.label === 'string' && item.op && typeof item.op.type === 'string')) {
        queue = data.queue; baseRevision = data.baseRevision; q('.hc-message').value = String(data.message || '').slice(0, 2000);
        draftBoardRevision = Number.isSafeInteger(data.draftBoardRevision) ? data.draftBoardRevision : null; failedDraft = data.failedDraft === true;
        savedRecipient = data.recipient || ''; q('.hc-recipient').value = savedRecipient;
      }
    } catch {}
  }
  function error(message = '') { for (const node of all('.hc-error')) { node.textContent = message; node.hidden = !message; } }
  function currentTable() { return preview?.table || view?.table; }
  function players() { return currentTable()?.players || publicTable?.players || []; }
  function playerName(id) { return players().find(p => p.id === id)?.name || id; }
  function zoneName(id) {
    if (id === 'battlefield') return 'Battlefield'; if (id === 'stack') return 'Stack';
    const zone = currentTable()?.zones?.[id]; const suffix = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
    return `${zone?.owner === playerId ? 'Your' : zone?.owner ? playerName(zone.owner) + ' ·' : ''} ${suffix}`.trim();
  }
  function isStale() { return queue.length > 0 && baseRevision !== view?.table?.revision; }
  function eligible() {
    const run = app?.coordinator;
    return connected && visible && view?.table?.revision === publicTable?.revision && !!view?.canAct && !view?.table?.result && !app?.postgame && run?.pendingRecipient?.playerId === playerId && !(run?.players || []).some(p => p.active) && !sending;
  }
  function canChat() { return connected && visible && !!view && view.canChat !== false && !!playerId && !view.table.result && !app?.postgame && !sending; }
  function canCommit() { return eligible() && !isStale() && !failedDraft && preview?.valid !== false; }
  function refreshPreview() {
    const ready = visible && connected && view && view.table.revision === publicTable?.revision && !isStale() && !failedDraft;
    preview = ready && queue.length ? previewHumanActions(view.table, playerId, queue.map(item => item.op)) : null;
    const meta = { matchId, playerId, baseRevision, pendingCount: queue.length, valid: preview?.valid !== false, errors: preview?.errors || [], warnings: preview?.warnings || [] };
    const next = JSON.stringify([preview?.table || null, meta]);
    if (next !== previewSignature) { previewSignature = next; onPreview(preview?.table || null, meta); }
  }
  function acceptView(result) {
    if (!result.table || (view && result.table.revision < view.table.revision)) return;
    // Speech changes the transcript revision, but cannot invalidate a physical draft.
    if (queue.length && !failedDraft) {
      if (draftBoardRevision === null && baseRevision === result.table.revision) draftBoardRevision = result.boardRevision ?? null;
      if (draftBoardRevision !== null && result.boardRevision === draftBoardRevision) {
        baseRevision = result.table.revision; saveDraft();
      }
    }
    view = result;
  }
  function ensureWritable() {
    if (!eligible()) throw Error(view?.message || 'Wait until control is handed to this seat.');
    if (isStale()) throw Error('The table changed after these actions were queued. Discard them and rebuild your play from the current state.');
    if (failedDraft) throw Error('The previous send could not be confirmed. Clear these actions and check the current table before rebuilding the play.');
    if (preview?.valid === false) throw Error(`Undo or remove the invalid queued action: ${preview.errors[0]?.message || 'this play cannot be submitted.'}`);
    if (modal.open && modalRevision !== null && modalRevision !== view.table.revision && (modalBoardRevision === null || modalBoardRevision !== view.boardRevision)) throw Error('The table changed while this editor was open. Close it and inspect the card again.');
  }
  function attempt(action) { try { error(); action(); } catch (err) { error(err.message); } }
  function add(items) {
    ensureWritable();
    if (!Array.isArray(items)) items = [items];
    if (queue.length + items.length > 28) throw Error('Send these actions first. A play can queue up to 28 actions, leaving room for your message and handoff.');
    if (!queue.length) { baseRevision = view.table.revision; draftBoardRevision = view.boardRevision ?? null; }
    queue.push(...items); draftChanged();
  }
  function draftChanged() { draftVersion++; clearSelection(); q('.hc-drag-status').textContent = ''; saveDraft(); refreshPreview(); renderCards(); renderDraft(); updateButtons(); }
  function clearDraft() { if (sending) return; queue = []; baseRevision = null; draftBoardRevision = null; failedDraft = false; error(); draftChanged(); }
  function removeDraft(index) { if (sending) return; queue.splice(index, 1); if (!queue.length) { baseRevision = null; draftBoardRevision = null; failedDraft = false; } draftChanged(); }
  function followTranscriptAfterLayout() {
    const list = composerRoot.closest('.table-talk')?.querySelector('.recent-moves');
    const following = list && list.scrollHeight - list.clientHeight - list.scrollTop < 32;
    return () => { if (following) list.scrollTop = list.scrollHeight; };
  }
  function renderDraft() {
    const restoreTranscript = followTranscriptAfterLayout();
    const signature = JSON.stringify([queue, baseRevision, view?.table?.revision, sending, preview?.errors]);
    if (signature !== draftSignature) {
      draftSignature = signature;
      const list = q('.hc-queue'); list.replaceChildren();
      for (const [index, item] of queue.entries()) {
        const row = make('li'); row.append(make('span', '', item.label));
        if (preview?.errors?.some(err => err.index === index)) row.classList.add('hc-warning');
        const remove = button('×', () => removeDraft(index), 'quiet hc-remove');
        remove.setAttribute('aria-label', `Remove queued action ${index + 1}: ${item.label}`); remove.disabled = sending;
        row.append(remove); list.append(row);
      }
    }
    q('.hc-pending').hidden = !queue.length;
    q('.hc-clear').disabled = sending;
    q('.hc-undo').disabled = sending || !queue.length;
    q('.hc-draft-state').textContent = isStale() ? 'Table changed — clear and rebuild this play.' : failedDraft ? 'Send unconfirmed — clear and check the table.' : preview?.valid === false ? preview.errors[0]?.message : `${queue.length} pending`;
    q('.hc-draft-state').title = 'Only you see pending changes. Undo or clear them before sending.';
    q('.hc-draft-state').classList.toggle('hc-warning', isStale() || failedDraft || preview?.valid === false);
    restoreTranscript();
  }
  function updateButtons() {
    const restoreTranscript = followTranscriptAfterLayout();
    const can = canCommit(), chat = canChat(), message = !!q('.hc-message').value.trim();
    for (const node of all('[data-hc-act]')) node.disabled = !can;
    q('.hc-send').disabled = !(can && queue.length) && !(chat && message);
    q('.hc-send').textContent = sending ? 'Sending…' : can && queue.length ? 'Send play' : 'Send';
    q('.hc-pass').disabled = !can || !q('.hc-recipient').value;
    q('.hc-turn').disabled = !can || !q('.hc-recipient').value;
    q('.hc-seat').disabled = visible || sending;
    q('.hc-enter').disabled = !connected || sending || !playerId;
    q('.hc-hide').disabled = sending;
    q('.hc-message').disabled = !chat;
    q('.hc-clear').disabled = sending;
    q('.hc-undo').disabled = sending || !queue.length;
    for (const remove of all('.hc-remove')) remove.disabled = sending;
    q('.hc-recipient').disabled = sending;
    const name = playerName(playerId);
    q('.hc-chat-entry').hidden = visible;
    q('.hc-compose').hidden = !visible;
    q('.hc-chat-identity').textContent = name;
    const chatHint = !view ? 'Loading your seat…' : view.table.result ? 'The game has ended.' : !can && queue.length ? 'Chat still sends; pending actions stay here.' : !eligible() ? 'You can chat while another player plays.' : '';
    q('.hc-chat-hint').textContent = chatHint; q('.hc-chat-hint').hidden = !chatHint;
    let status = !connected ? 'Disconnected. Controls are unavailable until the table reconnects.' : !visible ? 'Choose your seat and enter it to reveal private cards. Hide the controls before sharing this screen.' : !view ? 'Loading your private view…' : view.table.result ? 'The game has ended. Complete your post-game questionnaire above.' : !eligible() ? (view.message || `Waiting for control to pass to ${name}. You can still inspect your cards.`) : `Your move, ${name}. Changes are queued until you send them.`;
    if (visible && view && ['paused', 'stopped'].includes(app?.coordinator?.mode) && !view.table.result) status += ' The runner is paused; after your handoff, press Resume to continue AI play.';
    q('.hc-status').textContent = status;
    syncDragTargets();
    notifySeatChange();
    restoreTranscript();
  }
  function notifySeatChange() {
    const shown = visible && !root.hidden;
    const nextSeat = JSON.stringify([playerId, shown]);
    if (nextSeat !== seatSignature) { seatSignature = nextSeat; onSeatChange({ playerId, visible: shown }); }
  }
  function dragContext() {
    return JSON.stringify([matchId, playerId, view?.boardRevision ?? view?.table?.revision, draftVersion, visible, connected, canCommit(), app?.coordinator?.pendingRecipient?.playerId]);
  }
  function sourceCard(source) {
    return Object.values(currentTable()?.zones || {}).flatMap(zone => zone.cards || []).find(card => card.id === source?.cardId);
  }
  function canDrag(source) {
    if (!canCommit()) return false;
    if (source?.drawFrom) return source.drawFrom === `${playerId}:library` && currentTable()?.zones[source.drawFrom]?.count > 0;
    const card = sourceCard(source);
    return !!card && !card.draft && card.editable !== false && !card.preview_unknown;
  }
  function canDrop(source, target) {
    if (!canDrag(source)) return false;
    try { return cardDropActions(currentTable(), playerId, source, target).length > 0; } catch { return false; }
  }
  function clearSelection() {
    selectedSource = null; selectedContext = '';
    q('.hc-selected').hidden = true;
    interactionRoot.classList.remove('hc-card-selected');
    for (const node of interactionRoot.querySelectorAll('.hc-picked-card, .hc-selected-destination')) node.classList.remove('hc-picked-card', 'hc-selected-destination');
  }
  function selectSource(source) {
    ensureWritable();
    if (!canDrag(source)) throw Error('Send the pending play before moving that card.');
    selectedSource = source; selectedContext = dragContext();
    const name = source.drawFrom ? 'Top card of your library' : sourceCard(source)?.name || 'Card';
    q('.hc-selected-text').textContent = `${name} selected · choose a destination to queue the move.`;
    q('.hc-selected').hidden = false;
    syncDragTargets();
    q('.hc-hand-target').focus({ preventScroll: true });
  }
  function queueDrop(source, target) {
    ensureWritable();
    if (!canDrag(source)) throw Error('The card or your control of the table changed. Try the move again.');
    const actions = cardDropActions(currentTable(), playerId, source, target);
    if (!actions.length) { clearSelection(); return; }
    add(actions);
    q('.hc-drag-status').textContent = `${actions[0].label}. Queued — not sent.`;
  }
  function targetFor(node) {
    return { zoneId: node.dataset.hcDropZone, position: node.dataset.hcDropPosition || (node.dataset.hcDropZone === 'stack' ? 'top' : 'bottom'), ...(node.dataset.hcDropController ? { controller: node.dataset.hcDropController } : {}) };
  }
  function syncDragTargets() {
    const ready = canCommit();
    interactionRoot.classList.toggle('hc-can-drag', ready);
    if (selectedSource && (selectedContext !== dragContext() || !canDrag(selectedSource))) clearSelection();
    interactionRoot.classList.toggle('hc-card-selected', !!selectedSource);
    for (const node of interactionRoot.querySelectorAll('[data-hc-card], [data-hc-draw-from]')) {
      node.draggable = false;
      const source = node.dataset.hcCard ? { cardId: node.dataset.hcCard } : { drawFrom: node.dataset.hcDrawFrom };
      node.classList.toggle('hc-draggable', canDrag(source));
      node.classList.toggle('hc-picked-card', !!selectedSource && (source.cardId ? source.cardId === selectedSource.cardId : source.drawFrom === selectedSource.drawFrom));
      for (const image of node.querySelectorAll('img')) image.draggable = false;
    }
    for (const node of interactionRoot.querySelectorAll('[data-hc-drop-zone]')) node.classList.toggle('hc-selected-destination', !!selectedSource && canDrop(selectedSource, targetFor(node)));
    dragController?.sync();
  }
  function decorateTarget(node, zoneId, position = 'bottom', controller) {
    node.dataset.hcDropZone = zoneId; node.dataset.hcDropPosition = position;
    if (controller) node.dataset.hcDropController = controller;
    node.dataset.hcDropLabel = zoneId === 'battlefield' ? 'Your battlefield' : zoneName(zoneId) + (zoneId.endsWith(':library') ? ` · ${position}` : '');
  }
  function cardNode(card, compact = false) {
    const node = button('', () => void openCard(card)); node.className = 'hc-card' + (compact ? ' hc-mini-card' : '');
    node.dataset.hcCard = card.id; node.dataset.hcDragLabel = card.name || 'Face-down card';
    if (card.draft || card.editable === false || card.preview_unknown) { node.classList.add('hc-card-pending'); node.disabled = true; node.title = 'Send this play to inspect or edit the card.'; }
    else node.title = `${card.name || 'Card'} · drag to move, click for details, Space to choose a destination`;
    node.setAttribute('aria-label', `Inspect ${card.name}${card.tapped ? ', tapped' : ''}`);
    if (card.image_url) { const img = make('img'); img.src = card.image_url; img.alt = ''; img.loading = 'lazy'; img.draggable = false; node.append(img); }
    else node.append(make('div', 'hc-card-fallback', card.name || 'Face-down card'));
    node.append(make('span', 'hc-card-name', card.name || 'Face-down card'));
    const markers = [card.draft ? 'Pending · send to use' : '', card.tapped ? 'Tapped' : '', card.damage ? `${card.damage} damage` : '', ...Object.entries(card.counters || {}).map(([k, v]) => `${v} ${k}`)].filter(Boolean);
    if (markers.length && !compact) node.append(make('span', 'hc-card-markers', markers.join(' · ')));
    return node;
  }
  function renderDock(table) {
    const zoneIds = ['battlefield', 'stack', ...['library', 'graveyard', 'exile', 'command', 'sideboard'].map(kind => `${playerId}:${kind}`)].filter(id => table.zones[id]);
    const signature = JSON.stringify([playerId, zoneIds.map(id => table.zones[id])]);
    if (signature === dockSignature) return;
    dockSignature = signature;
    const dock = q('.hc-zone-dock'); dock.replaceChildren();
    for (const id of zoneIds) {
      const zone = table.zones[id], kind = id.split(':').at(-1);
      const tile = make('section', 'hc-zone-tile hc-zone-' + kind);
      const name = id === 'battlefield' ? 'Your battlefield' : id === 'stack' ? 'Stack' : kind[0].toUpperCase() + kind.slice(1);
      const target = button('', () => destinationClick(target), 'hc-destination hc-zone-title');
      target.append(make('strong', '', name), make('span', 'hc-zone-total', id === 'battlefield' ? zone.cards.filter(card => card.controller === playerId).length : zone.count));
      decorateTarget(target, id, id === 'stack' || kind === 'library' ? 'top' : 'bottom', id === 'battlefield' ? playerId : null);
      target.setAttribute('aria-label', `Destination: ${name}${kind === 'library' ? ' top' : ''}`);
      if (kind !== 'library') decorateTarget(tile, id, id === 'stack' ? 'top' : 'bottom', id === 'battlefield' ? playerId : null);
      tile.append(target);
      if (kind === 'library') {
        const pile = button('✦', () => attempt(() => selectSource({ drawFrom: id })), 'hc-library-pile');
        pile.dataset.hcDrawFrom = id; pile.dataset.hcDragLabel = 'Top card of your library';
        pile.title = 'Drag to your hand to queue a draw'; pile.setAttribute('aria-label', 'Library top card · drag to hand to draw');
        const destinations = make('div', 'hc-library-ends');
        for (const [position, label] of [['top', 'Top'], ['bottom', 'Bottom']]) {
          const end = button(label, () => destinationClick(end), 'hc-destination'); decorateTarget(end, id, position); end.setAttribute('aria-label', `Destination: Library ${position}`); destinations.append(end);
        }
        tile.append(pile, destinations);
      } else if (['graveyard', 'exile', 'command', 'sideboard'].includes(kind)) {
        const cards = make('div', 'hc-zone-preview');
        for (const card of zone.cards.slice(-3)) cards.append(cardNode(card, true));
        if (!zone.cards.length) cards.append(make('span', 'hc-zone-empty', zone.count ? 'Concealed' : 'Drop here'));
        tile.append(cards);
      } else tile.append(make('span', 'hc-zone-empty', id === 'stack' ? 'Spells & abilities · top' : 'Permanents & lands'));
      dock.append(tile);
    }
  }
  function destinationClick(node) {
    if (selectedSource) {
      const source = selectedSource;
      attempt(() => { if (selectedContext !== dragContext()) throw Error('The table changed. Select the card again.'); queueDrop(source, targetFor(node)); });
    } else {
      const id = node.dataset.hcDropZone;
      q('.hc-zone').value = id; q('.hc-zone-browser').open = true; cardSignature = ''; renderCards();
    }
  }
  function renderCards() {
    if (!view || !visible || dragController?.pending) return;
    const table = currentTable();
    const hand = table.zones[`${playerId}:hand`];
    if (hand) {
      decorateTarget(q('.hc-hand-section'), hand.id); decorateTarget(q('.hc-hand-target'), hand.id);
      q('.hc-hand-target').setAttribute('aria-label', 'Destination: Your hand');
      const signature = JSON.stringify([playerId, hand]);
      if (signature !== handSignature) {
        handSignature = signature;
        q('.hc-hand-count').textContent = `${hand.count} card${hand.count === 1 ? '' : 's'} · private`;
        q('.hc-hand').replaceChildren(...hand.cards.map(card => cardNode(card)));
        if (!hand.cards.length) q('.hc-hand').append(make('p', 'hc-empty', 'Your hand is empty. Drag from your library to draw.'));
      }
    }
    renderDock(table);
    const zones = Object.values(table.zones);
    const options = zones.map(z => [z.id, `${zoneName(z.id)} (${z.count})`]);
    const sig = JSON.stringify(options);
    if (q('.hc-zone').dataset.choices !== sig) {
      const current = q('.hc-zone').value || `${playerId}:hand`;
      q('.hc-zone').replaceChildren(...select(options, current).childNodes); q('.hc-zone').value = options.some(([id]) => id === current) ? current : `${playerId}:hand`;
      q('.hc-zone').dataset.choices = sig;
    }
    const zone = table.zones[q('.hc-zone').value];
    if (zone) {
      const next = JSON.stringify([zone, playerId]);
      if (next !== cardSignature) {
        cardSignature = next;
        q('.hc-zone-count').textContent = `${zone.count} card${zone.count === 1 ? '' : 's'}${zone.hidden_count ? ` · ${zone.hidden_count} concealed` : ''}`;
        const cards = q('.hc-browse-cards'); cards.replaceChildren(...zone.cards.map(card => cardNode(card)));
        if (!zone.cards.length) cards.append(make('p', 'hc-empty', zone.count ? 'These cards are concealed. Use a permitted look or draw action.' : 'This zone is empty.'));
      }
    }
    const recipient = q('.hc-recipient'); const existing = recipient.value || savedRecipient;
    const recipients = players().map(p => [p.id, p.name + (p.id === playerId ? ' (you)' : '')]);
    const recipientSig = JSON.stringify(recipients);
    if (recipient.dataset.choices !== recipientSig) {
      recipient.replaceChildren(...select(recipients).childNodes);
      recipient.value = recipients.some(([id]) => id === existing) ? existing : players()[(players().findIndex(p => p.id === playerId) + 1) % players().length]?.id || playerId;
      recipient.dataset.choices = recipientSig;
    }
    syncDragTargets();
  }
  async function loadView(force = false) {
    if (!visible || !connected || fetching || !playerId || !matchId) return;
    fetching = true; const serial = generation; const match = matchId; const seat = playerId;
    try {
      const result = await request(`/api/human?${new URLSearchParams({ matchId: match, playerId: seat })}`);
      if (serial !== generation || !visible || result.matchId !== match || result.playerId !== seat) return;
      acceptView(result); refreshPreview(); renderCards(); renderDraft(); updateButtons();
    } catch (err) { if (serial === generation) { view = null; refreshPreview(); error(err.message); updateButtons(); } }
    finally { fetching = false; }
  }
  async function send(terminal = null) {
    const serial = generation, requestMatch = matchId, requestPlayer = playerId;
    let attemptedActions = false;
    try {
      error();
      const message = q('.hc-message').value.trim();
      const commit = !!terminal || (queue.length > 0 && canCommit());
      let path, body;
      if (commit) {
        ensureWritable();
        const actions = queue.map(item => item.op);
        if (terminal && ['pass', 'pass_turn'].includes(terminal.type)) { if (message) terminal = { ...terminal, message }; actions.push(terminal); }
        else { if (message) actions.push({ type: 'say', text: message }); if (terminal) actions.push(terminal); }
        if (!actions.length) return;
        if (actions.length > 30) throw Error('Send fewer than 31 actions at once.');
        const revision = queue.length ? baseRevision : view.table.revision;
        path = '/api/human/act'; body = { matchId: requestMatch, playerId: requestPlayer, revision, actions };
      } else {
        if (!message) return;
        if (!canChat()) throw Error('Enter your human seat and reconnect to send a message.');
        path = '/api/human/chat'; body = { matchId: requestMatch, playerId: requestPlayer, text: message };
      }
      sending = true; updateButtons();
      attemptedActions = commit;
      const result = await request(path, body);
      if (serial !== generation || matchId !== requestMatch || playerId !== requestPlayer) return;
      if (commit) { queue = []; baseRevision = null; draftBoardRevision = null; failedDraft = false; q('.hc-drag-status').textContent = ''; }
      q('.hc-message').value = ''; saveDraft();
      acceptView(result);
      if (commit && modal.open) modal.close();
      refreshPreview(); cardSignature = ''; renderCards(); renderDraft();
      await onChange();
    } catch (err) {
      if (serial === generation && matchId === requestMatch && playerId === requestPlayer) {
        if (attemptedActions && queue.length) { failedDraft = true; saveDraft(); }
        refreshPreview(); renderCards(); renderDraft();
        error(`${err.message} Your draft has been kept; it was not automatically retried.`);
      }
    } finally { sending = false; updateButtons(); void loadView(true); }
  }
  function openModal(title) {
    modal.replaceChildren(); modalRevision = view?.table?.revision ?? null; modalBoardRevision = view?.boardRevision ?? null;
    const head = make('div', 'hc-modal-head'); head.append(make('h2', '', title), button('Close ×', () => modal.close(), 'quiet'));
    const body = make('div', 'hc-modal-body'); const alert = make('p', 'hc-error hc-modal-error'); alert.setAttribute('role', 'alert'); alert.hidden = true; body.append(alert); modal.append(head, body); modal.showModal(); return body;
  }
  function actionButton(text, action, primary = false) {
    const node = button(text, () => attempt(() => { action(); }), primary ? 'primary' : ''); node.dataset.hcAct = ''; node.disabled = !eligible() || isStale(); return node;
  }
  function guardedForm(body, submitText, action) {
    const form = make('form', 'hc-form'); body.append(form);
    const submit = make('button', 'primary', submitText); submit.type = 'submit'; submit.dataset.hcAct = '';
    form.addEventListener('submit', e => { e.preventDefault(); attempt(() => { ensureWritable(); action(); modal.close(); }); });
    return { form, submit };
  }
  async function openCard(card) {
    if (!visible || !view) return;
    card = Object.values(currentTable().zones).flatMap(zone => zone.cards).find(item => item.id === card.id);
    if (!card) return;
    if (card.draft || card.editable === false) { error('Send this play before inspecting or editing its pending cards.'); return; }
    const body = openModal(card.name || 'Face-down card');
    const intro = make('div', 'hc-card-info');
    if (card.image_url) { const art = make('img', 'hc-modal-art'); art.src = card.image_url; art.alt = card.name; intro.append(art); }
    const details = make('div'); details.append(make('p', 'hc-help', card.type_line || 'Concealed card'), make('p', 'hc-oracle', 'Loading card text…')); intro.append(details); body.append(intro);
    const actions = make('div', 'hc-tools');
    actions.append(actionButton(card.tapped ? 'Queue untap' : 'Queue tap', () => { add({ op: { type: 'card', card: card.id, set: { tapped: !card.tapped } }, label: `${card.tapped ? 'Untap' : 'Tap'} ${card.name}` }); modal.close(); }), actionButton('Reveal to all players', () => { add({ op: { type: 'reveal', card: card.id }, label: `Reveal ${card.name} to all players` }); modal.close(); }));
    actions.append(actionButton('Choose destination on table', () => { modal.close(); selectSource({ cardId: card.id }); root.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }));
    body.append(actions);
    const moveSection = make('section', 'hc-editor-section'); moveSection.append(make('h3', '', 'Move card'));
    const destination = select(Object.keys(currentTable().zones).map(id => [id, zoneName(id)]), 'battlefield');
    const position = select([['bottom', 'Bottom'], ['top', 'Top']], 'bottom');
    destination.addEventListener('change', () => { position.value = destination.value === 'stack' ? 'top' : 'bottom'; });
    moveSection.append(label('Destination', destination), label('Position (library or stack)', position), actionButton('Queue move', () => { add({ op: { type: 'move', card: card.id, to: destination.value, position: position.value }, label: `Move ${card.name} to ${zoneName(destination.value)} · ${position.value}` }); modal.close(); }), make('p', 'hc-help', 'Moving keeps existing markers. Clear damage, counters, or tapped state explicitly when needed.'));
    body.append(moveSection);
    const edit = make('details', 'hc-editor-section'); edit.append(make('summary', '', 'Edit card markers, control & attachment'));
    const damage = input(card.damage || 0, 'number'); damage.min = '0';
    const count = make('textarea'); count.value = counterText(card.counters); count.placeholder = '+1/+1: 2';
    const note = make('textarea'); note.value = card.note || ''; note.maxLength = 2000;
    const controller = select(players().map(p => [p.id, p.name]), card.controller);
    const targets = Object.values(currentTable().zones).flatMap(z => z.cards).filter(c => c.id !== card.id && !c.draft && c.editable !== false);
    const attached = select([['', 'None'], ...targets.map(c => [c.id, `${c.name} · ${playerName(c.controller)}`])], card.attached_to || '');
    const tapped = input('', 'checkbox'); tapped.checked = !!card.tapped; const facedown = input('', 'checkbox'); facedown.checked = !!card.face_down;
    edit.append(label('Damage marked', damage), label('Counters · one name: count per line', count), label('Controller', controller), label('Attached to', attached), label('Tapped', tapped), label('Face down', facedown), label('Card note', note), actionButton('Queue marker changes', () => {
      const set = { damage: number(damage, 0), counters: readCounters(count), controller: controller.value, attached_to: attached.value || null, tapped: tapped.checked, face_down: facedown.checked, note: note.value };
      add({ op: { type: 'card', card: card.id, set }, label: `Update markers on ${card.name}` }); modal.close();
    }));
    body.append(edit);
    if (card.token || card.kind === 'ability') body.append(actionButton(card.token ? 'Remove token from table' : 'Remove stack ability', () => { add({ op: { type: card.token ? 'remove_token' : 'remove_stack_item', card: card.id }, label: `Remove ${card.name}` }); modal.close(); }));
    updateButtons();
    const serial = generation;
    try {
      const data = await request(`/api/human/card?${new URLSearchParams({ matchId, playerId, id: card.id })}`);
      if (serial !== generation || !modal.open || !body.isConnected) return;
      details.querySelector('.hc-oracle').textContent = data.oracle_text || (card.name === 'Face-down card' ? 'This identity is concealed.' : 'No rules text.');
      if (data.rulings?.length) { const rulings = make('details'); rulings.append(make('summary', '', 'Official card rulings')); for (const ruling of data.rulings) rulings.append(make('p', '', `${ruling.published_at}: ${ruling.comment}`)); details.append(rulings); }
    } catch (err) { if (body.isConnected) details.querySelector('.hc-oracle').textContent = err.message; }
  }
  function lifeEditor() {
    const body = openModal('Life & player counters'); const { form, submit } = guardedForm(body, 'Queue player changes', () => {
      add({ op: { type: 'player', player: who.value, set: { life: number(life), counters: readCounters(counters), mana: readCounters(mana) } }, label: `Set ${playerName(who.value)} to ${life.value} life and update counters / mana` });
    });
    const who = select(players().map(p => [p.id, p.name]), playerId); const life = input('', 'number'); const counters = make('textarea'); counters.placeholder = 'poison: 1'; const mana = make('textarea'); mana.placeholder = 'G: 2\nC: 1';
    const fill = () => { const p = players().find(p => p.id === who.value); life.value = p.life; counters.value = counterText(p.counters); mana.value = counterText(p.mana); }; fill(); who.addEventListener('change', fill);
    form.append(label('Player', who), label('Life total', life), label('Counters · one name: count per line', counters), label('Mana pool · one color: amount per line', mana), make('p', 'hc-help', 'Track floating mana explicitly. Card costs and mana clearing remain the players’ responsibility.'), submit); updateButtons();
  }
  function markerEditor() {
    const body = openModal('Turn & phase markers'); const { form, submit } = guardedForm(body, 'Queue marker changes', () => add({ op: { type: 'turn', set: { number: number(turn, 1), phase: phase.value, active: active.value } }, label: `Turn ${turn.value} · ${playerName(active.value)} · ${phase.value}` }));
    const stagedTurn = currentTable().turn;
    const turn = input(stagedTurn.number, 'number'); const phase = input(stagedTurn.phase); phase.maxLength = 100; const active = select(players().map(p => [p.id, p.name]), stagedTurn.active);
    form.append(make('p', 'hc-help', 'These are display markers. Use Pass priority or Pass turn to actually notify another player.'), label('Turn number', turn), label('Active player', active), label('Phase or step', phase), submit); updateButtons();
  }
  function peekEditor() {
    const body = openModal('Look at concealed cards'); const { form, submit } = guardedForm(body, 'Queue look', () => add({ op: { type: 'peek', zone: zone.value, count: number(count, 1, 100) }, label: `Look at top ${count.value} of ${zoneName(zone.value)}` }));
    const zone = select(Object.keys(view.table.zones).map(id => [id, zoneName(id)]), playerId + ':library'); const count = input(1, 'number');
    form.append(make('p', 'hc-help', 'Only use this when a rule or card allows it. The cards will be available in your private view after you send the queued action.'), label('Zone to look at', zone), label('Number of cards', count), submit); updateButtons();
  }
  function createObject(ability) {
    const body = openModal(ability ? 'Add an ability to the stack' : 'Create a token');
    const { form, submit } = guardedForm(body, ability ? 'Queue ability' : 'Queue token', () => {
      if (!name.value.trim()) throw Error('Enter a name.');
      const definition = { name: name.value.trim(), type_line: type.value, oracle_text: rules.value, ...(power.value ? { power: power.value } : {}), ...(toughness.value ? { toughness: toughness.value } : {}) };
      add({ op: ability ? { type: 'stack_item', definition } : { type: 'token', definition, count: number(count, 1, 100), owner: owner.value }, label: ability ? `Add ${name.value} to the stack` : `Create ${count.value} ${name.value} for ${playerName(owner.value)}` });
    });
    const name = input(); name.maxLength = 200; const type = input(ability ? 'Ability' : 'Token Creature'); const rules = make('textarea'); rules.maxLength = 12000;
    const power = input(); const toughness = input(); const count = input(1, 'number'); const owner = select(players().map(p => [p.id, p.name]), playerId);
    form.append(label('Name', name), label('Type line', type), label('Rules text', rules));
    if (!ability) form.append(label('Power', power), label('Toughness', toughness), label('Count', count), label('Owner', owner));
    form.append(submit); updateButtons();
  }
  function outcomeEditor() {
    const body = openModal('Player status & game outcome');
    body.append(make('p', 'hc-help', 'Conceding marks your seat and does not automatically end a multiplayer game. Hand control to a remaining player afterward.'));
    body.append(actionButton('Queue my concession', () => { add({ op: { type: 'player', player: playerId, set: { status: 'conceded' } }, label: `${playerName(playerId)} concedes` }); modal.close(); }));
    const form = make('form', 'hc-form hc-editor-section'); form.append(make('h3', '', 'Declare the game finished'), make('p', 'hc-help', 'Select every winner, or leave all unchecked for a draw. This sends your queued actions and message, ends gameplay, and starts the player questionnaire.'));
    const winners = players().map(p => { const checkbox = input('', 'checkbox'); checkbox.value = p.id; form.append(label(p.name + ' won', checkbox)); return checkbox; });
    const explanation = make('textarea'); explanation.maxLength = 2000; form.append(label('Result explanation', explanation));
    const confirmed = input('', 'checkbox'); confirmed.required = true; form.append(label('The result is agreed and the game is over', confirmed));
    const submit = make('button', 'primary', 'Declare outcome & begin feedback'); submit.type = 'submit'; submit.dataset.hcAct = ''; form.append(submit);
    form.addEventListener('submit', e => { e.preventDefault(); if (confirmed.checked) void send({ type: 'result', winners: winners.filter(c => c.checked).map(c => c.value), explanation: explanation.value.trim() }); });
    body.append(form); updateButtons();
  }
  dragController = createCardDragController({
    root: interactionRoot, canStart: canDrag, canDrop, getContext: dragContext,
    onDrop: (source, target) => {
      try { error(); queueDrop(source, target); return true; }
      catch (err) { error(err.message); q('.hc-drag-status').textContent = err.message; return false; }
    },
    onStatus: message => { q('.hc-drag-status').textContent = typeof message === 'string' ? message : ''; },
  });
  interactionRoot.addEventListener('keydown', event => {
    if (event.key === 'Escape' && selectedSource) { event.preventDefault(); clearSelection(); }
    if (event.key !== ' ' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || modal.open) return;
    const source = event.target.closest?.('[data-hc-card], [data-hc-draw-from]');
    if (!source || !interactionRoot.contains(source)) return;
    event.preventDefault(); event.stopPropagation();
    attempt(() => selectSource(source.dataset.hcCard ? { cardId: source.dataset.hcCard } : { drawFrom: source.dataset.hcDrawFrom }));
  }, true);
  q('.hc-cancel-selection').addEventListener('click', clearSelection);
  q('.hc-hand-target').addEventListener('click', () => destinationClick(q('.hc-hand-target')));
  q('.hc-enter').addEventListener('click', () => { visible = true; generation++; cardSignature = ''; q('.hc-private').hidden = false; q('.hc-enter').hidden = true; q('.hc-hide').hidden = false; refreshPreview(); renderDraft(); updateButtons(); void loadView(true); });
  q('.hc-chat-enter').addEventListener('click', () => { root.scrollIntoView({ behavior: 'smooth', block: 'center' }); q('.hc-enter').focus({ preventScroll: true }); });
  q('.hc-hide').addEventListener('click', () => {
    dragController.cancel(); clearSelection(); saveDraft(); visible = false; generation++; view = null; cardSignature = ''; handSignature = ''; dockSignature = ''; if (modal.open) modal.close(); modal.replaceChildren(); q('.hc-hand').replaceChildren(); q('.hc-browse-cards').replaceChildren(); q('.hc-zone-dock').replaceChildren(); q('.hc-private').hidden = true; q('.hc-enter').hidden = false; q('.hc-hide').hidden = true; refreshPreview(); error(); updateButtons();
  });
  q('.hc-seat').addEventListener('change', () => { dragController.cancel(); clearSelection(); handSignature = ''; dockSignature = ''; saveDraft(); playerId = q('.hc-seat').value; generation++; view = null; q('.hc-zone').value = playerId + ':hand'; q('.hc-zone').dataset.choices = ''; cardSignature = ''; savedRecipient = ''; q('.hc-recipient').replaceChildren(); q('.hc-recipient').dataset.choices = ''; choicesSignature = ''; stateSignature = ''; restoreDraft(); refreshPreview(); try { sessionStorage.setItem(`game-night-human-seat:${matchId}`, playerId); } catch {} renderDraft(); updateButtons(); });
  q('.hc-zone').addEventListener('change', () => { cardSignature = ''; renderCards(); });
  q('.hc-message').addEventListener('input', () => { saveDraft(); updateButtons(); });
  q('.hc-message').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); if (!q('.hc-send').disabled) void send(); } });
  q('.hc-recipient').addEventListener('change', () => { saveDraft(); updateButtons(); });
  q('.hc-clear').addEventListener('click', clearDraft);
  q('.hc-undo').addEventListener('click', () => { if (queue.length) removeDraft(queue.length - 1); });
  q('.hc-draw').addEventListener('click', () => attempt(() => { const count = number(q('.hc-draw-count'), 1, 100); add({ op: { type: 'draw', count }, label: `Draw ${count} card${count === 1 ? '' : 's'}` }); }));
  q('.hc-shuffle').addEventListener('click', () => attempt(() => add({ op: { type: 'shuffle' }, label: 'Shuffle your library' })));
  q('.hc-return').addEventListener('click', () => attempt(() => {
    const cards = currentTable().zones[playerId + ':hand'].cards;
    if (!cards.length) throw Error('Your hand is empty.');
    if (cards.some(card => card.draft || card.editable === false)) throw Error('Send your pending draw before returning the newly drawn cards.');
    add(cards.map(c => ({ op: { type: 'move', card: c.id, to: playerId + ':library', position: 'bottom' }, label: `Return ${c.name} to your library` })));
  }));
  q('.hc-untap').addEventListener('click', () => attempt(() => {
    const cards = currentTable().zones.battlefield.cards.filter(c => c.controller === playerId && c.tapped);
    if (!cards.length) throw Error('You have no tapped battlefield cards.');
    if (cards.some(card => card.draft || card.editable === false)) throw Error('Send your pending play before changing its new cards.');
    add(cards.map(c => ({ op: { type: 'card', card: c.id, set: { tapped: false } }, label: `Untap ${c.name}` })));
  }));
  q('.hc-send').addEventListener('click', () => void send());
  q('.hc-pass').addEventListener('click', () => void send({ type: 'pass', next: q('.hc-recipient').value }));
  q('.hc-turn').addEventListener('click', () => void send({ type: 'pass_turn', next: q('.hc-recipient').value }));
  for (const [selector, action] of [['.hc-life', lifeEditor], ['.hc-markers', markerEditor], ['.hc-peek', peekEditor], ['.hc-token', () => createObject(false)], ['.hc-ability', () => createObject(true)], ['.hc-outcome', outcomeEditor]]) q(selector).addEventListener('click', () => attempt(() => { ensureWritable(); action(); }));
  function update(next) {
    app = next.app; publicTable = next.table; connected = next.connected;
    const humans = app?.match?.players?.filter(p => p.ai === false) || [];
    root.hidden = !humans.length || !app?.match;
    composerRoot.hidden = root.hidden;
    if (root.hidden) { dragController.cancel(); clearSelection(); if (visible) saveDraft(); if (modal.open) modal.close(); visible = false; view = null; cardSignature = ''; handSignature = ''; dockSignature = ''; q('.hc-drag-status').textContent = ''; q('.hc-private').hidden = true; q('.hc-hand').replaceChildren(); q('.hc-browse-cards').replaceChildren(); q('.hc-zone-dock').replaceChildren(); q('.hc-enter').hidden = false; q('.hc-hide').hidden = true; refreshPreview(); syncDragTargets(); notifySeatChange(); return; }
    if (matchId !== app.match.id) {
      dragController.cancel(); clearSelection(); handSignature = ''; dockSignature = ''; saveDraft(); matchId = app.match.id; visible = false; generation++; view = null; playerId = ''; queue = []; baseRevision = null; draftBoardRevision = null; failedDraft = false; choicesSignature = ''; stateSignature = ''; cardSignature = '';
      try { playerId = sessionStorage.getItem(`game-night-human-seat:${matchId}`) || ''; } catch {}
      if (!humans.some(p => p.id === playerId)) playerId = humans[0].id;
      if (modal.open) modal.close(); modal.replaceChildren(); q('.hc-private').hidden = true; q('.hc-enter').hidden = false; q('.hc-hide').hidden = true; q('.hc-zone').replaceChildren(); q('.hc-zone').dataset.choices = ''; q('.hc-recipient').replaceChildren(); q('.hc-recipient').dataset.choices = ''; savedRecipient = ''; restoreDraft(); error();
    }
    const choices = JSON.stringify(humans.map(p => [p.id, p.name]));
    if (choices !== choicesSignature) { choicesSignature = choices; q('.hc-seat').replaceChildren(...select(humans.map(p => [p.id, p.name]), playerId).childNodes); q('.hc-seat').value = playerId; }
    refreshPreview(); renderDraft(); updateButtons();
    const newState = JSON.stringify([publicTable?.revision, app.coordinator?.mode, app.coordinator?.pendingRecipient, app.coordinator?.active, app.postgame?.status]);
    if (visible) { stateSignature = newState; void loadView(); }
  }
  return { update, syncDragTargets, hide: () => q('.hc-hide').click(), inspectCard(card) {
    if (!visible || !view) return false;
    const visibleCard = Object.values(currentTable().zones).flatMap(zone => zone.cards).find(item => item.id === (typeof card === 'string' ? card : card.id));
    if (!visibleCard) return false;
    void openCard(visibleCard); return true;
  } };
}
