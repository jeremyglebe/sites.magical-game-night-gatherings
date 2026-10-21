import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { DEFAULT_FILTERS, effectiveCardFilters, filterCards, paginateCards, savedRulings } from '../client/src/components/card-gallery.mjs';

const cards = [
  { id: 'a', name: 'A Sprout', colors: ['G'], cmc: 1, type_line: 'Creature — Plant', oracle_text: 'Grow.', gallery: { groups: ['garden'], note: 'A seedling', featured: true } },
  { id: 'b', name: 'B Charm', colors: ['U'], cmc: 3, type_line: 'Instant', oracle_text: 'Draw a card.', gallery: { groups: ['spells'] } },
  { id: 'c', name: 'C Ground', colors: [], cmc: 0, type_line: 'Land', gallery: { groups: ['garden'] } },
];
const groups = [{ id: 'garden', label: 'Garden', faction: 'green-team' }, { id: 'spells', label: 'Spells', faction: 'blue-team' }];
const factions = [{ id: 'green-team', label: 'Green team' }, { id: 'blue-team', label: 'Blue team' }];
const staleFilters = { query: 'missing', group: 'garden', faction: 'green-team', color: 'G', kind: 'creature', mana: 'high', featured: true, sort: 'mana-desc' };

test('hidden controls ignore stale filters and a hidden featured option does not constrain results', () => {
  const effective = effectiveCardFilters(staleFilters, { searchable: false, filterable: false, sortable: false, groups, factions });
  assert.deepEqual(effective, DEFAULT_FILTERS);
  assert.equal(filterCards(cards, effective).length, 3);
  assert.equal(effectiveCardFilters({ featured: true }).featured, false);
  assert.equal(effectiveCardFilters({}, { defaultSort: 'mana-desc' }).sort, 'mana-desc');
});
test('search-only and filters-only modes are independent; invalid or incompatible groups are ignored', () => {
  const search = effectiveCardFilters({ ...staleFilters, query: 'charm' }, { filterable: false });
  assert.deepEqual(filterCards(cards, search).map(card => card.id), ['b']);
  const filter = effectiveCardFilters({ query: 'missing', color: 'G' }, { searchable: false });
  assert.deepEqual(filterCards(cards, filter).map(card => card.id), ['a']);
  assert.equal(effectiveCardFilters({ faction: 'green-team', group: 'spells' }, { groups, factions }).group, '');
  assert.equal(effectiveCardFilters({ group: 'unknown', faction: 'unknown' }, { groups, factions }).faction, '');
});
test('generic configured factions, metadata, featured cards, and all-face search are independent of research data', () => {
  assert.deepEqual(filterCards(cards, { groups, faction: 'green-team' }).map(card => card.id), ['a', 'c']);
  assert.deepEqual(filterCards(cards, { featured: true }).map(card => card.id), ['a']);
  assert.deepEqual(filterCards(cards, { metadata: card => ({ featured: card.id === 'b' }), featured: true }).map(card => card.id), ['b']);
  const twoFaces = { id: 'f', name: 'Front // Back', card_faces: [{ name: 'Front', oracle_text: 'Day' }, { name: 'Back', oracle_text: 'Night', flavor_text: 'A secret.' }] };
  assert.equal(filterCards([twoFaces], { query: 'night secret' }).length, 1);
});
test('explicit editorial factions override inferred group factions without losing group filters', () => {
  const assigned = { ...cards[0], gallery: { ...cards[0].gallery, factions: ['blue-team'] } };
  assert.equal(filterCards([assigned], { groups, faction: 'green-team' }).length, 0);
  assert.equal(filterCards([assigned], { groups, faction: 'blue-team' }).length, 1);
  assert.equal(filterCards([assigned], { groups, group: 'garden' }).length, 1);
  const inferred = { ...cards[0], gallery: { ...cards[0].gallery, factions: [] } };
  assert.equal(filterCards([inferred], { groups, faction: 'green-team' }).length, 1);
});
test('pagination clamps stale page numbers and can be disabled', () => {
  assert.deepEqual(paginateCards(cards, 88, 2), { cards: [cards[2]], page: 2, pages: 2, start: 3, end: 3 });
  assert.equal(paginateCards(cards, -10, 2).page, 1);
  assert.equal(paginateCards(cards, 88, 0).cards.length, 3);
  assert.deepEqual(paginateCards([], 9), { cards: [], page: 1, pages: 1, start: 0, end: 0 });
});
test('saved rulings distinguish missing from an explicitly empty snapshot', () => {
  assert.equal(savedRulings({}), null);
  assert.deepEqual(savedRulings({ rulings: [] }), []);
  assert.deepEqual(savedRulings({}, { data: [{ comment: 'Saved ruling' }] }), [{ comment: 'Saved ruling' }]);
});

let server, CardGallery, CardDetailsModal;
before(async () => {
  server = await createServer({ configFile: fileURLToPath(new URL('../vite.config.mjs', import.meta.url)), server: { middlewareMode: true, watch: null }, logLevel: 'silent' });
  CardGallery = (await server.ssrLoadModule('/src/components/CardGallery.vue')).default;
  CardDetailsModal = (await server.ssrLoadModule('/src/components/CardDetailsModal.vue')).default;
});
after(async () => { await server?.close(); });
const renderGallery = props => renderToString(createSSRApp({ render: () => h(CardGallery, { cards, ...props }) }));

test('plain display mode has every card, no filter controls, no inspect buttons, and no modal', async () => {
  const html = await renderGallery({ searchable: false, filterable: false, sortable: false, showDetails: false, filters: staleFilters, pageSize: 0 });
  assert.match(html, /3 matching cards/);
  for (const card of cards) assert.match(html, new RegExp(card.name));
  assert.doesNotMatch(html, /<input|<select|<dialog|Inspect card|aria-label="Inspect/);
});
test('search-only and filters-only modes render the controls that actually affect results', async () => {
  const search = await renderGallery({ filterable: false, filters: { query: 'charm', color: 'G' } });
  assert.match(search, /1 matching card/);
  assert.match(search, /type="search"/);
  assert.doesNotMatch(search, /Card color includes/);
  const filtered = await renderGallery({ searchable: false, filters: { query: 'missing', color: 'G' } });
  assert.match(filtered, /1 matching card/);
  assert.doesNotMatch(filtered, /type="search"/);
  assert.match(filtered, /Card color includes/);
  assert.match(filtered, /aria-label="Inspect A Sprout"/);
  assert.match(filtered, /<dialog/);
});
test('multiple galleries have unique control and dialog IDs', async () => {
  const html = await renderToString(createSSRApp({ render: () => h('div', [h(CardGallery, { cards }), h(CardGallery, { cards })]) }));
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.ok(ids.length >= 10);
  assert.equal(new Set(ids).size, ids.length);
});
test('modal includes full saved faces, printing metadata, legalities, rulings and raw fields without fetching', async () => {
  const card = { id: 'double', name: 'Front // Back', layout: 'transform', rarity: 'rare', legalities: { modern: 'legal' }, custom_saved_field: 'Extra original data', rulings: [{ published_at: '2026-01-01', comment: 'A locally saved ruling.' }], card_faces: [{ name: 'Front', oracle_text: 'First full Oracle text.', image_uris: { normal: 'https://example.com/front.jpg' } }, { name: 'Back', oracle_text: 'Second full Oracle text.', loyalty: '3', image_uris: { normal: 'https://example.com/back.jpg' } }] };
  const html = await renderToString(createSSRApp({ render: () => h(CardDetailsModal, { card }) }));
  for (const text of ['First full Oracle text.', 'Second full Oracle text.', 'Extra original data', 'A locally saved ruling.', 'transform', 'modern', 'front.jpg', 'back.jpg', 'Loyalty 3']) assert.ok(html.includes(text), text);
  const missing = await renderToString(createSSRApp({ render: () => h(CardDetailsModal, { card: cards[0] }) }));
  assert.match(missing, /Rulings were not included/);
});
