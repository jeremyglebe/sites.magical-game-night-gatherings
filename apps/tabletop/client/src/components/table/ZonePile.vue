<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import CardBack from "./CardBack.vue";
import { createDeckReveal } from "./deck-reveal.mjs";

const props = defineProps({
  zone: { type: Object, required: true },
  playerName: String,
  own: Boolean,
  selectedSource: Object,
});
const emit = defineEmits(["zone", "target", "select"]);
const root = ref(null);
const expanded = ref(false);
const reveal = createDeckReveal({ onChange: (value) => { expanded.value = value; } });
onBeforeUnmount(() => reveal.dispose());
const library = computed(() => props.zone.kind === "library");
const positions = computed(() => library.value ? ["bottom", "top"] : ["bottom"]);
const card = computed(() => props.zone.kind === "graveyard" ? props.zone.cards?.at(-1) : props.zone.cards?.[0]);
const concealed = computed(() => library.value || (props.zone.count > 0 && !props.zone.cards?.length));
const layers = computed(() => Math.min(2, Math.max(0, (props.zone.count || 0) - 1)));
const bottomTarget = (position) => library.value && position === "bottom";
const closedBottom = (position) => bottomTarget(position) && !expanded.value;

function activate(position) {
  if (props.selectedSource) emit("target", { zoneId: props.zone.id, position });
  else emit("zone", props.zone);
}
function hover(position, active) {
  if (library.value) reveal.setActive(`pointer:${position}`, active);
}
function focus(event, position, active) {
  // Mouse clicks leave focus behind; only keyboard focus should hold the tray open.
  if (library.value) reveal.setActive(`focus:${position}`, active && event.target.matches(":focus-visible"));
}
async function keyboard(event, position) {
  if (!library.value) return;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    reveal.reveal();
    await nextTick();
    root.value?.querySelector('[data-pile-position="bottom"]')?.focus();
  } else if (event.key === "Escape" || (event.key === "ArrowRight" && position === "bottom")) {
    event.preventDefault();
    root.value?.querySelector('[data-pile-position="top"]')?.focus();
    reveal.dismiss();
  }
}
</script>

<template>
  <div
    ref="root"
    class="relative isolate grid min-w-0 pb-1"
    :class="library ? 'col-span-2 grid-cols-2 gap-1' : 'grid-cols-1'"
    :data-deck-expanded="library ? expanded : undefined"
    @hc-pile-hover="library && reveal.setActive('drag', $event.detail.active)"
  >
    <button
      v-for="position in positions"
      :key="position"
      type="button"
      class="group relative row-start-1 aspect-[5/7] min-w-0 w-full cursor-pointer rounded-md text-base-content outline-offset-2 transition-transform duration-300 ease-out focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none"
      :class="[
        bottomTarget(position) ? 'grid' : 'stack stack-bottom',
        library ? 'col-start-2' : 'col-start-1',
        library && position === 'bottom'
          ? expanded ? 'z-0 -translate-x-[calc(100%+0.25rem)]' : 'pointer-events-none z-0 translate-x-0'
          : 'z-10',
      ]"
      :inert="closedBottom(position)"
      :aria-hidden="closedBottom(position) ? true : undefined"
      :tabindex="closedBottom(position) ? -1 : 0"
      :aria-label="bottomTarget(position) ? `${playerName}: ${zone.label} bottom drop zone` : `${playerName}: ${zone.label}${library ? ` ${position}` : ''}, ${zone.count} cards`"
      :title="library && position === 'top' ? `${own ? 'Drag the top card to your hand to draw. ' : ''}Hover for 1 second or drag a card here to show the bottom. Left Arrow or long-press also opens it.` : `${zone.label}${library ? ` ${position}` : ''}`"
      :aria-expanded="library && position === 'top' ? expanded : undefined"
      :data-hc-pile="library ? zone.id : undefined"
      :data-pile-position="position"
      :data-hc-drop-zone="zone.id"
      :data-hc-drop-position="position"
      :data-hc-drop-disabled="closedBottom(position) ? 'true' : undefined"
      :data-hc-drop-label="`${playerName}’s ${zone.label}${library ? ` · ${position}` : ''}`"
      :data-hc-draw-from="own && library && position === 'top' && zone.count ? zone.id : undefined"
      :data-hc-card="!library ? card?.id : undefined"
      @pointerenter="hover(position, true)"
      @pointerleave="hover(position, false)"
      @focus="focus($event, position, true)"
      @blur="focus($event, position, false)"
      @keydown="keyboard($event, position)"
      @contextmenu="library && ($event.preventDefault(), reveal.reveal())"
      @click="activate(position)"
      @keydown.space.prevent="own && library && position === 'top' ? emit('select', { drawFrom: zone.id }) : activate(position)"
    >
      <span class="relative min-h-0 min-w-0 overflow-hidden rounded-md border border-dashed border-base-content/45 bg-base-100 group-hover:border-primary" :class="bottomTarget(position) ? 'mb-[7px]' : ''">
        <CardBack v-if="!bottomTarget(position) && concealed" class="pointer-events-none absolute inset-0 h-full w-full rounded-none border-0" />
        <img
          v-else-if="!bottomTarget(position) && card?.image_url"
          :src="card.image_url"
          alt=""
          width="100"
          height="140"
          class="pointer-events-none absolute inset-0 h-full w-full object-contain"
          :draggable="false"
        />
        <span v-else-if="!bottomTarget(position)" class="absolute inset-0 grid place-items-center break-words px-1 pb-6 text-[10px] text-base-content/45">{{ card?.name || "Empty" }}</span>
        <span class="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-base-100 via-base-100/80 to-transparent px-1 pt-5 pb-1 text-left">
          <span class="block text-[9px] leading-3 font-semibold">{{ zone.label }}</span>
          <span class="flex items-center justify-between gap-0.5 text-[9px] leading-3 text-base-content/80">
            <span v-if="library">{{ position === "top" ? "Top" : "Bottom" }}</span>
            <span v-if="!bottomTarget(position)" class="ml-auto tabular-nums">{{ zone.count }}</span>
          </span>
        </span>
      </span>
      <span v-for="n in bottomTarget(position) ? 0 : layers" :key="n" aria-hidden="true" class="pointer-events-none rounded-md border border-base-content/35 bg-base-300" />
    </button>
  </div>
</template>
