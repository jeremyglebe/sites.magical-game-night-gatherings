const textFields = ['name', 'image_url', 'type_line', 'mana_cost', 'oracle_text', 'power', 'toughness', 'loyalty', 'scryfall_id', 'kind'];

// A historical reveal is a saved reference, never a handle to today's card.
// Keep only display fields, including when reading older or imported logs.
export function revealedCardSnapshots(change) {
  if (change?.type !== 'reveal' || !Array.isArray(change.revealedCards)) return [];
  return change.revealedCards.filter(card => card && typeof card === 'object' && typeof card.name === 'string' && card.name.trim()).map(card => {
    const result = {};
    for (const key of textFields) if (typeof card[key] === 'string' || (['power', 'toughness', 'loyalty'].includes(key) && Number.isFinite(card[key]))) result[key] = card[key];
    if (typeof card.token === 'boolean') result.token = card.token;
    if (Array.isArray(card.rulings)) result.rulings = card.rulings.flatMap(ruling => {
      if (typeof ruling === 'string') return [ruling];
      if (!ruling || typeof ruling !== 'object') return [];
      const saved = {};
      for (const key of ['published_at', 'comment', 'text', 'source']) if (typeof ruling[key] === 'string') saved[key] = ruling[key];
      return saved.comment || saved.text ? [saved] : [];
    });
    if (card.rulings_cache && typeof card.rulings_cache === 'object') {
      result.rulings_cache = {};
      for (const key of ['status', 'fetched_at', 'source', 'uri']) if (typeof card.rulings_cache[key] === 'string') result.rulings_cache[key] = card.rulings_cache[key];
    }
    return result;
  });
}
function imageURL(card) {
  try {
    const url = new URL(card.image_url);
    return url.protocol === 'https:' && url.hostname === 'cards.scryfall.io' ? url.href : null;
  } catch { return null; }
}

/** Append clickable historical card references; returns the number shown. */
export function appendRevealedCards(parent, change, { onInspect } = {}) {
  const cards = revealedCardSnapshots(change);
  if (!cards.length) return 0;
  const doc = parent.ownerDocument;
  const row = doc.createElement('div');
  row.className = 'revealed-cards';
  row.setAttribute('aria-label', 'Revealed cards');
  for (const card of cards) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'revealed-card';
    button.setAttribute('aria-label', `Inspect revealed ${card.name}`);
    button.title = `Inspect ${card.name} · as revealed`;
    const art = doc.createElement('span');
    art.className = 'revealed-card-art';
    const fallback = doc.createElement('span');
    fallback.className = 'revealed-card-fallback';
    fallback.textContent = card.name;
    art.append(fallback);
    const source = imageURL(card);
    if (source) {
      const image = doc.createElement('img');
      image.src = source;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.draggable = false;
      image.addEventListener('error', () => { image.remove(); fallback.hidden = false; }, { once: true });
      fallback.hidden = true;
      art.append(image);
    }
    const name = doc.createElement('span');
    name.className = 'revealed-card-name';
    name.textContent = card.name;
    button.append(art, name);
    if (typeof onInspect === 'function') button.addEventListener('click', () => onInspect(structuredClone(card)));
    else button.disabled = true;
    row.append(button);
  }
  parent.append(row);
  return cards.length;
}
