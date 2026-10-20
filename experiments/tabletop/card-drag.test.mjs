import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardDragController } from './card-drag.mjs';

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
  Object.assign(win, { innerWidth: 1000, innerHeight: 800, setTimeout, clearTimeout,
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
  return { doc, win, root, source, target, controller, drops, statuses,
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
