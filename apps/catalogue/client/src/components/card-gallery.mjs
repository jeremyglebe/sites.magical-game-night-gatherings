export const COLOR_NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless' };
export const DEFAULT_FILTERS = Object.freeze({ query: '', faction: '', group: '', color: '', kind: '', mana: '', featured: false, sort: 'name' });
export const defaultCardMetadata = card => card.gallery || card.research || {};
export const cardFaces = card => card?.card_faces?.length ? card.card_faces : card ? [card] : [];
export function cardImage(card) {
  const images = card?.image_uris || card?.card_faces?.find(face => face.image_uris)?.image_uris;
  return images?.normal || images?.large || images?.small || '';
}
export const cardColors = card => [...new Set(card.colors ?? card.card_faces?.flatMap(face => face.colors || []) ?? [])];
export const manaCost = card => card.mana_cost || card.card_faces?.map(face => face.mana_cost).filter(Boolean).join(' // ') || '—';
export const colorLabel = card => cardColors(card).map(color => COLOR_NAMES[color] || color).join(' / ') || 'Colorless';
export function cardFactions(metadata, groups) {
  // Explicit editorial alignment takes precedence over taxonomic group inference.
  if (metadata.factions?.length) return new Set(metadata.factions.filter(Boolean));
  return new Set((metadata.groups || []).map(id => groups.find(group => group.id === id)?.faction).filter(Boolean));
}

/** Hidden controls never retain an invisible constraint. The caller owns any explicit pre-filtering of cards. */
export function effectiveCardFilters(filters = {}, options = {}) {
  const { searchable = true, filterable = true, sortable = true, showFeatured = false, groups = [], factions = [], defaultSort = 'name' } = options;
  const result = { ...DEFAULT_FILTERS, sort: defaultSort };
  if (searchable) result.query = String(filters.query || '');
  if (filterable) {
    result.faction = factions.some(faction => faction.id === filters.faction) ? filters.faction : '';
    result.group = groups.some(group => group.id === filters.group && (!result.faction || group.faction === result.faction)) ? filters.group : '';
    result.color = COLOR_NAMES[filters.color] ? filters.color : '';
    result.kind = ['creature', 'noncreature'].includes(filters.kind) ? filters.kind : '';
    result.mana = ['low', 'mid', 'high'].includes(filters.mana) ? filters.mana : '';
    result.featured = showFeatured && !!filters.featured;
  }
  const allowedSorts = showFeatured ? ['featured', 'name', 'mana-asc', 'mana-desc'] : ['name', 'mana-asc', 'mana-desc'];
  if (sortable && allowedSorts.includes(filters.sort)) result.sort = filters.sort;
  if (!allowedSorts.includes(result.sort)) result.sort = 'name';
  return result;
}

export function filterCards(cards, { groups = [], metadata = defaultCardMetadata, ...filters } = {}) {
  const words = (filters.query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  return cards.filter(card => {
    const meta = metadata(card) || {};
    if (filters.faction && !cardFactions(meta, groups).has(filters.faction)) return false;
    if (filters.group && !(meta.groups || []).includes(filters.group)) return false;
    if (filters.featured && !meta.featured) return false;
    const colors = cardColors(card);
    if (filters.color === 'C' ? colors.length > 0 : filters.color && !colors.includes(filters.color)) return false;
    const creature = card.type_line?.includes('Creature');
    if (filters.kind === 'creature' && !creature || filters.kind === 'noncreature' && creature) return false;
    if (filters.mana === 'low' && !(card.cmc <= 2) || filters.mana === 'mid' && !(card.cmc >= 3 && card.cmc <= 4) || filters.mana === 'high' && !(card.cmc >= 5)) return false;
    const haystack = [card.name, card.type_line, card.oracle_text, card.flavor_text, ...cardFaces(card).flatMap(face => [face.name, face.type_line, face.oracle_text, face.flavor_text]), meta.note, meta.caution, meta.manaNote, ...(meta.roles || [])].join(' ').toLowerCase();
    return words.every(word => haystack.includes(word));
  }).sort((a, b) => {
    if (filters.sort === 'mana-asc' && a.cmc !== b.cmc) return a.cmc - b.cmc;
    if (filters.sort === 'mana-desc' && a.cmc !== b.cmc) return b.cmc - a.cmc;
    if (filters.sort === 'featured' && !!metadata(a)?.featured !== !!metadata(b)?.featured) return metadata(a)?.featured ? -1 : 1;
    return a.name.localeCompare(b.name, 'en');
  });
}
export function paginateCards(cards, page = 1, pageSize = 24) {
  const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : Math.max(cards.length, 1);
  const pages = Math.max(1, Math.ceil(cards.length / size));
  const current = Math.min(pages, Math.max(1, Number.isFinite(Number(page)) ? Math.floor(Number(page)) : 1));
  const start = (current - 1) * size;
  return { cards: cards.slice(start, start + size), page: current, pages, start: cards.length ? start + 1 : 0, end: Math.min(start + size, cards.length) };
}
export function savedRulings(card, provided) {
  const value = provided ?? card?.rulings;
  return Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : null;
}
