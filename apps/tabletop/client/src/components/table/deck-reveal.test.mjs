import test from "node:test";
import assert from "node:assert/strict";
import { createDeckReveal } from "./deck-reveal.mjs";

function fixture() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  const changes = [];
  const callbacks = [];
  const controller = createDeckReveal({
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
  return { controller, advance, changes, timers, callbacks };
}

test("deck reveals after one uninterrupted second and retracts after two absent seconds", () => {
  const { controller, advance, changes, timers } = fixture();
  controller.setActive("pointer", true);
  advance(999);
  assert.equal(controller.expanded, false);
  advance(1);
  assert.equal(controller.expanded, true);
  advance(10000);
  assert.equal(controller.expanded, true);
  controller.setActive("pointer", false);
  advance(1999);
  assert.equal(controller.expanded, true);
  advance(1);
  assert.equal(controller.expanded, false);
  assert.deepEqual(changes, [{ value: true, at: 1000 }, { value: false, at: 13000 }]);
  assert.equal(timers.size, 0);
});

test("leaving before reveal cancels the dwell, and duplicate notifications do not restart it", () => {
  const { controller, advance, changes, timers } = fixture();
  controller.setActive("pointer", true);
  advance(999);
  controller.setActive("pointer", false);
  advance(10000);
  assert.deepEqual(changes, []);
  assert.equal(timers.size, 0);
  controller.setActive("pointer", true);
  advance(500);
  controller.setActive("pointer", true);
  advance(500);
  assert.equal(controller.expanded, true);
  controller.setActive("pointer", false);
  advance(1500);
  controller.setActive("pointer", false);
  advance(500);
  assert.equal(controller.expanded, false);
});

test("card dragging reveals immediately and keeps the full retraction delay after leaving", () => {
  const { controller, advance, changes, timers } = fixture();
  controller.setActive("drag", true);
  assert.equal(controller.expanded, true);
  assert.deepEqual(changes, [{ value: true, at: 0 }]);
  assert.equal(timers.size, 0);
  controller.setActive("drag", true);
  advance(10000);
  assert.deepEqual(changes, [{ value: true, at: 0 }]);
  controller.setActive("drag", false);
  advance(1999);
  assert.equal(controller.expanded, true);
  controller.setActive("drag", false);
  advance(1);
  assert.equal(controller.expanded, false);
  controller.setActive("drag", true);
  assert.equal(controller.expanded, true);
  assert.deepEqual(changes, [
    { value: true, at: 0 },
    { value: false, at: 12000 },
    { value: true, at: 12000 },
  ]);
});

test("dragging interrupts hover dwell and invalidates its timer and any pending retraction", () => {
  const { controller, advance, changes, timers, callbacks } = fixture();
  controller.setActive("pointer", true);
  const staleOpen = callbacks.at(-1);
  advance(250);
  controller.setActive("drag", true);
  assert.deepEqual(changes, [{ value: true, at: 250 }]);
  assert.equal(timers.size, 0);
  controller.dismiss();
  staleOpen();
  assert.equal(controller.expanded, false);
  controller.setActive("drag", false);
  controller.setActive("drag", true);
  assert.equal(controller.expanded, true);
  controller.setActive("drag", false);
  advance(3000);
  assert.equal(controller.expanded, true, "ordinary hovering still holds it open");
  controller.setActive("pointer", false);
  const staleClose = callbacks.at(-1);
  advance(1000);
  controller.setActive("drag", true);
  assert.equal(timers.size, 0);
  staleClose();
  assert.equal(controller.expanded, true);
  controller.setActive("drag", false);
  advance(1999);
  assert.equal(controller.expanded, true);
  advance(1);
  assert.equal(controller.expanded, false);
});

test("moving between deck targets cancels retraction and the next absence receives a full two seconds", () => {
  const { controller, advance, changes } = fixture();
  controller.setActive("pointer", true);
  advance(1000);
  controller.setActive("pointer", false);
  advance(200);
  controller.setActive("pointer", true);
  advance(7000);
  assert.deepEqual(changes, [{ value: true, at: 1000 }]);
  controller.setActive("pointer", false);
  advance(1999);
  assert.equal(controller.expanded, true);
  advance(1);
  assert.equal(controller.expanded, false);
});

test("pointer, focus, and drag occupancy collectively preserve dwell and expanded state", () => {
  const { controller, advance, timers } = fixture();
  controller.setActive("pointer", true);
  advance(500);
  controller.setActive("focus", true);
  controller.setActive("pointer", false);
  advance(500);
  assert.equal(controller.expanded, true);
  controller.setActive("drag", true);
  controller.setActive("focus", false);
  advance(10000);
  assert.equal(controller.expanded, true);
  assert.equal(timers.size, 0);
  controller.setActive("drag", false);
  advance(2000);
  assert.equal(controller.expanded, false);
});

test("explicit reveal is immediate, closes when unoccupied, and stays open while focused", () => {
  const { controller, advance, changes } = fixture();
  controller.reveal();
  assert.deepEqual(changes, [{ value: true, at: 0 }]);
  advance(1999);
  assert.equal(controller.expanded, true);
  advance(1);
  assert.equal(controller.expanded, false);
  controller.setActive("focus", true);
  controller.reveal();
  advance(12000);
  assert.equal(controller.expanded, true);
  controller.setActive("focus", false);
  advance(2000);
  assert.equal(controller.expanded, false);
});

test("dismiss cancels a pending reveal and does not reopen from repeated active events", () => {
  const { controller, advance, changes, timers } = fixture();
  controller.setActive("pointer", true);
  advance(500);
  controller.dismiss();
  controller.setActive("pointer", true);
  advance(10000);
  assert.deepEqual(changes, []);
  assert.equal(timers.size, 0);
  controller.setActive("pointer", false);
  controller.setActive("pointer", true);
  advance(1000);
  assert.equal(controller.expanded, true);
  controller.dismiss();
  assert.equal(controller.expanded, false);
  advance(10000);
  assert.equal(controller.expanded, false);
  controller.setActive("focus", true);
  advance(1000);
  assert.equal(controller.expanded, true);
});

test("obsolete queued callbacks cannot reopen or close a newer interaction", () => {
  const { controller, advance, callbacks } = fixture();
  controller.setActive("pointer", true);
  const staleOpen = callbacks.at(-1);
  controller.setActive("pointer", false);
  controller.setActive("pointer", true);
  staleOpen();
  assert.equal(controller.expanded, false);
  advance(1000);
  controller.setActive("pointer", false);
  const staleClose = callbacks.at(-1);
  controller.setActive("pointer", true);
  staleClose();
  assert.equal(controller.expanded, true);
});

test("dispose clears timers and makes every entry point and queued callback inert", () => {
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
    controller.setActive("focus", true);
    controller.setActive("drag", true);
    controller.reveal();
    controller.dismiss();
    for (const callback of callbacks) callback();
    advance(20000);
    assert.deepEqual(changes, before);
    assert.equal(timers.size, 0);
  }
});
