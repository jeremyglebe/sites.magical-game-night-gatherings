<script setup>
import { computed, watch } from "vue";
import { Layers } from "@lucide/vue";
import CardTile from "./CardTile.vue";
import { orderedPileCards } from "../../../../shared/battlefield-piles.mjs";
import { createPileWheel } from "./pile-wheel.mjs";

const props = defineProps({
  pile: { type: Object, required: true },
  order: Array,
  human: Object,
  compact: Boolean,
  readonly: Boolean,
});
const emit = defineEmits(["inspect", "select", "order"]);
const cards = computed(() => orderedPileCards(props.pile, props.order));
const top = computed(() => cards.value[0]);
const grouped = computed(() => cards.value.length > 1);
const label = computed(() => grouped.value
  ? `Inspect ${top.value?.name || "card"}${top.value?.tapped ? ", tapped" : ""}; ${cards.value.length} linked cards. Wheel or Shift-click to cycle; Shift+Enter also cycles.`
  : `Inspect ${top.value?.name || "Face-down card"}`);
const wheel = createPileWheel();
watch(() => props.pile.root.id, () => wheel.reset());
watch(grouped, () => wheel.reset());
function cycle(direction = 1) {
  if (!grouped.value) return;
  const ids = cards.value.map((card) => card.id);
  if (direction > 0) ids.push(ids.shift());
  else ids.unshift(ids.pop());
  emit("order", { rootId: props.pile.root.id, ids });
}
function inspectTop() { emit("inspect", top.value); }
function cycleClick(event) {
  if (!event.shiftKey || !grouped.value) return;
  event.preventDefault();
  event.stopPropagation();
  cycle();
}
function cycleKey(event) {
  if (event.key !== "Enter" || !event.shiftKey || !grouped.value) return;
  event.preventDefault();
  event.stopPropagation();
  if (!event.repeat) cycle();
}
function cycleWheel(event) {
  if (!grouped.value || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  const direction = wheel.step(delta, event.deltaMode);
  if (direction) cycle(direction);
}
</script>

<template>
  <div
    class="relative shrink-0 rounded [&.hc-attach-pending]:outline-2 [&.hc-attach-pending]:outline-dashed [&.hc-attach-pending]:outline-primary/70 [&.hc-attach-armed]:bg-primary/15 [&.hc-attach-armed]:ring-2 [&.hc-attach-armed]:ring-primary"
    :class="grouped ? 'pr-1 pb-1' : ''"
    :data-hc-attach-to="pile.root.id"
    data-hc-drop-zone="battlefield"
    :data-hc-drop-controller="pile.root.controller"
    :data-hc-drop-label="pile.root.name || 'permanent'"
    @click.capture="cycleClick"
    @keydown.capture="cycleKey"
    @wheel="cycleWheel"
  >
    <div class="stack stack-bottom">
      <CardTile
        :card="top"
        :dense="compact"
        :fit-lane="compact"
        :draggable="!readonly && human?.canDrag?.({ cardId: top.id })"
        :selected="human?.selectedSource?.cardId === top.id"
        v-bind="grouped ? { 'aria-label': label, title: label, 'aria-keyshortcuts': 'Shift+Enter' } : {}"
        @inspect="inspectTop"
        @select="emit('select', $event)"
      />
      <template v-if="grouped">
        <span
          v-for="n in Math.min(cards.length - 1, 2)"
          :key="n"
          class="pointer-events-none h-full w-full rounded border border-base-content/30 bg-base-300"
          aria-hidden="true"
        />
      </template>
    </div>
    <span
      v-if="grouped"
      class="pointer-events-none absolute right-0 bottom-0 flex items-center gap-0.5 rounded bg-base-100/95 px-0.5 text-[10px] leading-3 text-base-content"
      aria-hidden="true"
    ><Layers :size="10" />{{ cards.length }}</span>
  </div>
</template>
