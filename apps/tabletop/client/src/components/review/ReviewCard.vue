<script setup>
import { computed, ref, watch } from "vue";
import { imageURL } from "./review-format.js";
import CardBack from "../table/CardBack.vue";
const props = defineProps({
  definition: { type: Object, default: () => ({}) },
  card: Object,
  reveal: Boolean,
  caption: Boolean,
});
const emit = defineEmits(["inspect"]);
const failed = ref(false),
  concealed = computed(() => props.card?.face_down && !props.reveal);
const ability = computed(() => (props.card?.kind || props.definition.kind) === "ability");
const source = computed(() =>
  concealed.value || ability.value ? null : imageURL(props.definition),
);
const name = computed(() =>
  concealed.value ? "Face-down card" : props.definition.name || "Unnamed card",
);
const markers = computed(() =>
  [
    ...Object.entries(props.card?.counters || {}).map(
      ([key, value]) => `${value} ${key}`,
    ),
    ...(props.card?.damage ? [`${props.card.damage} damage`] : []),
  ].join(" · "),
);
watch(source, () => {
  failed.value = false;
});
</script>
<template>
  <button
    type="button"
    class="relative flex w-[68px] shrink-0 flex-col gap-1 rounded border border-base-content/20 bg-base-300 p-1 text-left text-base-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    :aria-label="`Inspect ${name}${card?.tapped ? ', tapped' : ''}`"
    :title="
      ability && !concealed ? definition.short_description?.trim() || name
        : [name, card?.tapped && 'Tapped', markers].filter(Boolean).join(' · ')
    "
    @click="emit('inspect', definition, card)"
  >
    <span
      class="flex aspect-[0.716] w-full items-center justify-center rounded bg-base-200"
      :class="{ 'rotate-90': card?.tapped }"
    >
      <img
        v-if="source && !failed"
        :src="source"
        :alt="name"
        width="60"
        height="84"
        class="h-full w-full rounded object-contain"
        loading="lazy"
        @error="failed = true"
      />
      <CardBack v-else-if="ability && !concealed" class="h-full w-full" aria-hidden="true" />
      <span v-else class="p-1 text-center text-xs">{{ name }}</span>
    </span>
    <span v-if="caption" class="w-full break-words text-xs leading-tight">{{
      name
    }}</span>
    <span
      v-if="markers"
      class="badge badge-sm absolute bottom-1 left-0 max-w-full overflow-hidden"
      :title="markers"
      >{{ markers }}</span
    >
  </button>
</template>
