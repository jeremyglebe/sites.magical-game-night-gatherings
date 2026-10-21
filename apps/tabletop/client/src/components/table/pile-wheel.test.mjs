import test from "node:test";
import assert from "node:assert/strict";
import { createPileWheel } from "./pile-wheel.mjs";

test("trackpad momentum advances one card per deliberate gesture", () => {
  let now = 0;
  const wheel = createPileWheel({ now: () => now });
  assert.equal(wheel.step(10), 0);
  now += 16;
  assert.equal(wheel.step(10), 0);
  now += 16;
  assert.equal(wheel.step(4), 1);
  for (const delta of [90, 60, 30, 12, 6, 2]) {
    now += 16;
    assert.equal(wheel.step(delta), 0);
  }
  now += 220;
  assert.equal(wheel.step(24), 1);
});

test("reversing the wheel selects the previous card and normalizes line/page deltas", () => {
  const wheel = createPileWheel({ now: () => 0 });
  assert.equal(wheel.step(3, 1), 1);
  assert.equal(wheel.step(-1, 1), 0);
  assert.equal(wheel.step(-1, 1), -1);
  assert.equal(wheel.step(-3, 1), 0);
  assert.equal(wheel.step(1, 2), 1);
});

test("reset clears an old pile's gesture and invalid wheel values are inert", () => {
  const wheel = createPileWheel({ now: () => 0 });
  assert.equal(wheel.step(100), 1);
  wheel.reset();
  for (const value of [0, NaN, Infinity, undefined]) assert.equal(wheel.step(value), 0);
  assert.equal(wheel.step(24), 1);
});
