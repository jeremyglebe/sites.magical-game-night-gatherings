const textFields = ['name', 'image_url', 'type_line', 'mana_cost', 'oracle_text', 'short_description', 'long_description', 'power', 'toughness', 'loyalty', 'scryfall_id', 'kind'];

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
