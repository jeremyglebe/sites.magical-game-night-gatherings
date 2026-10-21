<script setup>
import { computed, ref, watch } from "vue";
const props = defineProps({
  card: { type: Object, required: true },
  compact: Boolean,
  dense: Boolean,
  fitLane: Boolean,
  miniature: Boolean,
  hand: Boolean,
  selected: Boolean,
  draggable: Boolean,
});
const emit = defineEmits(["inspect", "select"]);
const failed = ref(false);
watch(
  () => props.card.image_url,
  () => (failed.value = false),
);
const image = computed(() => {
  try {
    const u = new URL(props.card.image_url);
    return u.protocol === "https:" && u.hostname === "cards.scryfall.io"
      ? u.href
      : null;
  } catch {
    return null;
  }
});
const markers = computed(() =>
  [
    props.card.tapped ? "Tapped" : "",
    props.card.damage ? `${props.card.damage} damage` : "",
    ...Object.entries(props.card.counters || {})
      .filter(([, n]) => n)
      .map(([k, v]) => `${v} ${k}`),
  ].filter(Boolean),
);
</script>
<template>
  <button
    type="button"
    class="[&.hc-drag-ghost]:shadow-xl group relative flex shrink-0 flex-col rounded border bg-base-100 text-left text-base-content focus-visible:outline-2 focus-visible:outline-primary"
    :class="[
      miniature
        ? 'w-8 gap-0 p-0.5'
        : fitLane
          ? 'w-[min(4rem,70cqh)] max-w-full gap-0.5 p-0.5'
          : dense
            ? hand
              ? 'w-[clamp(3rem,7dvh,4.5rem)] gap-0.5 p-0.5'
              : 'w-[clamp(2.5rem,6dvh,4rem)] gap-0.5 p-0.5'
            : compact
              ? 'w-14 gap-1 p-1'
              : hand
                ? 'w-24 gap-1 p-1'
                : 'w-20 gap-1 p-1',
      selected
        ? 'border-primary ring-2 ring-primary'
        : 'border-base-300 hover:border-primary/60',
      draggable
        ? 'cursor-grab touch-pan-y active:cursor-grabbing'
        : 'cursor-pointer',
      card.draft ? 'opacity-65' : '',
    ]"
    :data-hc-card="card.id"
    :data-hc-drag-label="card.name"
    :aria-label="`Inspect ${card.name || 'Face-down card'}${card.tapped ? ', tapped' : ''}`"
    :title="`${card.name || 'Face-down card'}${draggable ? ' · drag to move; Space to choose destination' : ''}`"
    @click="emit('inspect', card)"
    @keydown.space.prevent.stop="
      draggable ? emit('select', { cardId: card.id }) : emit('inspect', card)
    "
    :draggable="false"
  >
    <span
      class="grid aspect-[5/7] w-full place-items-center overflow-hidden rounded-sm bg-base-300"
    >
      <img
        v-if="image && !failed"
        :src="image"
        alt=""
        width="100"
        height="140"
        class="h-full w-full object-contain transition-transform motion-reduce:transition-none"
        :class="card.tapped ? 'rotate-90 scale-75' : ''"
        :draggable="false"
        @error="failed = true"
      />
      <span v-else class="p-1 text-center text-xs leading-tight">{{
        card.name || "Face-down card"
      }}</span>
    </span>
    <span
      v-if="(hand || !image) && !miniature && !fitLane"
      :class="
        dense
          ? 'w-full truncate text-[10px] leading-3'
          : 'break-words text-xs leading-tight'
      "
      >{{ card.name || "Card" }}</span
    >
    <span
      v-if="markers.length"
      :title="markers.join(' · ')"
      :class="
        dense || miniature
          ? 'absolute inset-x-0.5 bottom-0.5 truncate rounded bg-base-100/90 px-0.5 text-[9px] leading-3 text-primary'
          : 'text-xs text-primary'
      "
      >{{ markers.join(" · ") }}</span
    >
    <span
      v-if="card.draft"
      :class="
        dense || miniature
          ? 'absolute right-0 top-0 rounded bg-primary px-0.5 text-[9px] text-primary-content'
          : 'text-xs'
      "
      >{{ dense || miniature ? "•" : "Pending" }}</span
    >
  </button>
</template>
