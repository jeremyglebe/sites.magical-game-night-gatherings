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

export function createHumanControls({ root, request, onChange = () => {} }) {
  root.classList.add('human-controls');
  root.setAttribute('aria-label', 'Human player controls');
  root.innerHTML = `<div class="hc-header"><div><div class="eyebrow">YOUR SEAT AT THE TABLE</div><h2>Human player</h2></div><div class="hc-seat-picker"><label>Play as <select class="hc-seat"></select></label><button type="button" class="hc-enter primary">Enter seat · show hand</button><button type="button" class="hc-hide quiet" hidden>Hide private controls</button></div></div>
    <p class="hc-status" role="status"></p><p class="hc-error" role="alert" hidden></p>
    <div class="hc-private" hidden>
      <p class="hc-help">Your hand is private to this seat. Make table changes, explain your play, then explicitly pass priority or the turn. These controls do not enforce Magic rules.</p>
      <div class="hc-main"><section class="hc-cards-section"><div class="hc-zone-head"><label>Cards <select class="hc-zone"></select></label><span class="hc-zone-count"></span></div><div class="hc-cards"></div>
      <div class="hc-tools"><label>Draw <input class="hc-draw-count" type="number" min="1" max="100" value="1" aria-label="Cards to draw"></label><button type="button" class="hc-draw" data-hc-act>Queue draw</button><button type="button" class="hc-shuffle" data-hc-act>Shuffle library</button><button type="button" class="hc-return" data-hc-act>Return entire hand</button><button type="button" class="hc-untap" data-hc-act>Untap my board</button><button type="button" class="hc-life" data-hc-act>Life & counters</button></div></section>
      <section class="hc-compose"><h3>Your next play</h3><p class="hc-draft-state"></p><ol class="hc-queue"></ol><button type="button" class="hc-clear quiet">Discard queued actions</button><label class="hc-field">Say to the table<textarea class="hc-message" maxlength="2000" placeholder="Explain your actions, ask for a response, or agree to a shortcut."></textarea></label><div class="hc-send-row"><button type="button" class="hc-send primary" data-hc-act>Send actions & message</button></div><div class="hc-handoff"><label>Hand off to<select class="hc-recipient"></select></label><div class="hc-send-row"><button type="button" class="hc-pass" data-hc-act>Pass priority</button><button type="button" class="hc-turn" data-hc-act>Pass turn</button></div><p class="hc-help">Pass turn advances the turn marker to the named player. Passing priority leaves the active turn unchanged.</p></div></section></div>
      <details class="hc-more"><summary>More table controls</summary><div class="hc-tools"><button type="button" class="hc-markers" data-hc-act>Turn & phase markers</button><button type="button" class="hc-peek" data-hc-act>Look at library cards</button><button type="button" class="hc-token" data-hc-act>Create a token</button><button type="button" class="hc-ability" data-hc-act>Add a stack ability</button><button type="button" class="hc-outcome" data-hc-act>Concede or declare outcome</button></div><p class="hc-help">Use these physical table controls only when the rules or an agreed correction allow it. Moving a card does not clear its markers automatically.</p></details>
    </div>`;
  const q = selector => root.querySelector(selector);
  const modal = make('dialog', 'hc-dialog');
  modal.setAttribute('aria-label', 'Human table action');
  root.append(modal);
  let app = null, publicTable = null, connected = false, matchId = '', playerId = '', visible = false;
  let view = null, queue = [], baseRevision = null, sending = false, fetching = false, generation = 0, cardSignature = '', choicesSignature = '', stateSignature = '', modalRevision = null, savedRecipient = '', draftSignature = '';
  const draftKey = () => `game-night-human-draft:${matchId}:${playerId}`;
  function saveDraft() {
    if (!matchId || !playerId) return;
    try { sessionStorage.setItem(draftKey(), JSON.stringify({ queue, baseRevision, message: q('.hc-message').value, recipient: q('.hc-recipient').value })); } catch {}
  }
  function restoreDraft() {
    queue = []; baseRevision = null; q('.hc-message').value = '';
    try {
      const data = JSON.parse(sessionStorage.getItem(draftKey()) || 'null');
      if (data && Array.isArray(data.queue) && data.queue.length <= 30 && data.queue.every(item => item && typeof item.label === 'string' && item.op && typeof item.op.type === 'string')) {
        queue = data.queue; baseRevision = data.baseRevision; q('.hc-message').value = String(data.message || '').slice(0, 2000);
        savedRecipient = data.recipient || ''; q('.hc-recipient').value = savedRecipient;
      }
    } catch {}
  }
  function error(message = '') { q('.hc-error').textContent = message; q('.hc-error').hidden = !message; const local = modal.querySelector('.hc-modal-error'); if (local) { local.textContent = message; local.hidden = !message; } }
  function players() { return view?.table?.players || publicTable?.players || []; }
  function playerName(id) { return players().find(p => p.id === id)?.name || id; }
  function zoneName(id) {
    if (id === 'battlefield') return 'Battlefield'; if (id === 'stack') return 'Stack';
    const zone = view?.table?.zones?.[id]; const suffix = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
    return `${zone?.owner === playerId ? 'Your' : zone?.owner ? playerName(zone.owner) + ' ·' : ''} ${suffix}`.trim();
  }
  function isStale() { return queue.length > 0 && baseRevision !== view?.table?.revision; }
  function eligible() {
    const run = app?.coordinator;
    return connected && visible && view?.table?.revision === publicTable?.revision && !!view?.canAct && !view?.table?.result && !app?.postgame && run?.pendingRecipient?.playerId === playerId && !(run?.players || []).some(p => p.active) && !sending;
  }
  function ensureWritable() {
    if (!eligible()) throw Error(view?.message || 'Wait until control is handed to this seat.');
    if (isStale()) throw Error('The table changed after these actions were queued. Discard them and rebuild your play from the current state.');
    if (modal.open && modalRevision !== null && modalRevision !== view.table.revision) throw Error('The table changed while this editor was open. Close it and inspect the card again.');
  }
  function attempt(action) { try { error(); action(); } catch (err) { error(err.message); } }
  function add(items) {
    ensureWritable();
    if (!Array.isArray(items)) items = [items];
    if (queue.length + items.length > 28) throw Error('Send these actions first. A play can queue up to 28 actions, leaving room for your message and handoff.');
    if (!queue.length) baseRevision = view.table.revision;
    queue.push(...items); saveDraft(); renderDraft(); updateButtons();
  }
  function clearDraft() { if (sending) return; queue = []; baseRevision = null; saveDraft(); renderDraft(); updateButtons(); }
  function renderDraft() {
    const signature = JSON.stringify([queue, baseRevision, view?.table?.revision, sending]);
    if (signature !== draftSignature) {
      draftSignature = signature;
      const list = q('.hc-queue'); list.replaceChildren();
      for (const [index, item] of queue.entries()) {
        const row = make('li'); row.append(make('span', '', item.label));
        const remove = button('×', () => { if (sending) return; queue.splice(index, 1); if (!queue.length) baseRevision = null; saveDraft(); renderDraft(); updateButtons(); }, 'quiet hc-remove');
        remove.setAttribute('aria-label', `Remove queued action ${index + 1}: ${item.label}`); remove.disabled = sending;
        row.append(remove); list.append(row);
      }
    }
    q('.hc-clear').hidden = !queue.length;
    q('.hc-clear').disabled = sending;
    q('.hc-draft-state').textContent = isStale() ? 'Table changed — discard and rebuild these queued actions.' : queue.length ? `${queue.length} queued · not yet sent to the table` : 'No queued actions. Select cards or use the controls to build a play.';
    q('.hc-draft-state').classList.toggle('hc-warning', isStale());
  }
  function updateButtons() {
    const can = eligible() && !isStale();
    for (const node of root.querySelectorAll('[data-hc-act]')) node.disabled = !can;
    q('.hc-send').disabled = !can || (!queue.length && !q('.hc-message').value.trim());
    q('.hc-pass').disabled = !can || !q('.hc-recipient').value;
    q('.hc-turn').disabled = !can || !q('.hc-recipient').value;
    q('.hc-seat').disabled = visible || sending;
    q('.hc-enter').disabled = !connected || sending || !playerId;
    q('.hc-hide').disabled = sending;
    q('.hc-message').disabled = sending;
    q('.hc-clear').disabled = sending;
    for (const remove of root.querySelectorAll('.hc-remove')) remove.disabled = sending;
    q('.hc-recipient').disabled = sending;
    const name = playerName(playerId);
    let status = !connected ? 'Disconnected. Controls are unavailable until the table reconnects.' : !visible ? 'Choose your seat and enter it to reveal private cards. Hide the controls before sharing this screen.' : !view ? 'Loading your private view…' : view.table.result ? 'The game has ended. Complete your post-game questionnaire above.' : !eligible() ? (view.message || `Waiting for control to pass to ${name}. You can still inspect your cards.`) : `Your move, ${name}. Changes are queued until you send them.`;
    if (visible && view && ['paused', 'stopped'].includes(app?.coordinator?.mode) && !view.table.result) status += ' The runner is paused; after your handoff, press Resume to continue AI play.';
    q('.hc-status').textContent = status;
  }
  function renderCards() {
    if (!view || !visible) return;
    const zones = Object.values(view.table.zones);
    const options = zones.map(z => [z.id, `${zoneName(z.id)} (${z.count})`]);
    const sig = JSON.stringify(options);
    if (q('.hc-zone').dataset.choices !== sig) {
      const current = q('.hc-zone').value || `${playerId}:hand`;
      q('.hc-zone').replaceChildren(...select(options, current).childNodes); q('.hc-zone').value = options.some(([id]) => id === current) ? current : `${playerId}:hand`;
      q('.hc-zone').dataset.choices = sig;
    }
    const zone = view.table.zones[q('.hc-zone').value];
    if (!zone) return;
    const next = JSON.stringify([zone, playerId]); if (next === cardSignature) return; cardSignature = next;
    q('.hc-zone-count').textContent = `${zone.count} card${zone.count === 1 ? '' : 's'}${zone.hidden_count ? ` · ${zone.hidden_count} concealed` : ''}`;
    const cards = q('.hc-cards'); cards.replaceChildren();
    for (const card of zone.cards) {
      const node = button('', () => openCard(card)); node.className = 'hc-card';
      node.setAttribute('aria-label', `Inspect ${card.name}${card.tapped ? ', tapped' : ''}`);
      if (card.image_url) { const img = make('img'); img.src = card.image_url; img.alt = ''; img.loading = 'lazy'; node.append(img); }
      else node.append(make('div', 'hc-card-fallback', card.name || 'Face-down card'));
      node.append(make('span', 'hc-card-name', card.name || 'Face-down card'));
      const markers = [card.tapped ? 'Tapped' : '', card.damage ? `${card.damage} damage` : '', ...Object.entries(card.counters || {}).map(([k, v]) => `${v} ${k}`)].filter(Boolean);
      if (markers.length) node.append(make('span', 'hc-card-markers', markers.join(' · ')));
      cards.append(node);
    }
    if (!zone.cards.length) cards.append(make('p', 'hc-empty', zone.count ? 'These cards are concealed. A library stays concealed until you use a permitted look or draw action.' : 'This zone is empty.'));
    const recipient = q('.hc-recipient'); const existing = recipient.value || savedRecipient;
    const recipients = players().map(p => [p.id, p.name + (p.id === playerId ? ' (you)' : '')]);
    const recipientSig = JSON.stringify(recipients);
    if (recipient.dataset.choices !== recipientSig) {
      recipient.replaceChildren(...select(recipients).childNodes);
      recipient.value = recipients.some(([id]) => id === existing) ? existing : players()[(players().findIndex(p => p.id === playerId) + 1) % players().length]?.id || playerId;
      recipient.dataset.choices = recipientSig;
    }
  }
  async function loadView(force = false) {
    if (!visible || !connected || fetching || !playerId || !matchId) return;
    fetching = true; const serial = generation; const match = matchId; const seat = playerId;
    try {
      const result = await request(`/api/human?${new URLSearchParams({ matchId: match, playerId: seat })}`);
      if (serial !== generation || !visible || result.matchId !== match || result.playerId !== seat) return;
      view = result; renderCards(); renderDraft(); updateButtons();
    } catch (err) { if (serial === generation) { view = null; error(err.message); updateButtons(); } }
    finally { fetching = false; }
  }
  async function send(terminal = null) {
    const serial = generation, requestMatch = matchId, requestPlayer = playerId;
    try {
      error(); ensureWritable();
      const actions = queue.map(item => item.op); const message = q('.hc-message').value.trim();
      if (terminal && ['pass', 'pass_turn'].includes(terminal.type)) { if (message) terminal = { ...terminal, message }; actions.push(terminal); }
      else { if (message) actions.push({ type: 'say', text: message }); if (terminal) actions.push(terminal); }
      if (!actions.length) return;
      if (actions.length > 30) throw Error('Send fewer than 31 actions at once.');
      const revision = queue.length ? baseRevision : view.table.revision;
      sending = true; updateButtons();
      const result = await request('/api/human/act', { matchId: requestMatch, playerId: requestPlayer, revision, actions });
      if (serial !== generation || matchId !== requestMatch || playerId !== requestPlayer) return;
      queue = []; baseRevision = null; q('.hc-message').value = ''; saveDraft();
      if (result.table) view = result;
      if (modal.open) modal.close();
      cardSignature = ''; renderCards(); renderDraft();
      await onChange();
    } catch (err) { if (serial === generation && matchId === requestMatch && playerId === requestPlayer) error(`${err.message} Your draft has been kept; it was not automatically retried.`); }
    finally { sending = false; updateButtons(); void loadView(true); }
  }
  function openModal(title) {
    modal.replaceChildren(); modalRevision = view?.table?.revision ?? null;
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
    card = { ...card, ...Object.assign({}, ...queue.filter(item => item.op.type === 'card' && item.op.card === card.id).map(item => item.op.set)) };
    const body = openModal(card.name || 'Face-down card');
    const intro = make('div', 'hc-card-info');
    if (card.image_url) { const art = make('img', 'hc-modal-art'); art.src = card.image_url; art.alt = card.name; intro.append(art); }
    const details = make('div'); details.append(make('p', 'hc-help', card.type_line || 'Concealed card'), make('p', 'hc-oracle', 'Loading card text…')); intro.append(details); body.append(intro);
    const actions = make('div', 'hc-tools');
    actions.append(actionButton(card.tapped ? 'Queue untap' : 'Queue tap', () => { add({ op: { type: 'card', card: card.id, set: { tapped: !card.tapped } }, label: `${card.tapped ? 'Untap' : 'Tap'} ${card.name}` }); modal.close(); }), actionButton('Reveal to all players', () => { add({ op: { type: 'reveal', card: card.id }, label: `Reveal ${card.name} to all players` }); modal.close(); }));
    body.append(actions);
    const moveSection = make('section', 'hc-editor-section'); moveSection.append(make('h3', '', 'Move card'));
    const destination = select(Object.keys(view.table.zones).map(id => [id, zoneName(id)]), 'battlefield');
    const position = select([['bottom', 'Bottom'], ['top', 'Top']], 'bottom');
    destination.addEventListener('change', () => { position.value = destination.value === 'stack' ? 'top' : 'bottom'; });
    moveSection.append(label('Destination', destination), label('Position (library or stack)', position), actionButton('Queue move', () => { add({ op: { type: 'move', card: card.id, to: destination.value, position: position.value }, label: `Move ${card.name} to ${zoneName(destination.value)} · ${position.value}` }); modal.close(); }), make('p', 'hc-help', 'Moving keeps existing markers. Clear damage, counters, or tapped state explicitly when needed.'));
    body.append(moveSection);
    const edit = make('details', 'hc-editor-section'); edit.append(make('summary', '', 'Edit card markers, control & attachment'));
    const damage = input(card.damage || 0, 'number'); damage.min = '0';
    const count = make('textarea'); count.value = counterText(card.counters); count.placeholder = '+1/+1: 2';
    const note = make('textarea'); note.value = card.note || ''; note.maxLength = 2000;
    const controller = select(players().map(p => [p.id, p.name]), card.controller);
    const targets = Object.values(view.table.zones).flatMap(z => z.cards).filter(c => c.id !== card.id);
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
    const fill = () => { const original = players().find(p => p.id === who.value); const p = { ...original, ...Object.assign({}, ...queue.filter(item => item.op.type === 'player' && (item.op.player || playerId) === who.value).map(item => item.op.set)) }; life.value = p.life; counters.value = counterText(p.counters); mana.value = counterText(p.mana); }; fill(); who.addEventListener('change', fill);
    form.append(label('Player', who), label('Life total', life), label('Counters · one name: count per line', counters), label('Mana pool · one color: amount per line', mana), make('p', 'hc-help', 'Track floating mana explicitly. Card costs and mana clearing remain the players’ responsibility.'), submit); updateButtons();
  }
  function markerEditor() {
    const body = openModal('Turn & phase markers'); const { form, submit } = guardedForm(body, 'Queue marker changes', () => add({ op: { type: 'turn', set: { number: number(turn, 1), phase: phase.value, active: active.value } }, label: `Turn ${turn.value} · ${playerName(active.value)} · ${phase.value}` }));
    const stagedTurn = { ...view.table.turn, ...Object.assign({}, ...queue.filter(item => item.op.type === 'turn').map(item => item.op.set)) };
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
  q('.hc-enter').addEventListener('click', () => { visible = true; generation++; cardSignature = ''; q('.hc-private').hidden = false; q('.hc-enter').hidden = true; q('.hc-hide').hidden = false; updateButtons(); void loadView(true); });
  q('.hc-hide').addEventListener('click', () => {
    saveDraft(); visible = false; generation++; view = null; cardSignature = ''; if (modal.open) modal.close(); modal.replaceChildren(); q('.hc-cards').replaceChildren(); q('.hc-private').hidden = true; q('.hc-enter').hidden = false; q('.hc-hide').hidden = true; error(); updateButtons();
  });
  q('.hc-seat').addEventListener('change', () => { saveDraft(); playerId = q('.hc-seat').value; generation++; view = null; q('.hc-zone').value = playerId + ':hand'; q('.hc-zone').dataset.choices = ''; cardSignature = ''; savedRecipient = ''; q('.hc-recipient').replaceChildren(); q('.hc-recipient').dataset.choices = ''; choicesSignature = ''; stateSignature = ''; restoreDraft(); try { sessionStorage.setItem(`game-night-human-seat:${matchId}`, playerId); } catch {} renderDraft(); updateButtons(); });
  q('.hc-zone').addEventListener('change', () => { cardSignature = ''; renderCards(); });
  q('.hc-message').addEventListener('input', () => { saveDraft(); updateButtons(); });
  q('.hc-recipient').addEventListener('change', () => { saveDraft(); updateButtons(); });
  q('.hc-clear').addEventListener('click', clearDraft);
  q('.hc-draw').addEventListener('click', () => attempt(() => { const count = number(q('.hc-draw-count'), 1, 100); add({ op: { type: 'draw', count }, label: `Draw ${count} card${count === 1 ? '' : 's'}` }); }));
  q('.hc-shuffle').addEventListener('click', () => attempt(() => add({ op: { type: 'shuffle' }, label: 'Shuffle your library' })));
  q('.hc-return').addEventListener('click', () => attempt(() => {
    const cards = view.table.zones[playerId + ':hand'].cards;
    if (!cards.length) throw Error('Your hand is empty.');
    add(cards.map(c => ({ op: { type: 'move', card: c.id, to: playerId + ':library', position: 'bottom' }, label: `Return ${c.name} to your library` })));
  }));
  q('.hc-untap').addEventListener('click', () => attempt(() => {
    const cards = view.table.zones.battlefield.cards.filter(c => c.controller === playerId && c.tapped);
    if (!cards.length) throw Error('You have no tapped battlefield cards.');
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
    if (root.hidden) { if (modal.open) modal.close(); return; }
    if (matchId !== app.match.id) {
      saveDraft(); matchId = app.match.id; visible = false; generation++; view = null; playerId = ''; queue = []; baseRevision = null; choicesSignature = ''; stateSignature = ''; cardSignature = '';
      try { playerId = sessionStorage.getItem(`game-night-human-seat:${matchId}`) || ''; } catch {}
      if (!humans.some(p => p.id === playerId)) playerId = humans[0].id;
      if (modal.open) modal.close(); modal.replaceChildren(); q('.hc-private').hidden = true; q('.hc-enter').hidden = false; q('.hc-hide').hidden = true; q('.hc-zone').replaceChildren(); q('.hc-zone').dataset.choices = ''; q('.hc-recipient').replaceChildren(); q('.hc-recipient').dataset.choices = ''; savedRecipient = ''; restoreDraft(); error();
    }
    const choices = JSON.stringify(humans.map(p => [p.id, p.name]));
    if (choices !== choicesSignature) { choicesSignature = choices; q('.hc-seat').replaceChildren(...select(humans.map(p => [p.id, p.name]), playerId).childNodes); q('.hc-seat').value = playerId; }
    updateButtons();
    const newState = JSON.stringify([publicTable?.revision, app.coordinator?.mode, app.coordinator?.pendingRecipient, app.coordinator?.active, app.postgame?.status]);
    if (visible) { stateSignature = newState; void loadView(); }
  }
  return { update, hide: () => q('.hc-hide').click(), inspectCard(card) {
    if (!visible || !view) return false;
    const visibleCard = Object.values(view.table.zones).flatMap(zone => zone.cards).find(item => item.id === (typeof card === 'string' ? card : card.id));
    if (!visibleCard) return false;
    void openCard(visibleCard); return true;
  } };
}
