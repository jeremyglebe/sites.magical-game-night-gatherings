const SOURCE_SELECTOR = '[data-hc-card], [data-hc-draw-from]';
const TARGET_SELECTOR = '[data-hc-drop-zone]';
const PILE_SELECTOR = '[data-hc-pile]';
export const ATTACH_DWELL_MS = 650;

function sourceOf(element) {
  const cardId = element.getAttribute('data-hc-card');
  if (cardId) return { cardId };
  const drawFrom = element.getAttribute('data-hc-draw-from');
  return drawFrom ? { drawFrom } : null;
}
function targetOf(element) {
  const zoneId = element.getAttribute('data-hc-drop-zone');
  if (!zoneId) return null;
  const controller = element.getAttribute('data-hc-drop-controller');
  const attachTo = element.getAttribute('data-hc-attach-to');
  return { zoneId, position: element.getAttribute('data-hc-drop-position') === 'top' ? 'top' : 'bottom',
    ...(controller ? { controller } : {}), ...(attachTo ? { attachTo } : {}) };
}
function labelOf(element, attribute, fallback) {
  return element.getAttribute(attribute) || element.getAttribute('aria-label') || fallback;
}
function edgeSpeed(position, size) {
  const edge = Math.min(56, size / 4);
  if (position < edge) return -Math.ceil(14 * Math.min(1, Math.max(0, 1 - position / edge)));
  if (position > size - edge) return Math.ceil(14 * Math.min(1, Math.max(0, 1 - (size - position) / edge)));
  return 0;
}

/** Pointer-only UI transport. The host validates moves and queues them; this
 * module never reads hidden state, accepts external payloads, or commits play. */
export function createCardDragController({ root, canStart, onDrop, onStatus = () => {},
  getContext = () => null, canDrop = () => true }) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  let gesture = null, frame = null, suppressedClick = false, clickTimer = null;
  let canceledPointer = null, destroyed = false;
  const listeners = [];
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  };
  function allowedSource(source, element) {
    return !!source && !element.disabled && element.getAttribute('aria-disabled') !== 'true' && canStart(source, element) === true;
  }
  function validGesture() {
    return gesture && !destroyed && gesture.element.isConnected && root.contains(gesture.element)
      && Object.is(gesture.context, getContext()) && allowedSource(gesture.source, gesture.element);
  }
  function targets() {
    if (!gesture) return [];
    return [...root.querySelectorAll(TARGET_SELECTOR)].filter(element => {
      const target = targetOf(element);
      return target && !element.disabled && element.getAttribute('aria-disabled') !== 'true'
        && element.getAttribute('data-hc-drop-disabled') !== 'true'
        && element.getClientRects().length > 0 && canDrop(gesture.source, target, element) === true;
    });
  }
  function suppressClick() {
    suppressedClick = true;
    if (clickTimer !== null) win.clearTimeout(clickTimer);
    // Pointer-generated click follows pointerup. Keyboard clicks remain usable.
    clickTimer = win.setTimeout(() => { suppressedClick = false; clickTimer = null; }, 0);
  }
  function notifyPile(element, active) {
    element?.dispatchEvent(new win.CustomEvent('hc-pile-hover', {
      bubbles: true, detail: { active },
    }));
  }
  function markPile(element) {
    const pile = element?.closest(PILE_SELECTOR);
    const next = pile && root.contains(pile) ? pile : null;
    if (next === gesture.pile) return;
    notifyPile(gesture.pile, false);
    gesture.pile = next;
    notifyPile(next, true);
  }
  function clearAttachment(current = gesture) {
    if (!current?.attachment) return;
    win.clearTimeout(current.attachment.timer);
    current.attachment.element.classList.remove('hc-attach-pending', 'hc-attach-armed');
    current.attachment = null;
  }
  function inAttachmentCenter(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0
      && gesture.x >= rect.left + rect.width * .2 && gesture.x <= rect.left + rect.width * .8
      && gesture.y >= rect.top + rect.height * .2 && gesture.y <= rect.top + rect.height * .8;
  }
  function attachmentStatus(element) {
    const name = labelOf(element, 'data-hc-drop-label', 'this card');
    return gesture.attachment?.armed ? `Release to attach to ${name}.`
      : gesture.attachment ? `Hold here briefly to attach to ${name}.`
        : `Hold over the center of ${name} to attach. Release elsewhere to cancel.`;
  }
  function markAttachment(element) {
    const attachTo = element && targetOf(element)?.attachTo;
    if (!attachTo || !inAttachmentCenter(element)) { clearAttachment(); return; }
    if (gesture.attachment?.element === element && gesture.attachment.attachTo === attachTo) return;
    clearAttachment();
    const current = gesture;
    const attachment = { element, attachTo, armed: false, timer: null };
    current.attachment = attachment;
    element.classList.add('hc-attach-pending');
    attachment.timer = win.setTimeout(() => {
      if (gesture !== current || !validGesture()) { sync(); return; }
      // Re-evaluate layout and permission when the timer fires, including a
      // target moved by scrolling or a pile expanded beneath a still pointer.
      markTarget();
      if (current.attachment !== attachment) return;
      attachment.armed = true;
      element.classList.remove('hc-attach-pending');
      element.classList.add('hc-attach-armed', 'hc-drop-active');
      current.status = attachmentStatus(element);
      onStatus(current.status);
    }, ATTACH_DWELL_MS);
  }
  function cleanup() {
    const previous = gesture;
    clearAttachment(previous);
    gesture = null;
    if (frame !== null) win.cancelAnimationFrame(frame);
    frame = null;
    notifyPile(previous?.pile, false);
    previous?.observer?.disconnect();
    previous?.ghost?.remove();
    previous?.element.classList.remove('hc-drag-source');
    const marked = new Set([...(previous?.targets || []), previous?.target,
      ...root.querySelectorAll('.hc-drop-ready, .hc-drop-active, .hc-attach-pending, .hc-attach-armed')]);
    for (const element of marked) if (element)
      element.classList.remove('hc-drop-ready', 'hc-drop-active', 'hc-attach-pending', 'hc-attach-armed');
    root.classList.remove('hc-dragging');
    if (previous && root.hasPointerCapture?.(previous.pointerId)) root.releasePointerCapture(previous.pointerId);
    return previous;
  }
  function cancel(message = '') {
    if (!gesture) return;
    const dragged = gesture.dragged;
    if (dragged) canceledPointer = gesture.pointerId;
    cleanup();
    if (dragged) onStatus(message || 'Drag canceled. Nothing was queued.');
  }
  function sync() {
    if (gesture && !validGesture()) cancel('The table changed. Drag again from the current position.');
  }
  function markTarget() {
    if (!gesture?.dragged) return;
    const element = doc.elementFromPoint(gesture.x, gesture.y);
    // Pointer capture keeps native pointerenter/leave on the captured root.
    // Piles still need geometric hover to reveal destinations during a drag.
    markPile(element);
    // A hover can reveal a new deck-bottom target without a new gesture.
    const available = targets();
    for (const target of gesture.targets) {
      if (!available.includes(target)) target.classList.remove('hc-drop-ready');
    }
    gesture.targets = available;
    for (const target of available) target.classList.add('hc-drop-ready');
    const hovered = element?.closest(TARGET_SELECTOR);
    const next = hovered && gesture.targets.includes(hovered) && root.contains(hovered)
      && canDrop(gesture.source, targetOf(hovered), hovered) === true ? hovered : null;
    if (next !== gesture.target) gesture.target?.classList.remove('hc-drop-active');
    gesture.target = next;
    markAttachment(next);
    const attachment = next && targetOf(next).attachTo;
    if (next) {
      if (!attachment || gesture.attachment?.armed) next.classList.add('hc-drop-active');
      else next.classList.remove('hc-drop-active');
    }
    // Never walk up to a battlefield's zone when the nearest target is a card:
    // an unarmed or invalid card drop must not change control or detach a card.
    const status = next ? attachment ? attachmentStatus(next)
      : `Drop into ${labelOf(next, 'data-hc-drop-label', targetOf(next).zoneId)} to queue this action.`
      : 'Drag onto a highlighted zone. Release elsewhere or press Escape to cancel.';
    if (status !== gesture.status) { gesture.status = status; onStatus(status); }
  }
  function positionGhost() {
    if (!gesture?.ghost) return;
    const box = gesture.ghost.getBoundingClientRect();
    const x = Math.max(8, Math.min(gesture.x + 16, win.innerWidth - box.width - 8));
    const y = Math.max(8, Math.min(gesture.y + 16, win.innerHeight - box.height - 8));
    gesture.ghost.style.transform = `translate(${x}px, ${y}px)`;
  }
  function scrollEdges() {
    if (!gesture?.dragged) return;
    if (!validGesture()) { cancel('The table changed. Drag again from the current position.'); return; }
    let element = doc.elementFromPoint(gesture.x, gesture.y);
    let scrolledY = false;
    // Scroll a hand/zone strip under the pointer before scrolling the page.
    while (element && element !== doc.body && element !== doc.documentElement) {
      const style = win.getComputedStyle(element), rect = element.getBoundingClientRect();
      const dx = /auto|scroll/.test(style.overflowX) && element.scrollWidth > element.clientWidth
        ? edgeSpeed(gesture.x - rect.left, rect.width) : 0;
      const dy = /auto|scroll/.test(style.overflowY) && element.scrollHeight > element.clientHeight
        ? edgeSpeed(gesture.y - rect.top, rect.height) : 0;
      const beforeY = element.scrollTop;
      if (dx || dy) element.scrollBy({ left: dx, top: dy, behavior: 'instant' });
      if (element.scrollTop !== beforeY) scrolledY = true;
      if (dx || scrolledY) break;
      element = element.parentElement;
    }
    if (!scrolledY) {
      const dy = edgeSpeed(gesture.y, win.innerHeight);
      if (dy) win.scrollBy({ left: 0, top: dy, behavior: 'instant' });
    }
    markTarget(); positionGhost();
    frame = win.requestAnimationFrame(scrollEdges);
  }
  function beginDrag() {
    const current = gesture;
    current.dragged = true;
    root.setPointerCapture?.(current.pointerId);
    const ghost = current.element.cloneNode(true);
    ghost.classList.add('hc-drag-ghost');
    ghost.classList.remove('hc-drop-ready', 'hc-drop-active', 'hc-attach-pending', 'hc-attach-armed');
    ghost.removeAttribute('id');
    for (const node of ghost.querySelectorAll('[id]')) node.removeAttribute('id');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    const rect = current.element.getBoundingClientRect();
    Object.assign(ghost.style, {
      position: 'fixed', left: '0', top: '0', margin: '0', pointerEvents: 'none',
      zIndex: '10000', width: `${Math.min(150, Math.max(72, rect.width))}px`,
      maxHeight: '210px', overflow: 'hidden', opacity: '0.9',
    });
    current.ghost = ghost;
    doc.body.append(ghost);
    current.element.classList.add('hc-drag-source');
    root.classList.add('hc-dragging');
    current.targets = targets();
    for (const target of current.targets) target.classList.add('hc-drop-ready');
    onStatus(`Dragging ${labelOf(current.element, 'data-hc-drag-label', current.source.cardId ? 'card' : 'top card')}. Choose a highlighted zone.`);
    markTarget(); positionGhost();
    frame = win.requestAnimationFrame(scrollEdges);
  }
  listen(root, 'pointerdown', event => {
    if (destroyed || gesture || event.isPrimary === false || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey) return;
    const element = event.target.closest?.(SOURCE_SELECTOR);
    if (!element || !root.contains(element)) return;
    const source = sourceOf(element);
    if (!allowedSource(source, element)) return;
    canceledPointer = null;
    gesture = { element, source, pointerId: event.pointerId, context: getContext(),
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
      dragged: false, target: null, ghost: null, targets: [], pile: null };
    if (win.MutationObserver) {
      gesture.observer = new win.MutationObserver(sync);
      gesture.observer.observe(root, { childList: true, subtree: true });
    }
  });
  listen(doc, 'pointermove', event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (!validGesture()) { cancel('The table changed. Drag again from the current position.'); return; }
    gesture.x = event.clientX; gesture.y = event.clientY;
    if (!gesture.dragged && Math.hypot(gesture.x - gesture.startX, gesture.y - gesture.startY) < 7) return;
    event.preventDefault();
    if (!gesture.dragged) beginDrag();
    markTarget(); positionGhost();
  }, { passive: false });
  listen(doc, 'pointerup', event => {
    if (canceledPointer === event.pointerId) { canceledPointer = null; suppressClick(); return; }
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    let valid = validGesture();
    gesture.x = event.clientX; gesture.y = event.clientY;
    if (gesture.dragged && valid) markTarget();
    valid = valid && validGesture();
    const destination = gesture.target && targetOf(gesture.target);
    const armed = !destination?.attachTo || gesture.attachment?.armed === true;
    const previous = cleanup();
    if (!previous.dragged) return;
    suppressClick(); event.preventDefault();
    if (!valid || !previous.target || !armed) { onStatus('Drag canceled. Nothing was queued.'); return; }
    try {
      const queued = onDrop(previous.source, destination);
      if (queued !== false) onStatus('Action queued. Undo it in chat before sending if you change your mind.');
    } catch (error) { onStatus(error.message || 'Could not queue that move.'); }
  });
  listen(doc, 'pointercancel', event => { if (gesture?.pointerId === event.pointerId) cancel(); });
  listen(root, 'lostpointercapture', event => { if (gesture?.pointerId === event.pointerId) cancel(); });
  listen(doc, 'keydown', event => {
    if (gesture && event.key === 'Escape') { event.preventDefault(); cancel(); }
  }, true);
  listen(win, 'blur', () => cancel());
  listen(doc, 'visibilitychange', () => { if (doc.hidden) cancel(); });
  listen(root, 'dragstart', event => {
    if (event.target.closest?.(SOURCE_SELECTOR)) event.preventDefault();
  });
  listen(doc, 'click', event => {
    if (suppressedClick && event.detail !== 0) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  return {
    get active() { return !!gesture?.dragged; },
    get pending() { return !!gesture; },
    cancel, sync,
    destroy() {
      cancel(); destroyed = true;
      if (clickTimer !== null) win.clearTimeout(clickTimer);
      suppressedClick = false;
      for (const remove of listeners) remove();
    },
  };
}
