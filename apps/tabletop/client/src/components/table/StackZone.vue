<script setup>
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from "vue";
import { Layers, ChevronRight } from "@lucide/vue";
import CardTile from "./CardTile.vue";
import { createPileReveal } from "./pile-reveal.mjs";

const props = defineProps({
  table: { type: Object, required: true },
  human: Object,
  readonly: Boolean,
  compact: Boolean,
});
const emit = defineEmits(["inspect", "select", "target"]);
const cards = computed(() => props.table.zones?.stack?.cards || []);
const root = ref(null);
const expanded = ref(false);
const listId = useId();
const reveal = createPileReveal({
  openDelay: 1000,
  closeDelay: 20000,
  immediateDrag: false,
  onChange: (value) => { expanded.value = value; },
});
onBeforeUnmount(() => reveal.dispose());
watch(() => cards.value.length, (count) => { if (!count) reveal.reset(); });
watch(() => props.table.revision, (next, previous) => {
  if (next < previous) reveal.reset();
});

function pointer(event, active) {
  if (event.pointerType !== "touch") reveal.setActive("pointer", active);
}
function focus(event) {
  const next = event.type === "focusout" ? event.relatedTarget : event.target;
  // Clicking a card must not leave a focus latch that defeats the away timer.
  reveal.setActive("focus", !!next && root.value?.contains(next) && next.matches(":focus-visible"));
}
async function collapse() {
  const list = root.value?.querySelector("ol");
  const focused = document.activeElement;
  const buriedFocus = list?.contains(focused) && !list.firstElementChild?.contains(focused);
  reveal.dismiss();
  await nextTick();
  if (buriedFocus) list?.querySelector("button")?.focus();
}
function toggle() {
  if (expanded.value) collapse();
  else reveal.reveal();
}
function keyboard(event) {
  if (event.key === "ArrowRight" && !expanded.value) {
    event.preventDefault();
    reveal.reveal();
  } else if (event.key === "Escape" && expanded.value) {
    event.preventDefault();
    event.stopPropagation();
    collapse();
  }
}

function canDrag(card) {
  return !props.readonly && !!props.human?.canDrag?.({ cardId: card.id });
}

function activatePile() {
  if (!expanded.value && cards.value[0]) emit("inspect", cards.value[0]);
  else target();
}

function target() {
  if (!props.readonly && props.human?.selectedSource) {
    emit("target", { zoneId: "stack", position: "top" });
  }
}
</script>

<template>
  <section
    ref="root"
    class="flex h-20 min-w-0 shrink-0 items-center gap-3 border-y border-base-300 px-2"
    :class="compact ? '' : 'my-1'"
    aria-label="Stack, top first"
    :data-stack-expanded="expanded"
    @focusin="focus"
    @focusout="focus"
    @keydown="keyboard"
    @hc-pile-hover="reveal.setActive('drag', $event.detail.active)"
    data-hc-drop-zone="stack"
    data-hc-drop-position="top"
    data-hc-drop-label="Stack · top"
    @click.self="target"
  >
    <div class="shrink-0 text-base-content/70">
      <div class="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide">
        <Layers :size="14" aria-hidden="true" />
        Stack
      </div>
      <button
        v-if="cards.length"
        type="button"
        class="btn btn-xs btn-ghost mt-1 gap-0.5 px-0.5 font-normal"
        :aria-expanded="expanded"
        :aria-controls="listId"
        :aria-label="expanded ? 'Collapse stack' : 'Spread stack'"
        title="Hover for 1 second to spread the stack. Click its top item to inspect."
        @click="toggle"
      >
        {{ cards.length }} {{ cards.length === 1 ? 'item' : 'items' }}
        <ChevronRight :size="12" class="transition-transform duration-300 motion-reduce:transition-none" :class="expanded ? 'rotate-180' : ''" aria-hidden="true" />
      </button>
    </div>

    <div
      v-if="cards.length"
      class="flex min-w-0 flex-1 items-center overflow-x-auto overscroll-x-contain p-1"
      @click.self="target"
    >
      <TransitionGroup
        tag="ol"
        :id="listId"
        class="relative h-[4.2rem] shrink-0"
        :class="expanded
          ? 'flex w-max items-start gap-3'
          : 'stack stack-end w-14'"
        move-class="transition-transform duration-300 ease-out motion-reduce:transition-none"
        aria-label="Stack entries, next to resolve first"
        data-hc-pile="stack"
        @pointerenter="pointer($event, true)"
        @pointerleave="pointer($event, false)"
        @click.self="activatePile"
      >
        <li
          v-for="(card, index) in cards"
          :key="card.id"
          class="relative shrink-0 rounded-lg"
          :class="expanded ? 'overflow-visible' : 'overflow-hidden'"
          :inert="!expanded && index > 0"
          :aria-hidden="!expanded && index > 0 ? true : undefined"
        >
          <CardTile
            :card="card"
            stack
            :draggable="canDrag(card)"
            :selected="human?.selectedSource?.cardId === card.id"
            @inspect="emit('inspect', $event)"
            @select="emit('select', $event)"
          />
        </li>
      </TransitionGroup>
    </div>
    <span v-else class="pointer-events-none py-2 text-sm text-base-content/50">Stack is empty</span>
  </section>
</template>
