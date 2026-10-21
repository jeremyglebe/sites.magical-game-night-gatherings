import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardDragController, ATTACH_DWELL_MS } from '../shared/card-drag.mjs';

// A small event surface exercises the controller's commit boundary and cleanup.
// Actual pointer movement/layout is also checked in the browser by the host.
class Element extends EventTarget {
  constructor(doc, attrs = {}) {
    super(); this.ownerDocument = doc; this.attrs = new Map(Object.entries(attrs));
    this.children = []; this.parentElement = null; this.style = {};
    this.classes = new Set();
    this.classList = { add: (...v) => v.forEach(x => this.classes.add(x)), remove: (...v) => v.forEach(x => this.classes.delete(x)), contains: v => this.classes.has(v) };
  }
  get isConnected() { return this === this.ownerDocument.body || !!this.parentElement?.isConnected; }
  getAttribute(key) { return this.attrs.get(key) ?? null; }
  setAttribute(key, value) { this.attrs.set(key, value); }
  removeAttribute(key) { this.attrs.delete(key); }
  matches(selectors) { return selectors.split(',').some(s => {
    s = s.trim(); return s.startsWith('.') ? this.classes.has(s.slice(1)) : this.attrs.has(s.slice(1, -1));
  }); }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); this.parentElement = null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 140 }; }
  getClientRects() { return this.isConnected ? [this.getBoundingClientRect()] : []; }
  cloneNode() { const copy = new Element(this.ownerDocument, Object.fromEntries(this.attrs)); copy.classes = new Set(this.classes); for (const child of this.children) copy.append(child.cloneNode()); return copy; }
  setPointerCapture(id) { this.capture = id; }
  hasPointerCapture(id) { return this.capture === id; }
  releasePointerCapture() { this.capture = null; }
}
function emit(node, type, values = {}) {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries({ button: 0, pointerId: 1, clientX: 20, clientY: 20, ...values })) Object.defineProperty(event, key, { value });
  node.dispatchEvent(event); return event;
}
function fixture(options = {}) {
  const win = new EventTarget(); let raf = 0;
  let now = 0, timerId = 0;
  const timers = new Map();
  const setTimer = (fn, delay) => { const id = ++timerId; timers.set(id, { at: now + delay, fn }); return id; };
  const tick = ms => {
    const end = now + ms;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    now = end;
  };
  Object.assign(win, { innerWidth: 1000, innerHeight: 800, setTimeout: setTimer, clearTimeout: id => timers.delete(id),
    CustomEvent,
    requestAnimationFrame: () => ++raf, cancelAnimationFrame: () => {} });
  const doc = new EventTarget(); doc.defaultView = win;
  doc.body = new Element(doc); doc.elementFromPoint = () => doc.hit;
  const root = new Element(doc), source = new Element(doc, options.pile ? { 'data-hc-draw-from': 'p1:library' } : { 'data-hc-card': 'visible-card' });
  const target = new Element(doc, { 'data-hc-drop-zone': 'battlefield', 'data-hc-drop-position': 'top', 'data-hc-drop-controller': 'p1' });
  doc.body.append(root); root.append(source, target); doc.hit = target;
  const drops = [], statuses = []; let context = 'seat-p1:rev1', authorized = true;
  const controller = createCardDragController({ root, canStart: () => authorized,
    canDrop: options.canDrop || (() => true), getContext: () => context,
    onDrop: (...args) => drops.push(args), onStatus: text => statuses.push(text) });
  return { doc, win, root, source, target, controller, drops, statuses, tick, timers,
    down: () => emit(root, 'pointerdown', { target: source }),
    move: () => emit(doc, 'pointermove', { clientX: 200, clientY: 200 }),
    up: () => emit(doc, 'pointerup', { clientX: 200, clientY: 200 }),
    changeContext: () => { context = 'seat-p2:rev1'; }, revoke: () => { authorized = false; } };
}

test('ordinary card click is not captured, suppressed, or turned into a move', () => {
  const f = fixture();
  try {
    f.down(); assert.equal(f.controller.pending, true); assert.equal(f.root.capture, undefined);
    emit(f.doc, 'pointermove', { clientX: 22, clientY: 22 });
    f.up(); assert.equal(f.controller.active, false); assert.deepEqual(f.drops, []);
    assert.equal(emit(f.doc, 'click', { detail: 1 }).defaultPrevented, false);
  } finally { f.controller.destroy(); }
});

test('drag queues exactly one trusted source/target after cleanup and suppresses the trailing pointer click', () => {
  const f = fixture();
  try {
    f.down(); f.move(); assert.equal(f.controller.active, true);
    assert.equal(f.root.capture, 1); assert(f.target.classes.has('hc-drop-active'));
    assert.equal(f.doc.body.querySelectorAll('.hc-drag-ghost').length, 1);
    f.up();
    assert.deepEqual(f.drops, [[{ cardId: 'visible-card' }, { zoneId: 'battlefield', position: 'top', controller: 'p1' }]]);
    assert.equal(f.controller.pending, false); assert.equal(f.root.capture, null);
    assert.equal(f.doc.body.querySelectorAll('.hc-drag-ghost').length, 0);
    assert.equal(f.target.classes.has('hc-drop-active'), false);
    assert.equal(emit(f.doc, 'click', { detail: 1 }).defaultPrevented, true);
    assert.equal(emit(f.doc, 'click', { detail: 0 }).defaultPrevented, false, 'keyboard click is not swallowed');
  } finally { f.controller.destroy(); }
});

test('seat changes remove private card ghosts and invalidate the gesture before drop', () => {
  const f = fixture();
  try {
    f.down(); f.move(); f.changeContext(); f.controller.sync(); f.up();
    assert.deepEqual(f.drops, []); assert.equal(f.doc.body.querySelectorAll('.hc-drag-ghost').length, 0);
    assert.equal(f.root.classes.has('hc-dragging'), false);
    assert.equal(f.source.classes.has('hc-drag-source'), false);
  } finally { f.controller.destroy(); }
});

test('removed sources and revoked authority cannot commit a drag', () => {
  for (const invalidate of [f => f.source.remove(), f => f.revoke()]) {
    const f = fixture();
    try {
      f.down(); f.move(); invalidate(f); f.up();
      assert.deepEqual(f.drops, []); assert.equal(f.doc.body.querySelectorAll('.hc-drag-ghost').length, 0);
    } finally { f.controller.destroy(); }
  }
});

test('Escape and unaccepted destinations cancel without queuing', () => {
  for (const escape of [true, false]) {
    const f = fixture({ canDrop: () => escape });
    try {
      f.down(); f.move();
      if (escape) emit(f.doc, 'keydown', { key: 'Escape' });
      f.up(); assert.deepEqual(f.drops, []); assert.equal(f.controller.active, false);
    } finally { f.controller.destroy(); }
  }
});

test('a concealed pile drag carries a zone only, never an invented card identity', () => {
  const f = fixture({ pile: true });
  try {
    f.down(); f.move(); f.up();
    assert.deepEqual(f.drops[0][0], { drawFrom: 'p1:library' });
  } finally { f.controller.destroy(); }
});

function addPile(f, id, events) {
  const pile = new Element(f.doc, { 'data-hc-pile': '' });
  const top = new Element(f.doc, { 'data-hc-drop-zone': id, 'data-hc-drop-position': 'top' });
  const bottom = new Element(f.doc, { 'data-hc-drop-zone': id, 'data-hc-drop-position': 'bottom' });
  pile.addEventListener('hc-pile-hover', event => events.push({ id, active: event.detail.active, bubbles: event.bubbles }));
  pile.append(top, bottom); f.root.append(pile);
  return { pile, top, bottom };
}

test('captured drags notify geometric pile changes without flicker between its two targets', () => {
  const f = fixture(), events = [];
  try {
    const a = addPile(f, 'p1:library', events), b = addPile(f, 'p2:library', events);
    f.doc.hit = a.top; f.down(); f.move();
    assert.equal(f.root.capture, 1);
    f.move(); f.doc.hit = a.bottom; f.move();
    assert.deepEqual(events, [{ id: 'p1:library', active: true, bubbles: true }], 'staying in a pile does not reset its hover timer');
    f.doc.hit = b.top; f.move();
    assert.deepEqual(events.slice(1), [
      { id: 'p1:library', active: false, bubbles: true },
      { id: 'p2:library', active: true, bubbles: true },
    ]);
    f.doc.hit = f.target; f.move();
    assert.deepEqual(events.at(-1), { id: 'p2:library', active: false, bubbles: true });
    const count = events.length;
    f.up(); assert.equal(events.length, count, 'dropping after leaving a pile does not send another exit');
  } finally { f.controller.destroy(); }
});

test('a deck bottom revealed during a drag can receive the final drop without another pointermove', () => {
  for (const newlyMounted of [true, false]) {
    const f = fixture(), events = [];
    try {
      const { top, bottom, pile } = addPile(f, 'p1:library', events);
      if (newlyMounted) bottom.remove();
      else bottom.setAttribute('data-hc-drop-disabled', 'true');
      f.doc.hit = top; f.down(); f.move();
      assert.equal(bottom.classes.has('hc-drop-ready'), false);
      if (newlyMounted) pile.append(bottom);
      else bottom.removeAttribute('data-hc-drop-disabled');
      f.doc.hit = bottom;
      f.up();
      assert.deepEqual(f.drops, [[{ cardId: 'visible-card' }, { zoneId: 'p1:library', position: 'bottom' }]]);
      assert.deepEqual(events, [
        { id: 'p1:library', active: true, bubbles: true },
        { id: 'p1:library', active: false, bubbles: true },
      ]);
    } finally { f.controller.destroy(); }
  }
});

test('a destination disabled during a drag cannot accept a drop', () => {
  const f = fixture(), events = [];
  try {
    const { bottom } = addPile(f, 'p1:library', events);
    f.doc.hit = bottom; f.down(); f.move();
    assert.equal(bottom.classes.has('hc-drop-active'), true);
    bottom.setAttribute('data-hc-drop-disabled', 'true');
    f.up();
    assert.deepEqual(f.drops, []);
    assert.equal(bottom.classes.has('hc-drop-ready'), false);
    assert.equal(bottom.classes.has('hc-drop-active'), false);
  } finally { f.controller.destroy(); }
});

test('pile hover clears exactly once on cancellation, invalidation, and disposal', () => {
  for (const end of [
    f => emit(f.doc, 'keydown', { key: 'Escape' }),
    f => emit(f.doc, 'pointercancel'),
    f => emit(f.win, 'blur'),
    f => { f.changeContext(); f.controller.sync(); },
    f => f.controller.destroy(),
  ]) {
    const f = fixture(), events = [];
    try {
      const { top } = addPile(f, 'p1:library', events);
      f.doc.hit = top; f.down(); f.move(); end(f);
      f.up(); f.controller.destroy();
      assert.deepEqual(f.drops, []);
      assert.deepEqual(events.map(event => event.active), [true, false]);
    } finally { f.controller.destroy(); }
  }
});

test('hovering a pile outside the controlled table never notifies that pile', () => {
  const f = fixture(), events = [];
  try {
    const { pile, top } = addPile(f, 'outside:library', events);
    pile.remove(); f.doc.body.append(pile);
    f.doc.hit = top; f.down(); f.move(); f.up();
    assert.deepEqual(events, []); assert.deepEqual(f.drops, []);
  } finally { f.controller.destroy(); }
});

function attachmentTarget(f, id = 'creature') {
  const target = new Element(f.doc, {
    'data-hc-drop-zone': 'battlefield', 'data-hc-attach-to': id,
    'data-hc-drop-label': 'opponent creature',
  });
  // The surrounding board also accepts ordinary zone drops. An unarmed card
  // must never fall through and silently transfer control to that board.
  f.target.append(target);
  f.doc.hit = target;
  return target;
}
const centerMove = f => emit(f.doc, 'pointermove', { clientX: 50, clientY: 70 });
const centerUp = f => emit(f.doc, 'pointerup', { clientX: 50, clientY: 70 });

test('attachment drops require a center dwell, then release queues exactly the attachment target', () => {
  const f = fixture();
  try {
    const target = attachmentTarget(f);
    f.down(); centerMove(f);
    assert.equal(target.classes.has('hc-attach-pending'), true);
    assert.equal(target.classes.has('hc-drop-active'), false);
    f.tick(ATTACH_DWELL_MS - 1);
    assert.equal(target.classes.has('hc-attach-armed'), false);
    f.tick(1);
    assert.equal(target.classes.has('hc-attach-pending'), false);
    assert.equal(target.classes.has('hc-attach-armed'), true);
    assert.match(f.statuses.at(-1), /Release to attach/);
    assert.deepEqual(f.drops, [], 'arming does not queue or mutate play');
    centerUp(f);
    assert.deepEqual(f.drops, [[{ cardId: 'visible-card' }, { zoneId: 'battlefield', position: 'bottom', attachTo: 'creature' }]]);
    assert.equal(target.classes.has('hc-attach-armed'), false);
    assert.equal(f.controller.pending, false);
  } finally { f.controller.destroy(); }
});

test('a quick card flyover or edge release cancels without falling through to the parent battlefield', () => {
  for (const edge of [false, true]) {
    const f = fixture();
    try {
      const target = attachmentTarget(f);
      f.down();
      if (edge) {
        emit(f.doc, 'pointermove', { clientX: 5, clientY: 70 });
        f.tick(ATTACH_DWELL_MS * 2);
        assert.equal(target.classes.has('hc-attach-pending'), false);
        emit(f.doc, 'pointerup', { clientX: 5, clientY: 70 });
      } else {
        centerMove(f); f.tick(ATTACH_DWELL_MS - 1); centerUp(f);
      }
      f.tick(ATTACH_DWELL_MS * 2);
      assert.deepEqual(f.drops, []);
      assert.equal(target.classes.has('hc-attach-armed'), false);
    } finally { f.controller.destroy(); }
  }
});

test('leaving an attachment center or changing its identity resets the full dwell', () => {
  for (const reset of [
    (f, target) => { emit(f.doc, 'pointermove', { clientX: 5, clientY: 70 }); centerMove(f); },
    (f, target) => { target.setAttribute('data-hc-attach-to', 'another-creature'); centerMove(f); },
    (f, target) => { f.doc.hit = f.target; centerMove(f); f.doc.hit = target; centerMove(f); },
  ]) {
    const f = fixture();
    try {
      const target = attachmentTarget(f);
      f.down(); centerMove(f); f.tick(ATTACH_DWELL_MS);
      assert.equal(target.classes.has('hc-attach-armed'), true);
      reset(f, target);
      assert.equal(target.classes.has('hc-attach-armed'), false);
      f.tick(ATTACH_DWELL_MS - 1);
      assert.equal(target.classes.has('hc-attach-armed'), false);
      f.tick(1); centerUp(f);
      assert.equal(f.drops.length, 1);
    } finally { f.controller.destroy(); }
  }
});

test('canceled and stale attachment gestures clear their timers and never arm later', () => {
  for (const end of [
    f => emit(f.doc, 'keydown', { key: 'Escape' }),
    f => emit(f.doc, 'pointercancel'),
    f => emit(f.win, 'blur'),
    f => { f.changeContext(); f.controller.sync(); },
    f => { f.source.remove(); f.controller.sync(); },
    f => f.controller.destroy(),
  ]) {
    for (const delay of [200, ATTACH_DWELL_MS]) {
      const f = fixture();
      try {
        const target = attachmentTarget(f);
        f.down(); centerMove(f); f.tick(delay); end(f);
        f.tick(ATTACH_DWELL_MS * 2); centerUp(f);
        assert.deepEqual(f.drops, []);
        assert.equal(target.classes.has('hc-attach-pending'), false);
        assert.equal(target.classes.has('hc-attach-armed'), false);
        assert.equal(f.doc.body.querySelectorAll('.hc-drag-ghost').length, 0);
      } finally { f.controller.destroy(); }
    }
  }
});

test('removed or newly invalid attachment targets cannot arm or fall through to ordinary zones', () => {
  for (const invalidate of [target => target.remove(), target => target.setAttribute('data-hc-drop-disabled', 'true')]) {
    const f = fixture();
    try {
      const target = attachmentTarget(f);
      f.down(); centerMove(f); f.tick(200); invalidate(target);
      f.tick(ATTACH_DWELL_MS); centerUp(f);
      assert.deepEqual(f.drops, []);
      assert.equal(target.classes.has('hc-attach-pending'), false);
      assert.equal(target.classes.has('hc-attach-armed'), false);
    } finally { f.controller.destroy(); }
  }
});

test('invalid attachment relationships do not highlight, arm, or transfer control through their parent', () => {
  const f = fixture({ canDrop: (source, target) => !target.attachTo });
  try {
    const target = attachmentTarget(f, 'visible-card');
    f.down(); centerMove(f); f.tick(ATTACH_DWELL_MS * 2); centerUp(f);
    assert.deepEqual(f.drops, []);
    assert.equal(target.classes.has('hc-drop-ready'), false);
    assert.equal(target.classes.has('hc-attach-armed'), false);
  } finally { f.controller.destroy(); }
});
