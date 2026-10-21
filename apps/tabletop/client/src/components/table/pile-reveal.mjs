/** Coordinate activity across all items and interaction channels in a pile. */
export function createPileReveal({
  openDelay = 1000,
  closeDelay = 2000,
  immediateDrag = true,
  onChange = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const active = new Set();
  let expanded = false;
  let disposed = false;
  let openTimer;
  let closeTimer;
  let openVersion = 0;
  let closeVersion = 0;

  function cancelOpen() {
    openVersion += 1;
    if (openTimer !== undefined) clearTimer(openTimer);
    openTimer = undefined;
  }

  function cancelClose() {
    closeVersion += 1;
    if (closeTimer !== undefined) clearTimer(closeTimer);
    closeTimer = undefined;
  }

  function change(value) {
    if (disposed || expanded === value) return;
    expanded = value;
    onChange(value);
  }

  function scheduleOpen() {
    if (disposed || expanded || openTimer !== undefined) return;
    const version = ++openVersion;
    openTimer = setTimer(() => {
      if (disposed || version !== openVersion || !active.size) return;
      openTimer = undefined;
      change(true);
    }, openDelay);
  }

  function scheduleClose() {
    if (disposed || !expanded || active.size || closeTimer !== undefined) return;
    const version = ++closeVersion;
    closeTimer = setTimer(() => {
      if (disposed || version !== closeVersion || active.size) return;
      closeTimer = undefined;
      change(false);
    }, closeDelay);
  }

  return {
    get expanded() {
      return expanded;
    },
    setActive(channel, value) {
      if (disposed) return;
      const present = Boolean(value);
      if (active.has(channel) === present) return;
      if (present) {
        active.add(channel);
        cancelClose();
        if (channel === "drag" && immediateDrag) {
          cancelOpen();
          change(true);
        } else {
          scheduleOpen();
        }
      } else {
        active.delete(channel);
        if (!active.size) {
          cancelOpen();
          scheduleClose();
        }
      }
    },
    reveal() {
      if (disposed) return;
      cancelOpen();
      cancelClose();
      change(true);
      scheduleClose();
    },
    dismiss() {
      if (disposed) return;
      cancelOpen();
      cancelClose();
      change(false);
      // Existing occupancy cannot reopen it until a new activity transition.
    },
    reset() {
      if (disposed) return;
      cancelOpen();
      cancelClose();
      active.clear();
      change(false);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelOpen();
      cancelClose();
      active.clear();
    },
  };
}
