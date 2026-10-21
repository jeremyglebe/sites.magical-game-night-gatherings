/** Presentation groups only: attachment relationships and controllers stay unchanged. */
export function battlefieldPiles(cards = []) {
  const byId = new Map();
  for (const card of cards) {
    if (card?.id && !byId.has(card.id)) byId.set(card.id, card);
  }
  const roots = new Map();
  for (const id of byId.keys()) {
    if (roots.has(id)) continue;
    const path = [], visited = new Map();
    let current = id, root;
    while (true) {
      if (roots.has(current)) { root = roots.get(current); break; }
      if (visited.has(current)) {
        // Legacy cycles have no true root; choose a stable representative.
        root = path.slice(visited.get(current)).sort()[0];
        break;
      }
      visited.set(current, path.length);
      path.push(current);
      const parent = byId.get(current).attached_to;
      if (!parent || !byId.has(parent)) { root = current; break; }
      current = parent;
    }
    for (const item of path) roots.set(item, root);
  }
  const groups = new Map();
  for (const card of byId.values()) {
    const id = roots.get(card.id);
    if (!groups.has(id)) groups.set(id, { root: byId.get(id), cards: [] });
    groups.get(id).cards.push(card);
  }
  return [...groups.values()].map(({ root, cards: members }) => ({
    root,
    cards: [root, ...members.filter((card) => card.id !== root.id)],
  }));
}

/** Keep stale preferences harmless when cards enter or leave a pile. */
export function orderedPileCards(pile, preferredIds = []) {
  const remaining = new Map((pile?.cards || []).map((card) => [card.id, card]));
  const ordered = [];
  for (const id of Array.isArray(preferredIds) ? preferredIds : []) {
    if (!remaining.has(id)) continue;
    ordered.push(remaining.get(id));
    remaining.delete(id);
  }
  return [...ordered, ...remaining.values()];
}
