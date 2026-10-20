const SOURCE_SELECTOR = '[data-hc-card], [data-hc-draw-from]';
const TARGET_SELECTOR = '[data-hc-drop-zone]';

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
  return { zoneId, position: element.getAttribute('data-hc-drop-position') === 'top' ? 'top' : 'bottom',
    ...(controller ? { controller } : {}) };
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
  function cleanup() {
    const previous = gesture;
    gesture = null;
    if (frame !== null) win.cancelAnimationFrame(frame);
    frame = null;
    previous?.observer?.disconnect();
    previous?.ghost?.remove();
    previous?.element.classList.remove('hc-drag-source');
    for (const element of root.querySelectorAll('.hc-drop-ready, .hc-drop-active'))
      element.classList.remove('hc-drop-ready', 'hc-drop-active');
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
    const hovered = doc.elementFromPoint(gesture.x, gesture.y)?.closest(TARGET_SELECTOR);
    const next = hovered && gesture.targets.includes(hovered) && root.contains(hovered)
      && canDrop(gesture.source, targetOf(hovered), hovered) === true ? hovered : null;
    if (next === gesture.target) return;
    gesture.target?.classList.remove('hc-drop-active');
    gesture.target = next;
    next?.classList.add('hc-drop-active');
    onStatus(next ? `Drop into ${labelOf(next, 'data-hc-drop-label', targetOf(next).zoneId)} to queue this action.`
      : 'Drag onto a highlighted zone. Release elsewhere or press Escape to cancel.');
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
    ghost.classList.remove('hc-drop-ready', 'hc-drop-active');
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
      dragged: false, target: null, ghost: null, targets: [] };
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
    const valid = validGesture();
    gesture.x = event.clientX; gesture.y = event.clientY;
    if (gesture.dragged && valid) markTarget();
    const previous = cleanup();
    if (!previous.dragged) return;
    suppressClick(); event.preventDefault();
    if (!valid || !previous.target) { onStatus('Drag canceled. Nothing was queued.'); return; }
    try {
      const queued = onDrop(previous.source, targetOf(previous.target));
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
