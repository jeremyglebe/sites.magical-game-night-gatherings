<script setup>
import { computed, nextTick, ref, useId } from 'vue';
import { Search, RotateCcw, ArrowLeft, ArrowRight, SlidersHorizontal } from '@lucide/vue';
import CardGalleryItem from './CardGalleryItem.vue';
import CardDetailsModal from './CardDetailsModal.vue';
import { COLOR_NAMES, DEFAULT_FILTERS, defaultCardMetadata, effectiveCardFilters, filterCards, paginateCards } from './card-gallery.mjs';

/** Saved Scryfall cards only; no network requests except card images. See CARD-GALLERY.md. */
const props = defineProps({
  cards: { type: Array, required: true }, groups: { type: Array, default: () => [] }, factions: { type: Array, default: () => [] },
  metadata: { type: Function, default: defaultCardMetadata }, searchable: { type: Boolean, default: true },
  filterable: { type: Boolean, default: true }, sortable: { type: Boolean, default: true }, showDetails: { type: Boolean, default: true },
  showFeatured: { type: Boolean, default: false }, featuredLabel: { type: String, default: 'Highlighted cards' },
  featuredSortLabel: { type: String, default: 'Highlighted first' }, groupLabel: { type: String, default: 'Group' },
  allGroupsLabel: { type: String, default: 'All groups' }, defaultSort: { type: String, default: 'name' },
  pageSize: { type: Number, default: 24 }, resultDescription: { type: String, default: '' },
});
const filters = defineModel('filters', { type: Object, default: () => ({}) });
const page = defineModel('page', { type: Number, default: 1 });
const emit = defineEmits(['select']);
const id = `card-gallery-${useId()}`;
const effective = computed(() => effectiveCardFilters(filters.value, props));
const filtered = computed(() => filterCards(props.cards, { ...effective.value, groups: props.groups, metadata: props.metadata }));
const pagination = computed(() => paginateCards(filtered.value, page.value, props.pageSize));
const visibleGroups = computed(() => props.groups.filter(group => !effective.value.faction || group.faction === effective.value.faction));
const groupCounts = computed(() => Object.fromEntries(props.groups.map(group => [group.id, props.cards.filter(card => props.metadata(card)?.groups?.includes(group.id)).length])));
const activeFilterCount = computed(() => Object.entries(effective.value).filter(([key, value]) => key !== 'sort' && value !== DEFAULT_FILTERS[key]).length);
const selected = ref(null);
const detailOpen = ref(false);
const resultsHeading = ref(null);
const groupName = value => props.groups.find(group => group.id === value)?.label || value;
function updateFilter(key, value) {
  page.value = 1;
  filters.value = { ...filters.value, ...(key === 'faction' ? { group: '' } : {}), [key]: value };
}
function reset() { page.value = 1; filters.value = { ...DEFAULT_FILTERS, sort: props.defaultSort }; }
function inspect(card) { if (!props.showDetails) return; selected.value = card; detailOpen.value = true; emit('select', card); }
async function changePage(value) { page.value = Math.max(1, Math.min(pagination.value.pages, value)); await nextTick(); resultsHeading.value?.focus(); }
</script>

<template>
  <div class="min-w-0">
    <section v-if="searchable || filterable" class="mt-5 border-y border-base-300 py-4" aria-label="Filter cards">
      <div v-if="filterable && factions.length" class="flex flex-wrap items-center gap-2" role="group" aria-label="Faction">
        <button type="button" class="btn btn-sm" :class="!effective.faction ? 'btn-active' : 'btn-ghost'" :aria-pressed="!effective.faction" @click="updateFilter('faction', '')">All factions</button>
        <button type="button" v-for="faction in factions" :key="faction.id" class="btn btn-sm" :class="effective.faction === faction.id ? 'btn-active' : 'btn-ghost'" :aria-pressed="effective.faction === faction.id" @click="updateFilter('faction', faction.id)"><component :is="faction.icon" v-if="faction.icon" class="size-4" aria-hidden="true" />{{ faction.label }}</button>
      </div>
      <div class="grid grid-cols-2 gap-3" :class="[filterable && factions.length ? 'mt-4' : '', searchable && filterable && groups.length ? 'xl:grid-cols-[minmax(12rem,2fr)_minmax(10rem,1.4fr)_minmax(8rem,1fr)]' : 'sm:grid-cols-2']">
        <div v-if="searchable" class="col-span-2" :class="filterable ? 'xl:col-span-1' : ''"><label :for="id + '-query'" class="mb-1 block text-xs font-medium">Search cards</label><label class="input input-sm w-full"><Search class="size-4 shrink-0 text-base-content/60" aria-hidden="true" /><input :id="id + '-query'" :value="effective.query" type="search" placeholder="Name, type, rules, or notes" @input="updateFilter('query', $event.target.value)" /></label></div>
        <label v-if="filterable && groups.length" class="block"><span class="mb-1 block text-xs font-medium">{{ groupLabel }}</span><select :id="id + '-group'" :value="effective.group" class="select select-sm w-full" @change="updateFilter('group', $event.target.value)"><option value="">{{ allGroupsLabel }}</option><option v-for="group in visibleGroups" :key="group.id" :value="group.id">{{ group.label }} · {{ groupCounts[group.id] }}</option></select></label>
        <div v-if="filterable"><label :for="id + '-color'" class="mb-1 block text-xs font-medium">Card color includes</label><select :id="id + '-color'" aria-label="Card color includes" :value="effective.color" class="select select-sm w-full" @change="updateFilter('color', $event.target.value)"><option value="">Any color</option><option v-for="(label, color) in COLOR_NAMES" :key="color" :value="color">{{ label }}</option></select></div>
      </div>
      <details v-if="filterable" class="mt-3">
        <summary class="flex w-fit cursor-pointer items-center gap-2 py-1 text-sm font-medium"><SlidersHorizontal class="size-4" aria-hidden="true" />More filters <span class="text-base-content/50">+</span></summary>
        <div class="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div><label :for="id + '-kind'" class="mb-1 block text-xs font-medium">Card kind</label><select :id="id + '-kind'" aria-label="Card kind" :value="effective.kind" class="select select-sm w-full" @change="updateFilter('kind', $event.target.value)"><option value="">All card kinds</option><option value="creature">Creatures</option><option value="noncreature">Noncreatures</option></select></div>
          <div><label :for="id + '-mana'" class="mb-1 block text-xs font-medium">Mana value</label><select :id="id + '-mana'" aria-label="Mana value" :value="effective.mana" class="select select-sm w-full" @change="updateFilter('mana', $event.target.value)"><option value="">Any mana value</option><option value="low">0–2</option><option value="mid">3–4</option><option value="high">5 or more</option></select></div>
          <label v-if="showFeatured" class="flex cursor-pointer items-center gap-2 self-end py-2 text-sm"><input :checked="effective.featured" type="checkbox" class="checkbox checkbox-sm" @change="updateFilter('featured', $event.target.checked)" />{{ featuredLabel }} only</label>
        </div>
        <p class="mt-3 text-xs leading-5 text-base-content/65">Color filters describe the card, not the mana needed to cast it. Check hybrid costs and activated abilities.</p>
      </details>
      <div v-if="activeFilterCount" class="mt-3 flex flex-wrap items-center gap-2 text-xs" aria-label="Active filters"><span>{{ activeFilterCount }} active filter{{ activeFilterCount === 1 ? '' : 's' }}</span><span v-if="effective.featured" class="badge badge-sm badge-outline">{{ featuredLabel }} only</span><span v-if="effective.group" class="badge badge-sm badge-outline">{{ groupName(effective.group) }}</span><span v-if="effective.color" class="badge badge-sm badge-outline">{{ COLOR_NAMES[effective.color] }}</span><button type="button" class="btn btn-sm btn-ghost" @click="reset"><RotateCcw class="size-3.5" aria-hidden="true" />Clear filters</button></div>
    </section>

    <section class="mt-5" :aria-labelledby="id + '-results'">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 :id="id + '-results'" ref="resultsHeading" tabindex="-1" class="scroll-mt-24 text-lg font-semibold outline-none" aria-live="polite">{{ filtered.length }} matching card{{ filtered.length === 1 ? '' : 's' }}<span v-if="filtered.length && pagination.pages > 1" class="ml-2 text-sm font-normal text-base-content/60">{{ pagination.start }}–{{ pagination.end }}</span></h2>
        <div v-if="sortable" class="flex items-center gap-2"><label :for="id + '-sort'" class="text-xs font-medium">Sort</label><select :id="id + '-sort'" aria-label="Sort" :value="effective.sort" class="select select-sm w-44" @change="updateFilter('sort', $event.target.value)"><option v-if="showFeatured" value="featured">{{ featuredSortLabel }}</option><option value="name">Name A–Z</option><option value="mana-asc">Mana value: low first</option><option value="mana-desc">Mana value: high first</option></select></div>
      </div>
      <p v-if="resultDescription" class="mb-5 max-w-3xl text-sm leading-6 text-base-content/70">{{ resultDescription }}</p>
      <div v-if="!filtered.length" class="border border-dashed border-base-300 py-12 text-center"><Search class="mx-auto mb-3 size-6 text-base-content/50" aria-hidden="true" /><h3 class="font-semibold">{{ activeFilterCount ? 'No cards match these filters' : 'No cards to display' }}</h3><p v-if="activeFilterCount" class="my-2 text-sm text-base-content/70">Try a broader search or clear the selected filters.</p><button type="button" v-if="activeFilterCount" class="btn btn-sm" @click="reset">Show all cards</button></div>
      <ul v-else class="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        <li v-for="(card, index) in pagination.cards" :key="card.id || card.oracle_id || card.name" class="min-w-0">
          <CardGalleryItem :card="card" :interactive="showDetails" :eager="index < 5" @select="inspect" />
          <slot name="card-caption" :card="card" :metadata="metadata(card)" />
        </li>
      </ul>
      <nav v-if="pagination.pages > 1" class="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-base-300 pt-4" aria-label="Card results pages"><span class="text-sm tabular-nums">Page {{ pagination.page }} of {{ pagination.pages }}</span><div class="join"><button type="button" class="btn btn-sm join-item" :disabled="pagination.page === 1" @click="changePage(pagination.page - 1)"><ArrowLeft class="size-4" aria-hidden="true" />Previous</button><button type="button" class="btn btn-sm join-item" :disabled="pagination.page === pagination.pages" @click="changePage(pagination.page + 1)">Next<ArrowRight class="size-4" aria-hidden="true" /></button></div></nav>
    </section>
    <CardDetailsModal v-if="showDetails" v-model:open="detailOpen" :card="selected" :metadata="selected ? metadata(selected) : {}" :groups="groups"><template v-if="$slots.details" #details="slotProps"><slot name="details" v-bind="slotProps" /></template></CardDetailsModal>
  </div>
</template>
