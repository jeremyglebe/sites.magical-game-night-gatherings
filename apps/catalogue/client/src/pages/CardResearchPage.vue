<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { ArrowRight, Sprout, Skull, Link2 } from '@lucide/vue';
import catalogue from '../../../../../research/zombies-vs-plants/cards.json';
import CatalogueProse from '../components/CatalogueProse.vue';
import CardGallery from '../components/CardGallery.vue';
import { DEFAULT_FILTERS, effectiveCardFilters, paginateCards } from '../components/card-gallery.mjs';
import { filterResearchCards, researchMetadata } from '../components/research-cards.mjs';

defineProps({ page: Object, base: { type: String, default: '/' } });
const cards = catalogue.cards;
const groups = catalogue.groups;
const factions = [{ id: 'plants', label: 'Plants', icon: Sprout }, { id: 'zombies', label: 'Zombies', icon: Skull }, { id: 'shared', label: 'Mana support' }];
const defaults = { ...DEFAULT_FILTERS, sort: 'featured' };
const filters = ref({ ...defaults });
const pageNumber = ref(1);
const crossoverCount = cards.filter(card => researchMetadata(card).featured).length;
const currentPage = computed(() => paginateCards(filterResearchCards(cards, groups, filters.value), pageNumber.value).page);
const groupDescription = computed(() => groups.find(group => group.id === filters.value.group)?.description || (filters.value.featured ? 'Botanical Zombies and undead botanical themes belong to the Zombie faction. Plant, Treefolk, Fungus, and related tags remain research taxonomy; inspect each card’s mana needs before choosing its packet.' : 'Inspect a card for full Oracle text, theme fit, interactions, and mana notes.'));
let mounted = false;
let restoring = false;
function readLocation() {
  restoring = true;
  const params = new URLSearchParams(window.location.search);
  filters.value = effectiveCardFilters({ query: params.get('q'), faction: params.get('faction'), group: params.get('pack'), color: params.get('color'), kind: params.get('kind'), mana: params.get('mana'), featured: params.get('crossovers') === '1', sort: params.get('sort') === 'crossovers' ? 'featured' : params.get('sort') }, { groups, factions, showFeatured: true, defaultSort: 'featured' });
  pageNumber.value = Math.max(1, Number.parseInt(params.get('page'), 10) || 1);
  restoring = false;
}
function writeLocation() {
  if (!mounted || restoring) return;
  const f = filters.value;
  const url = new URL(window.location.href);
  const values = { q: f.query.trim(), faction: f.faction, pack: f.group, color: f.color, kind: f.kind, mana: f.mana, crossovers: f.featured ? '1' : '', sort: f.sort === 'featured' ? '' : f.sort, page: currentPage.value > 1 ? String(currentPage.value) : '' };
  for (const [key, value] of Object.entries(values)) { if (value) url.searchParams.set(key, value); else url.searchParams.delete(key); }
  window.history.replaceState(window.history.state, '', url);
}
watch(filters, () => { if (mounted && !restoring) { pageNumber.value = 1; writeLocation(); } }, { deep: true, flush: 'sync' });
watch(pageNumber, writeLocation, { flush: 'sync' });
onMounted(() => { readLocation(); mounted = true; window.addEventListener('popstate', readLocation); });
onUnmounted(() => { window.removeEventListener('popstate', readLocation); });
function showCrossovers() { filters.value = { ...defaults, featured: true }; pageNumber.value = 1; }
</script>

<template>
  <div class="min-w-0">
    <nav class="breadcrumbs mb-4 text-sm text-base-content/65" aria-label="Breadcrumb"><ul><li><a :href="base + 'research/'">Research</a></li><li>Zombies vs Plants</li></ul></nav>
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="max-w-2xl"><h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">Zombies vs Plants</h1><p class="mt-2 text-base leading-7 text-base-content/75">Shared card research for Jumpstart and a future cube. Candidates, not decklists.</p></div>
      <a :href="base + 'boxed-sets/zombies-vs-plants-jumpstart.html'" class="btn btn-sm btn-ghost">Box concept <ArrowRight class="size-4" aria-hidden="true" /></a>
    </div>
    <div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <span class="tabular-nums">{{ cards.length }} cards researched</span>
      <button class="btn btn-sm" :class="filters.featured ? 'btn-active' : 'btn-ghost'" @click="showCrossovers"><Link2 class="size-4" aria-hidden="true" />{{ crossoverCount }} botanical undead</button>
      <span class="text-base-content/60">Scryfall snapshot · {{ catalogue.researchedAt }}</span>
    </div>
    <CardGallery v-model:filters="filters" v-model:page="pageNumber" :cards="cards" :groups="groups" :factions="factions" :metadata="researchMetadata" show-featured featured-label="Botanical undead" featured-sort-label="Featured first" group-label="Research theme" all-groups-label="All research themes" default-sort="featured" :result-description="groupDescription" />
    <section class="mt-10 border-t border-base-300 pt-2" aria-label="Research notes and sources"><CatalogueProse :html="page.html" /></section>
  </div>
</template>
