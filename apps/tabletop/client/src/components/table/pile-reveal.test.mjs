import test from "node:test";
import assert from "node:assert/strict";
import { createPileReveal } from "./pile-reveal.mjs";

function fixture() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  const callbacks = [];
  const changes = [];
  const controller = createPileReveal({
    openDelay: 1000,
    closeDelay: 20000,
    immediateDrag: false,
    onChange: (value) => changes.push({ value, at: now }),
    setTimer(callback, delay) {
      const id = nextId++;
      timers.set(id, { callback, at: now + delay });
      callbacks.push(callback);
      return id;
    },
    clearTimer: (id) => timers.delete(id),
  });
  function advance(milliseconds) {
    const end = now + milliseconds;
    while (true) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    now = end;
  }
  return { controller, advance, timers, callbacks, changes };
}

test("stack opens after one second and closes only after twenty continuously absent seconds", () => {
  const { controller, advance, changes, timers } = fixture();
  controller.setActive("pointer:top", true);
  advance(999);
  assert.equal(controller.expanded, false);
  advance(1);
  assert.equal(controller.expanded, true);
  advance(30000);
  assert.equal(controller.expanded, true);
  controller.setActive("pointer:top", false);
  advance(19999);
  assert.equal(controller.expanded, true);
  advance(1);
  assert.equal(controller.expanded, false);
  assert.deepEqual(changes, [{ value: true, at: 1000 }, { value: false, at: 51000 }]);
  assert.equal(timers.size, 0);
});

test("interrupted stack hover requires a fresh second and canceled callbacks cannot reopen it", () => {
  const { controller, advance, callbacks, changes } = fixture();
  controller.setActive("pointer:top", true);
  advance(900);
  const staleOpen = callbacks.at(-1);
  controller.setActive("pointer:top", false);
  advance(5000);
  controller.setActive("pointer:top", true);
  staleOpen();
  advance(999);
  assert.equal(controller.expanded, false);
  controller.setActive("pointer:top", true);
  advance(1);
  assert.deepEqual(changes, [{ value: true, at: 6900 }]);
});

test("reentering any stack item cancels collapse and the next absence starts twenty fresh seconds", () => {
  const { controller, advance, callbacks, changes } = fixture();
  controller.setActive("pointer:first", true);
  advance(1000);
  controller.setActive("pointer:first", false);
  const staleClose = callbacks.at(-1);
  advance(19000);
  controller.setActive("pointer:second", true);
  staleClose();
  advance(5000);
  assert.equal(controller.expanded, true);
  controller.setActive("pointer:second", false);
  advance(19999);
  assert.equal(controller.expanded, true);
  controller.setActive("pointer:second", false);
  advance(1);
  assert.deepEqual(changes, [{ value: true, at: 1000 }, { value: false, at: 45000 }]);
});

test("focus and activity on other stack items preserve dwell and postpone collapse", () => {
  const { controller, advance, timers } = fixture();
  controller.setActive("pointer:first", true);
  advance(500);
  controller.setActive("focus:first", true);
  controller.setActive("pointer:first", false);
  advance(500);
  assert.equal(controller.expanded, true);
  controller.setActive("pointer:second", true);
  controller.setActive("focus:first", false);
  advance(30000);
  assert.equal(controller.expanded, true);
  assert.equal(timers.size, 0);
  controller.setActive("focus:second", true);
  controller.setActive("pointer:second", false);
  advance(30000);
  assert.equal(controller.expanded, true);
  controller.setActive("focus:second", false);
  advance(20000);
  assert.equal(controller.expanded, false);
});

test("stack dragging respects dwell when immediate drag is disabled", () => {
  const { controller, advance, changes } = fixture();
  controller.setActive("drag", true);
  advance(999);
  assert.equal(controller.expanded, false);
  advance(1);
  assert.equal(controller.expanded, true);
  controller.setActive("drag", false);
  advance(20000);
  assert.deepEqual(changes, [{ value: true, at: 1000 }, { value: false, at: 21000 }]);
});

test("reset collapses the stack, clears occupancy, and invalidates pending open or close callbacks", () => {
  for (const phase of ["pending-open", "held-open", "pending-close"]) {
    const { controller, advance, timers, callbacks, changes } = fixture();
    controller.setActive("pointer:first", true);
    controller.setActive("focus:first", true);
    if (phase !== "pending-open") advance(1000);
    if (phase === "pending-close") {
      controller.setActive("pointer:first", false);
      controller.setActive("focus:first", false);
    }
    const staleCallbacks = [...callbacks];
    controller.reset();
    assert.equal(controller.expanded, false, phase);
    assert.equal(timers.size, 0, phase);
    const afterReset = [...changes];
    controller.reset();
    for (const callback of staleCallbacks) callback();
    advance(30000);
    assert.deepEqual(changes, afterReset, phase);

    // Reusing an occupied channel proves reset removed its previous occupancy.
    controller.setActive("pointer:first", true);
    for (const callback of staleCallbacks) callback();
    advance(999);
    assert.equal(controller.expanded, false, phase);
    advance(1);
    assert.equal(controller.expanded, true, phase);
    controller.setActive("pointer:first", false);
    advance(20000);
    assert.equal(controller.expanded, false, "old focus occupancy must not hold it open");
  }
});

test("disposing a stack makes every entry point and obsolete callback inert", () => {
  for (const open of [false, true]) {
    const { controller, advance, changes, timers, callbacks } = fixture();
    controller.setActive("pointer", true);
    if (open) {
      advance(1000);
      controller.setActive("pointer", false);
    }
    const before = [...changes];
    controller.dispose();
    controller.dispose();
    assert.equal(timers.size, 0);
    controller.reset();
    controller.setActive("focus", true);
    controller.setActive("drag", true);
    controller.reveal();
    controller.dismiss();
    for (const callback of callbacks) callback();
    advance(30000);
    assert.deepEqual(changes, before);
    assert.equal(timers.size, 0);
  }
});
