// All dimensions and thicknesses are millimeters. Capacities use depth only;
// face fit is reported separately so a width problem cannot hide the calculation.
export const BOX_PRESETS = [
  {
    id: "apacali",
    label: "APACALI 24-pack box",
    width: 68.58,
    height: 96.52,
    depth: 20.828,
    basis: "external",
    wall: 1.2,
    note: "Estimated interior from advertised exterior dimensions and 1.2 mm walls. The listing's interior/exterior descriptions conflict; measure a sample.",
    source: "https://www.amazon.com/Playing-Plastic-Organizer-Storage-3-8x2-7x0-94/dp/B09CH5VK1G",
  },
  {
    id: "burger30",
    label: "Burger Tokens 30S",
    width: 67,
    height: 95.5,
    depth: 18.5,
    basis: "internal",
    wall: 0,
    note: "Manufacturer's internal dimensions. The 30 sleeved label is not a guarantee of 30 double-sleeved cards.",
    source: "https://burgertokens.com/products/perfect-fit-deckboxes",
  },
  {
    id: "burger37",
    label: "Burger Tokens 37S",
    width: 67,
    height: 95.5,
    depth: 22.5,
    basis: "internal",
    wall: 0,
    note: "Manufacturer's internal dimensions. The 37 sleeved label is not a guarantee of 37 double-sleeved cards.",
    source: "https://burgertokens.com/products/perfect-fit-deckboxes",
  },
];

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);
const isPositive = (value) => isFiniteNumber(value) && value > 0;
const isNonnegative = (value) => isFiniteNumber(value) && value >= 0;
const isCount = (value) => Number.isSafeInteger(value) && value >= 0;

// Correct tiny binary rounding errors at a boundary, without adding a physical
// allowance to the user's measurements.
const nearlyEqual = (a, b) =>
  Math.abs(a - b) <= Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)) * 8;
const within = (value, limit) => value <= limit || nearlyEqual(value, limit);
const difference = (a, b) => nearlyEqual(a, b) ? 0 : a - b;

export function thicknessFromMeasurement(count, depth) {
  if (!isCount(count) || count === 0 || !isPositive(depth)) return null;
  const thickness = depth / count;
  return isPositive(thickness) ? thickness : null;
}

function inspectDimensions(box) {
  const errors = [];
  if (!isRecord(box)) return { errors: ["Enter the box dimensions."], interior: null };
  for (const dimension of ["width", "height", "depth"]) {
    if (!isPositive(box[dimension]))
      errors.push(`Box ${dimension} must be a positive finite number.`);
  }
  if (box.basis !== "internal" && box.basis !== "external")
    errors.push("Choose internal or external box dimensions.");
  const wall = box.basis === "external" && box.wall !== undefined ? box.wall : 0;
  if (!isNonnegative(wall))
    errors.push("Wall thickness must be a nonnegative finite number.");
  if (errors.length) return { errors, interior: null };

  const deduction = box.basis === "external" ? 2 * wall : 0;
  const interior = {
    width: box.width - deduction,
    height: box.height - deduction,
    depth: box.depth - deduction,
  };
  if (Object.values(interior).some((value) => !isPositive(value)))
    errors.push("The walls must leave positive interior width, height, and depth.");
  return { errors, interior: errors.length ? null : interior };
}

export function interiorDimensions(box) {
  return inspectDimensions(box).interior;
}

function invalidResult(errors) {
  return {
    valid: false,
    errors,
    interior: null,
    faceFits: null,
    rotated: false,
    stack: null,
    requiredDepth: null,
    usableDepth: null,
    capacity: null,
    remainingDepth: null,
    extraCapacity: null,
    fits: "no",
  };
}

function checkThicknessRange(min, max, label, errors) {
  if (!isPositive(min) || !isPositive(max)) {
    errors.push(`${label} thicknesses must be positive finite numbers.`);
  } else if (min > max) {
    errors.push(`${label} minimum thickness cannot exceed the maximum.`);
  }
}

function capacityAt(depth, thickness) {
  const ratio = Math.max(0, depth) / thickness;
  if (!Number.isFinite(ratio) || ratio > Number.MAX_SAFE_INTEGER) return null;
  const nearest = Math.round(ratio);
  return nearlyEqual(ratio, nearest) ? nearest : Math.floor(ratio);
}

export function calculateStorage(input) {
  if (!isRecord(input)) return invalidResult(["Enter the card and box measurements."]);
  const {
    count,
    thicknessMin,
    thicknessMax,
    cardWidth,
    cardHeight,
    box,
    clearance = 0,
    padding = 0,
    extras,
  } = input;
  const { errors, interior } = inspectDimensions(box);
  if (!isCount(count)) errors.push("Card count must be a nonnegative whole number.");
  checkThicknessRange(thicknessMin, thicknessMax, "Card", errors);
  if (!isPositive(cardWidth) || !isPositive(cardHeight))
    errors.push("Sleeved card width and height must be positive finite numbers.");
  if (!isNonnegative(clearance))
    errors.push("Removal clearance must be a nonnegative finite number.");
  if (!isNonnegative(padding))
    errors.push("Padding must be a nonnegative finite number.");

  let extraCount = 0;
  let extraMin = 0;
  let extraMax = 0;
  if (extras !== undefined) {
    if (!isRecord(extras)) {
      errors.push("Enter the extra cards or inserts as a count and thickness range.");
    } else {
      if (!isCount(extras.count))
        errors.push("Extra item count must be a nonnegative whole number.");
      extraCount = extras.count;
      if (extraCount > 0) {
        checkThicknessRange(extras.thicknessMin, extras.thicknessMax, "Extra item", errors);
        extraMin = extras.thicknessMin;
        extraMax = extras.thicknessMax;
      }
    }
  }
  if (errors.length) return invalidResult(errors);

  const fixedExtras = { min: extraCount * extraMin, max: extraCount * extraMax };
  const margins = clearance + padding;
  const stack = {
    min: count * thicknessMin + fixedExtras.min,
    max: count * thicknessMax + fixedExtras.max,
  };
  const requiredDepth = { min: stack.min + margins, max: stack.max + margins };
  if ([margins, ...Object.values(stack), ...Object.values(requiredDepth)].some((value) => !Number.isFinite(value)))
    return invalidResult(["The measurements are too large to calculate reliably."]);

  const depthAfterMargins = interior.depth - margins;
  const capacity = {
    min: capacityAt(depthAfterMargins - fixedExtras.max, thicknessMax),
    max: capacityAt(depthAfterMargins - fixedExtras.min, thicknessMin),
  };
  if (capacity.min === null || capacity.max === null)
    return invalidResult(["The capacity is too large to calculate reliably. Check the measurements and units."]);

  const direct = within(cardWidth, interior.width) && within(cardHeight, interior.height);
  const turned = within(cardHeight, interior.width) && within(cardWidth, interior.height);
  const faceFits = direct || turned;
  const fits = !faceFits || !within(requiredDepth.min, interior.depth)
    ? "no"
    : within(requiredDepth.max, interior.depth) ? "yes" : "possible";

  return {
    valid: true,
    errors: [],
    interior,
    faceFits,
    rotated: !direct && turned,
    stack,
    requiredDepth,
    usableDepth: Math.max(0, depthAfterMargins),
    capacity,
    remainingDepth: {
      min: difference(interior.depth, requiredDepth.max),
      max: difference(interior.depth, requiredDepth.min),
    },
    extraCapacity: {
      min: Math.max(0, capacity.min - count),
      max: Math.max(0, capacity.max - count),
    },
    fits,
  };
}
