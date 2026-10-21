<script setup>
import { computed, ref, watch } from "vue";
import CardBack from "./CardBack.vue";
const props = defineProps({
  card: { type: Object, required: true },
  compact: Boolean,
  stack: Boolean,
  dense: Boolean,
  fitLane: Boolean,
  miniature: Boolean,
  hand: Boolean,
  handHover: Boolean,
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
  if (props.card.kind === "ability") return null;
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
    class="[&.hc-drag-ghost]:shadow-xl group relative shrink-0 rounded border-0 bg-transparent p-0 text-left text-base-content focus-visible:outline-2 focus-visible:outline-primary"
    :class="[
      hand && handHover
        ? 'hover-3d motion-reduce:[filter:none] motion-reduce:transition-none motion-reduce:[&>:first-child]:transform-none motion-reduce:[&>:first-child]:scale-100 motion-reduce:[&>:first-child]:transition-none motion-reduce:[&>:first-child]:before:hidden [@media(hover:none)]:[filter:none] [@media(hover:none)]:transition-none [@media(hover:none)]:[&>:first-child]:transform-none [@media(hover:none)]:[&>:first-child]:scale-100 [@media(hover:none)]:[&>:first-child]:transition-none [@media(hover:none)]:[&>:first-child]:before:hidden'
        : 'block',
      miniature
        ? '[--card-width:2rem]'
        : stack
          ? '[--card-width:3rem]'
        : fitLane
          ? '[--card-width:min(4rem,70cqh)]'
          : dense
            ? hand
              ? '[--card-width:clamp(3rem,7dvh,4.5rem)]'
              : '[--card-width:clamp(2.5rem,6dvh,4rem)]'
            : compact
              ? '[--card-width:3.5rem]'
              : hand
                ? '[--card-width:6rem]'
                : '[--card-width:5rem]',
      card.tapped ? 'w-[calc(var(--card-width)*7/5)]' : 'w-[var(--card-width)]',
      draggable
        ? 'cursor-grab touch-pan-y active:cursor-grabbing'
        : 'cursor-pointer',
      card.draft ? 'opacity-65' : '',
    ]"
    :data-hc-card="card.id"
    :data-hc-drag-label="card.name"
    :aria-label="`Inspect ${card.name || 'Face-down card'}${card.tapped ? ', tapped' : ''}`"
    :title="card.kind === 'ability'
      ? card.short_description?.trim() || card.name || 'Ability'
      : [card.name || 'Face-down card', card.tapped ? 'Tapped' : '', ...markers, draggable ? 'drag to move; Space to choose destination' : ''].filter(Boolean).join(' · ')"
    @click="emit('inspect', card)"
    @keydown.space.prevent.stop="
      draggable ? emit('select', { cardId: card.id }) : emit('inspect', card)
    "
    :draggable="false"
  >
    <!-- The footprint rotates with the card; the artwork keeps its full size. -->
    <span
      class="relative block w-full rounded"
      :class="[
        card.tapped ? 'aspect-[7/5]' : 'aspect-[5/7]',
        selected ? 'ring-2 ring-primary' : 'group-hover:brightness-110',
      ]"
    >
      <span
        class="pointer-events-none absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2"
        :class="card.tapped ? 'h-[140%] w-[calc(100%*5/7)] rotate-90' : 'h-full w-full'"
      >
        <img
          v-if="image && !failed"
          :src="image"
          alt=""
          width="100"
          height="140"
          class="h-full w-full rounded object-contain"
          :draggable="false"
          @error="failed = true"
        />
        <CardBack
          v-else-if="card.kind === 'ability'"
          class="h-full w-full"
          aria-hidden="true"
        />
        <span
          v-else
          class="grid h-full w-full place-items-center rounded border border-base-content/25 bg-base-300 p-1 text-center text-xs leading-tight"
          >{{ card.name || "Face-down card" }}</span
        >
      </span>
      <span
        v-if="hand && image && !failed && !miniature && !fitLane"
        class="pointer-events-none absolute inset-x-0 bottom-0 truncate rounded-b bg-linear-to-t from-base-100/95 via-base-100/75 to-transparent px-1 pt-4 pb-1 font-medium text-base-content"
        :class="dense ? 'text-[9px] leading-3' : 'text-xs leading-4'"
        >{{ card.name || "Card" }}</span
      >
      <span
        v-if="!hand && markers.length"
        class="pointer-events-none absolute inset-x-0 bottom-0 truncate rounded-b bg-base-100/90 px-1 text-base-content"
        :class="dense || miniature || fitLane ? 'text-[9px] leading-3' : 'text-xs'"
        :title="markers.join(' · ')"
        >{{ markers.join(" · ") }}</span
      >
      <span
        v-if="!hand && card.draft"
        class="pointer-events-none absolute right-0 top-0 rounded-sm bg-primary px-0.5 text-[9px] leading-3 text-primary-content"
        title="Pending action"
        >{{ dense || miniature ? "•" : "Pending" }}</span
      >
      <span
        v-if="hand && (markers.length || card.draft)"
        class="pointer-events-none absolute inset-x-0.5 top-0.5 flex items-start justify-end gap-0.5"
      >
        <span
          v-if="markers.length"
          class="min-w-0 flex-1 truncate rounded-sm bg-base-100/90 px-0.5 text-[9px] leading-3 text-base-content"
          :title="markers.join(' · ')"
          >{{ markers.join(" · ") }}</span
        >
        <span
          v-if="card.draft"
          class="shrink-0 rounded-sm bg-primary px-0.5 text-[9px] leading-3 text-primary-content"
          title="Pending action"
          >{{ dense || miniature ? "•" : "Pending" }}</span
        >
      </span>
    </span>
    <!-- The native button owns all interaction; these cells only steer the tilt. -->
    <template v-if="hand && handHover">
      <span
        v-for="cell in 8"
        :key="cell"
        aria-hidden="true"
        data-hand-hover-cell
        class="motion-reduce:hidden [@media(hover:none)]:hidden"
      />
    </template>
  </button>
</template>
