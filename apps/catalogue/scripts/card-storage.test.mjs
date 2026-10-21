import test from "node:test";
import assert from "node:assert/strict";
import {
  BOX_PRESETS,
  calculateStorage,
  interiorDimensions,
  thicknessFromMeasurement,
} from "../client/src/components/card-storage.mjs";

const preset = (id) => BOX_PRESETS.find((box) => box.id === id);
const base = {
  count: 20,
  thicknessMin: 0.5,
  thicknessMax: 0.53,
  cardWidth: 66,
  cardHeight: 92,
  box: preset("burger30"),
};
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} should equal ${expected}`);

test("measured stack thickness derives a per-card value without coercing missing inputs", () => {
  assert.equal(thicknessFromMeasurement(20, 10.6), 0.53);
  for (const [count, depth] of [[0, 10], [-1, 10], [1.5, 10], [20, 0], ["", 10], [20, null], [20, Infinity], ["20", 10]])
    assert.equal(thicknessFromMeasurement(count, depth), null);
});

test("external dimensions subtract both walls; internal dimensions need no deduction", () => {
  const inside = interiorDimensions(preset("apacali"));
  close(inside.width, 66.18);
  close(inside.height, 94.12);
  close(inside.depth, 18.428);
  assert.deepEqual(interiorDimensions({ ...preset("burger30"), wall: 1.2 }), {
    width: 67, height: 95.5, depth: 18.5,
  });
  assert.equal(interiorDimensions({ width: 2, height: 10, depth: 10, basis: "external", wall: 1 }), null);
  assert.equal(interiorDimensions({ ...preset("burger30"), width: "" }), null);
  assert.equal(interiorDimensions({ ...preset("burger30"), basis: "external", wall: null }), null);
});

test("historical handover ranges retain correct depth arithmetic", () => {
  const expected = [
    ["apacali", [34, 36], [26, 33]],
    ["burger30", [34, 37], [26, 33]],
    ["burger37", [42, 45], [32, 40]],
  ];
  for (const [id, compressed, uncompressed] of expected) {
    const dry = calculateStorage({ ...base, box: preset(id) });
    const played = calculateStorage({ ...base, box: preset(id), thicknessMin: 0.55, thicknessMax: 0.7 });
    assert.deepEqual(Object.values(dry.capacity), compressed);
    assert.deepEqual(Object.values(played.capacity), uncompressed);
  }
});

test("published 0.68 and 0.72 mm benchmarks calculate current capacities separately", () => {
  for (const [id, capacities, remaining] of [
    ["apacali", [27, 25], [1.428, 0.428]],
    ["burger30", [27, 25], [1.5, 0.5]],
    ["burger37", [33, 31], [5.5, 4.5]],
  ]) {
    for (const [index, thickness] of [0.68, 0.72].entries()) {
      const result = calculateStorage({ ...base, count: 25, box: preset(id), thicknessMin: thickness, thicknessMax: thickness });
      assert.equal(result.valid, true);
      assert.deepEqual(result.capacity, { min: capacities[index], max: capacities[index] });
      close(result.stack.min, index === 0 ? 17 : 18);
      close(result.remainingDepth.min, remaining[index]);
      close(result.remainingDepth.max, remaining[index]);
    }
  }
});

test("20 and 25 card stacks preserve both ends of the free-depth range", () => {
  const cases = [
    [20, 0.5, 0.53, 7.9, 8.5],
    [20, 0.55, 0.7, 4.5, 7.5],
    [25, 0.5, 0.53, 5.25, 6],
    [25, 0.55, 0.7, 1, 4.75],
  ];
  for (const [count, thicknessMin, thicknessMax, min, max] of cases) {
    const result = calculateStorage({ ...base, count, thicknessMin, thicknessMax });
    close(result.remainingDepth.min, min);
    close(result.remainingDepth.max, max);
    assert.equal(result.fits, "yes");
  }
});

test("extras, padding, and removal clearance reserve depth before core-card capacity", () => {
  const result = calculateStorage({
    ...base,
    box: { ...base.box, depth: 20 },
    thicknessMin: 0.5,
    thicknessMax: 0.6,
    padding: 2,
    clearance: 1,
    extras: { count: 3, thicknessMin: 0.3, thicknessMax: 0.4 },
  });
  assert.deepEqual(result.stack, { min: 10.9, max: 13.2 });
  assert.deepEqual(result.requiredDepth, { min: 13.9, max: 16.2 });
  assert.equal(result.usableDepth, 17);
  assert.deepEqual(result.capacity, { min: 26, max: 32 });
  assert.deepEqual(result.extraCapacity, { min: 6, max: 12 });
  close(result.remainingDepth.min, 3.8);
  close(result.remainingDepth.max, 6.1);
});

test("zero core cards remain a valid capacity inquiry and zero extras need no thickness", () => {
  const result = calculateStorage({ ...base, count: 0, extras: { count: 0 } });
  assert.equal(result.valid, true);
  assert.deepEqual(result.stack, { min: 0, max: 0 });
  assert.deepEqual(result.remainingDepth, { min: 18.5, max: 18.5 });
  assert.deepEqual(result.extraCapacity, result.capacity);
  assert.equal(result.fits, "yes");
});

test("zero extras ignore hidden invalid thickness fields; positive extras still validate them", () => {
  for (const range of [
    { thicknessMin: "", thicknessMax: 0.3 },
    { thicknessMin: 0.3, thicknessMax: null },
    { thicknessMin: NaN, thicknessMax: Infinity },
    { thicknessMin: 0.4, thicknessMax: 0.3 },
    { thicknessMin: -1, thicknessMax: 0 },
  ]) {
    const withoutExtras = calculateStorage({ ...base, extras: { count: 0, ...range } });
    assert.equal(withoutExtras.valid, true);
    assert.deepEqual(withoutExtras.capacity, { min: 34, max: 37 });
    assert.equal(calculateStorage({ ...base, extras: { count: 1, ...range } }).valid, false);
  }
});

test("internal dimensions ignore hidden invalid wall values; external dimensions still validate them", () => {
  for (const wall of ["", null, NaN, Infinity, -1]) {
    const internalBox = { ...base.box, basis: "internal", wall };
    const result = calculateStorage({ ...base, box: internalBox });
    assert.equal(result.valid, true);
    assert.deepEqual(result.interior, { width: 67, height: 95.5, depth: 18.5 });
    assert.deepEqual(interiorDimensions(internalBox), result.interior);
    const externalBox = { ...internalBox, basis: "external" };
    assert.equal(calculateStorage({ ...base, box: externalBox }).valid, false);
    assert.equal(interiorDimensions(externalBox), null);
  }
});

test("overflow preserves negative remaining space but never negative capacities", () => {
  const result = calculateStorage({
    ...base,
    extras: { count: 100, thicknessMin: 0.5, thicknessMax: 0.6 },
  });
  assert.equal(result.valid, true);
  assert.equal(result.fits, "no");
  assert.deepEqual(result.capacity, { min: 0, max: 0 });
  assert.deepEqual(result.extraCapacity, { min: 0, max: 0 });
  close(result.remainingDepth.min, -52.1);
  close(result.remainingDepth.max, -41.5);
  const paddingOverflow = calculateStorage({ ...base, padding: 20 });
  assert.equal(paddingOverflow.usableDepth, 0);
  assert.deepEqual(paddingOverflow.capacity, { min: 0, max: 0 });
  assert.equal(paddingOverflow.fits, "no");
});

test("face fit allows a 90 degree rotation and remains separate from depth capacity", () => {
  const rotated = calculateStorage({ ...base, cardWidth: 92, cardHeight: 66 });
  assert.equal(rotated.faceFits, true);
  assert.equal(rotated.rotated, true);
  assert.equal(rotated.fits, "yes");
  const wide = calculateStorage({ ...base, cardWidth: 68 });
  assert.equal(wide.faceFits, false);
  assert.equal(wide.rotated, false);
  assert.equal(wide.fits, "no");
  assert.deepEqual(wide.capacity, { min: 34, max: 37 });
});

test("uncertain stack thickness distinguishes possible fit from certain fit and overflow", () => {
  const uncertain = calculateStorage({ ...base, count: 36 });
  assert.equal(uncertain.fits, "possible");
  assert.equal(calculateStorage({ ...base, count: 38 }).fits, "no");
  const exact = calculateStorage({ ...base, count: 37, thicknessMax: 0.5 });
  assert.equal(exact.fits, "yes");
  assert.deepEqual(exact.remainingDepth, { min: 0, max: 0 });
});

test("binary floating point does not discard a card at an exact decimal boundary", () => {
  const result = calculateStorage({
    ...base,
    count: 3,
    thicknessMin: 0.1,
    thicknessMax: 0.1,
    box: { ...base.box, depth: 0.3 },
  });
  assert.deepEqual(result.capacity, { min: 3, max: 3 });
  assert.equal(result.fits, "yes");
  assert.deepEqual(result.remainingDepth, { min: 0, max: 0 });
});

test("missing, blank, negative, nonfinite, reversed, and fractional inputs are rejected", () => {
  const invalid = [
    null,
    {},
    { count: "" },
    { count: null },
    { count: 1.5 },
    { count: -1 },
    { thicknessMin: 0 },
    { thicknessMax: Infinity },
    { thicknessMin: 0.7, thicknessMax: 0.5 },
    { cardWidth: NaN },
    { cardHeight: "" },
    { clearance: null },
    { padding: -1 },
    { box: { ...base.box, basis: "unknown" } },
    { box: { ...base.box, width: 0 } },
    { box: { ...base.box, depth: 2, basis: "external", wall: 1 } },
    { extras: null },
    { extras: { count: 0.5, thicknessMin: 0.3, thicknessMax: 0.4 } },
    { extras: { count: 1, thicknessMin: null, thicknessMax: 0.4 } },
    { extras: { count: 1, thicknessMin: 0.4, thicknessMax: 0.3 } },
  ];
  for (const input of invalid) {
    const result = calculateStorage(input === null ? null : Object.keys(input).length ? { ...base, ...input } : {});
    assert.equal(result.valid, false, JSON.stringify(input));
    assert.ok(result.errors.length > 0);
    assert.equal(result.capacity, null);
    assert.equal(result.stack, null);
  }
});

test("arithmetic overflow and unrepresentable capacities return errors instead of infinity", () => {
  for (const input of [
    { ...base, thicknessMin: 1e308, thicknessMax: 1e308 },
    { ...base, thicknessMin: 1e-320, thicknessMax: 1e-320 },
    { ...base, clearance: 1e308, padding: 1e308 },
  ]) {
    const result = calculateStorage(input);
    assert.equal(result.valid, false);
    assert.equal(result.capacity, null);
    assert.equal(result.remainingDepth, null);
  }
});
