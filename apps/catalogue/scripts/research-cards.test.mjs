import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cardColors, cardFactions, cardImage, filterResearchCards, researchMetadata } from '../client/src/components/research-cards.mjs';

const groups = [{ id: 'plants', faction: 'plants' }, { id: 'zombies-blue', faction: 'zombies' }, { id: 'mana-support', faction: 'shared' }];
const cards = [
  { id: 'hybrid', name: 'Slitherhead', colors: ['B', 'G'], cmc: 1, type_line: 'Creature — Plant Zombie', oracle_text: 'Scavenge', research: { groups: ['plants'], factions: ['zombies'], crossover: true, manaNote: 'Either black or green.' } },
  { id: 'blue', name: 'Stitching', colors: ['U'], cmc: 3, type_line: 'Sorcery', oracle_text: 'Draw', research: { groups: ['zombies-blue'], note: 'Self mill' } },
  { id: 'land', name: 'Fixing Land', colors: [], cmc: 0, type_line: 'Land', oracle_text: 'Mana', research: { groups: ['mana-support'] } },
  { id: 'faces', name: 'Front // Back', cmc: 5, type_line: 'Creature // Creature', card_faces: [{ name: 'Front', colors: ['G'], oracle_text: 'Transform', image_uris: { normal: 'https://example.com/front' } }, { name: 'Back', colors: ['B'], oracle_text: 'Reanimate' }], research: { groups: ['plants'] } },
];
test('botanical Zombies belong only to Zombies while retaining botanical research tags', () => {
  assert.deepEqual([...cardFactions(cards[0], groups)], ['zombies']);
  assert.deepEqual(filterResearchCards(cards, groups, { faction: 'plants' }).map(c => c.id), ['faces']);
  assert.deepEqual(filterResearchCards(cards, groups, { group: 'plants' }).map(c => c.id), ['hybrid', 'faces']);
  assert.deepEqual(filterResearchCards(cards, groups, { faction: 'zombies' }).map(c => c.id), ['hybrid', 'blue']);
  assert.deepEqual(filterResearchCards(cards, groups, { group: 'zombies-blue' }).map(c => c.id), ['blue']);
});
test('card colors include hybrids and both faces, while colorless does not mean any mana identity', () => {
  assert.deepEqual(cardColors(cards[3]), ['G', 'B']);
  assert.deepEqual(filterResearchCards(cards, groups, { color: 'G' }).map(c => c.id), ['hybrid', 'faces']);
  assert.deepEqual(filterResearchCards(cards, groups, { color: 'C' }).map(c => c.id), ['land']);
});
test('search includes all faces and research notes with combined filters', () => {
  assert.deepEqual(filterResearchCards(cards, groups, { query: 'reanimate', mana: 'high' }).map(c => c.id), ['faces']);
  assert.deepEqual(filterResearchCards(cards, groups, { query: 'black green', crossover: true, kind: 'creature' }).map(c => c.id), ['hybrid']);
  assert.deepEqual(filterResearchCards(cards, groups, { query: 'self mill', kind: 'noncreature', mana: 'mid' }).map(c => c.id), ['blue']);
});
test('sorting is stable by name at equal mana and does not mutate the source', () => {
  assert.deepEqual(filterResearchCards(cards, groups, { sort: 'mana-asc' }).map(c => c.id), ['land', 'hybrid', 'blue', 'faces']);
  assert.equal(cards[0].id, 'hybrid');
  assert.equal(cardImage(cards[3]), 'https://example.com/front');
});
test('thematic undead alignment does not change a card’s actual creature types', () => {
  const card = { id: 'necro', name: 'The Necrobloom', colors: ['W', 'B', 'G'], cmc: 4, type_line: 'Legendary Creature — Plant', research: { groups: ['plants'], crossover: false, thematicCrossover: true, factions: ['zombies'] } };
  assert.deepEqual([...cardFactions(card, groups)], ['zombies']);
  assert.equal(researchMetadata(card).badge, 'Botanical undead · flavor');
  assert.equal(researchMetadata(cards[0]).badge, 'Botanical undead');
  assert.equal(filterResearchCards([card], groups, { crossover: true, faction: 'zombies' }).length, 1);
  assert.equal(filterResearchCards([card], groups, { faction: 'plants' }).length, 0);
  assert.equal(card.type_line, 'Legendary Creature — Plant');
  assert.equal(card.research.crossover, false);
});
test('all 13 botanical undead have explicit Zombie-only assignments in sources and the assembled catalogue', async () => {
  const read = async name => JSON.parse(await readFile(new URL(`../../../research/zombies-vs-plants/${name}`, import.meta.url), 'utf8'));
  const [catalogue, typed, allies, necrobloom] = await Promise.all(['cards.json', 'crossover-candidates.json', 'botanical-allies.json', 'necrobloom-candidate.json'].map(read));
  const sourceCards = [...typed.cards, ...allies.cards.filter(card => card.name === 'Skullbriar, the Walking Grave'), ...necrobloom.cards];
  assert.equal(typed.cards.length, 11);
  assert.equal(sourceCards.length, 13);
  const ids = new Set(sourceCards.map(card => card.oracle_id));
  const botanicalGroups = new Set(['plants', 'treefolk', 'fungi', 'botanical-allies']);
  for (const card of sourceCards) {
    assert.deepEqual(card.research.factions, ['zombies'], card.name);
    assert.ok(card.research.groups.some(group => botanicalGroups.has(group)), `${card.name}: preserves botanical taxonomy`);
    const assembled = catalogue.cards.find(candidate => candidate.oracle_id === card.oracle_id);
    assert.ok(assembled, `${card.name}: preserved candidate`);
    assert.deepEqual(assembled.research.factions, ['zombies'], card.name);
    assert.deepEqual(assembled.research.groups, card.research.groups, card.name);
    assert.equal(assembled.type_line, card.type_line, `${card.name}: preserves Oracle type`);
    assert.equal(assembled.oracle_text, card.oracle_text, `${card.name}: preserves Oracle rules`);
    assert.equal(assembled.scryfall_uri, card.scryfall_uri, `${card.name}: preserves provenance`);
  }
  const plants = filterResearchCards(catalogue.cards, catalogue.groups, { faction: 'plants' });
  assert.ok(plants.every(card => !ids.has(card.oracle_id)), 'no botanical undead leak into Plants');
  const zombies = filterResearchCards(catalogue.cards, catalogue.groups, { faction: 'zombies' });
  assert.equal(zombies.filter(card => ids.has(card.oracle_id)).length, 13);
  const featured = filterResearchCards(catalogue.cards, catalogue.groups, { crossover: true });
  assert.equal(featured.length, 13);
  assert.deepEqual(new Set(featured.map(card => card.oracle_id)), ids);
});
