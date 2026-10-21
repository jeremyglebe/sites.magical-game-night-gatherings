/** One step per wheel gesture; ignore a trackpad's trailing momentum. */
export function createPileWheel({ threshold = 24, pause = 220, now = () => performance.now() } = {}) {
  let last = -Infinity, amount = 0, direction = 0, consumed = false;
  return {
    reset() { last = -Infinity; amount = 0; direction = 0; consumed = false; },
    step(delta, mode = 0) {
      if (!Number.isFinite(delta) || !delta) return 0;
      const time = now(), next = Math.sign(delta);
      if (time - last >= pause || next !== direction) {
        amount = 0;
        consumed = false;
      }
      last = time;
      direction = next;
      if (consumed) return 0;
      amount += Math.abs(delta) * (mode === 1 ? 16 : mode === 2 ? 160 : 1);
      if (amount < threshold) return 0;
      consumed = true;
      return direction;
    },
  };
}
