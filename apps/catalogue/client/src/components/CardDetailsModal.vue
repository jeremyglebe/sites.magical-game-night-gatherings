<script setup>
import { computed, nextTick, ref, useId, watch } from 'vue';
import { ExternalLink, X } from '@lucide/vue';
import CardImage from './CardImage.vue';
import { cardFaces, cardImage, colorLabel, savedRulings } from './card-gallery.mjs';

// Reusable saved-card inspector: <CardDetailsModal v-model:open="open" :card="card" />.
// No requests are made. Optional `rulings` accepts a saved Scryfall array or { data: [] }.
const props = defineProps({ card: Object, metadata: { type: Object, default: () => ({}) }, groups: { type: Array, default: () => [] }, rulings: { type: [Array, Object], default: undefined } });
const open = defineModel('open', { type: Boolean, default: false });
const dialog = ref(null);
const titleId = `card-detail-${useId()}`;
const faces = computed(() => cardFaces(props.card));
const images = computed(() => { const imaged = faces.value.filter(face => cardImage(face)); return imaged.length ? imaged : props.card ? [props.card] : []; });
const rulings = computed(() => savedRulings(props.card, props.rulings));
const legalities = computed(() => Object.entries(props.card?.legalities || {}));
const printFields = computed(() => [
  ['Set', props.card?.set_name || props.card?.set?.toUpperCase()], ['Collector number', props.card?.collector_number],
  ['Rarity', props.card?.rarity], ['Artist', props.card?.artist || [...new Set(faces.value.map(face => face.artist).filter(Boolean))].join(', ')],
  ['Released', props.card?.released_at], ['Language', props.card?.lang], ['Layout', props.card?.layout],
  ['Mana value', props.card?.cmc], ['Color identity', props.card?.color_identity?.join(' / ') || (props.card?.color_identity ? 'Colorless' : undefined)],
  ['Keywords', props.card?.keywords?.join(', ')], ['Produces mana', props.card?.produced_mana?.join(' / ')],
].filter(([, value]) => value !== undefined && value !== null && value !== ''));
const groupLabel = id => props.groups.find(group => group.id === id)?.label || id;
const readable = value => String(value).replaceAll('_', ' ');
watch([open, () => props.card], async ([isOpen, card]) => {
  await nextTick();
  if (isOpen && card && dialog.value && !dialog.value.open) dialog.value.showModal();
  else if ((!isOpen || !card) && dialog.value?.open) dialog.value.close();
}, { immediate: true });
</script>

<template>
  <dialog ref="dialog" class="modal" :aria-labelledby="titleId" @close="open = false">
    <div v-if="card" class="modal-box w-[calc(100%-2rem)] max-w-5xl p-4 sm:p-6">
      <div class="mb-5 flex items-start justify-between gap-3"><div><h2 :id="titleId" class="text-xl font-semibold sm:text-2xl">{{ card.name }}</h2><p class="mt-1 text-sm text-base-content/65">{{ colorLabel(card) }}<template v-if="card.set"> · {{ card.set.toUpperCase() }} {{ card.collector_number }}</template></p></div><form method="dialog"><button class="btn btn-sm btn-square btn-ghost" aria-label="Close card details"><X class="size-5" aria-hidden="true" /></button></form></div>
      <div class="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div class="mx-auto w-full max-w-72 space-y-4"><CardImage v-for="face in images" :key="face.name" :src="cardImage(face)" :name="face.name" :type-line="face.type_line" eager /></div>
        <div class="min-w-0">
          <div v-if="metadata.badge || metadata.groups?.length" class="mb-4 flex flex-wrap gap-2"><span v-if="metadata.badge" class="badge badge-sm badge-outline">{{ metadata.badge }}</span><span v-for="id in metadata.groups || []" :key="id" class="badge badge-sm badge-ghost">{{ groupLabel(id) }}</span></div>
          <section v-for="face in faces" :key="face.name" class="mb-5 border-b border-base-300 pb-4"><h3 class="flex flex-wrap justify-between gap-2 font-semibold"><span>{{ face.name }}</span><span class="text-sm">{{ face.mana_cost || 'No mana cost' }}</span></h3><p class="mt-1 text-sm text-base-content/70">{{ face.type_line }}</p><p class="mt-3 whitespace-pre-line text-sm leading-6">{{ face.oracle_text || 'No rules text.' }}</p><p v-if="face.flavor_text" class="mt-3 whitespace-pre-line text-sm italic leading-6 text-base-content/70">{{ face.flavor_text }}</p><p v-if="face.power !== undefined" class="mt-3 text-right font-semibold tabular-nums">{{ face.power }} / {{ face.toughness }}</p><p v-if="face.loyalty !== undefined" class="mt-3 text-right text-sm">Loyalty {{ face.loyalty }}</p><p v-if="face.defense !== undefined" class="mt-3 text-right text-sm">Defense {{ face.defense }}</p></section>
          <slot name="details" :card="card" :metadata="metadata">
            <section class="space-y-4 text-sm leading-6" aria-label="Card notes"><div v-if="metadata.note"><h3 class="font-semibold">Why it belongs here</h3><p class="mt-1">{{ metadata.note }}</p></div><div v-if="metadata.roles?.length"><h3 class="font-semibold">Possible roles</h3><p class="mt-1">{{ metadata.roles.join(' · ') }}</p></div><div v-if="metadata.manaNote"><h3 class="font-semibold">Mana considerations</h3><p class="mt-1">{{ metadata.manaNote }}</p></div><div v-if="metadata.caution"><h3 class="font-semibold">Interactions to review</h3><p class="mt-1">{{ metadata.caution }}</p></div></section>
          </slot>
          <details class="mt-5 border-t border-base-300 pt-3"><summary class="cursor-pointer text-sm font-semibold">Printing and card details</summary><dl class="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm"><template v-for="[label, value] in printFields" :key="label"><dt class="text-base-content/65">{{ label }}</dt><dd class="break-words">{{ value }}</dd></template></dl><p v-if="!printFields.length" class="mt-2 text-sm text-base-content/65">Printing metadata is not included in this saved card.</p></details>
          <details v-if="legalities.length" class="mt-4"><summary class="cursor-pointer text-sm font-semibold">Saved format legalities</summary><dl class="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3"><div v-for="[format, status] in legalities" :key="format"><dt class="capitalize">{{ readable(format) }}</dt><dd class="text-base-content/65">{{ readable(status) }}</dd></div></dl><p class="mt-2 text-xs text-base-content/65">Snapshot values; check Scryfall for current legality.</p></details>
          <details class="mt-4"><summary class="cursor-pointer text-sm font-semibold">Saved rulings<template v-if="rulings"> · {{ rulings.length }}</template></summary><ul v-if="rulings?.length" class="mt-3 space-y-3 text-sm leading-6"><li v-for="(ruling, index) in rulings" :key="index"><span v-if="ruling.published_at" class="block text-xs text-base-content/65">{{ ruling.published_at }}</span>{{ ruling.comment }}</li></ul><p v-else class="mt-2 text-sm text-base-content/65">{{ rulings ? 'No rulings appear in this saved snapshot.' : 'Rulings were not included in this saved card. Open Scryfall for current rulings.' }}</p></details>
          <details class="mt-4"><summary class="cursor-pointer text-sm font-semibold">All supplied card data</summary><pre class="mt-3 max-h-80 max-w-full overflow-auto rounded bg-base-200 p-3 text-xs">{{ JSON.stringify(card, null, 2) }}</pre></details>
          <a v-if="card.scryfall_uri" :href="card.scryfall_uri" target="_blank" rel="noopener noreferrer" class="btn btn-sm mt-5">Card and rulings on Scryfall <ExternalLink class="size-4" aria-hidden="true" /></a>
        </div>
      </div>
      <div class="modal-action"><form method="dialog"><button class="btn btn-sm">Back to cards</button></form></div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>Close card details</button></form>
  </dialog>
</template>
