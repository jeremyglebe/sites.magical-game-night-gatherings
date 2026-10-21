import { cardFactions as genericFactions, filterCards } from './card-gallery.mjs';
export { COLOR_NAMES, cardColors, cardImage, cardFaces as researchFaces } from './card-gallery.mjs';

/** This catalogue's faction policy belongs here, not in the reusable gallery. */
export function researchMetadata(card) {
  const research = card.research || {};
  const isCrossover = !!(research.crossover || research.thematicCrossover);
  return { ...research, featured: isCrossover,
    badge: research.crossover ? 'Botanical undead' : research.thematicCrossover ? 'Botanical undead · flavor' : '',
    factions: research.factions || [],
  };
}
export const cardFactions = (card, groups) => genericFactions(researchMetadata(card), groups);
export function filterResearchCards(cards, groups, filters = {}) {
  return filterCards(cards, { ...filters, featured: filters.crossover ?? filters.featured, sort: !filters.sort || filters.sort === 'crossovers' ? 'featured' : filters.sort, groups, metadata: researchMetadata });
}
