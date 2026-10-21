<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { GripVertical } from "@lucide/vue";
defineProps({ pane: { type: String, default: "table" } });
const root = ref(null),
  width = ref(340),
  max = ref(720),
  dragging = ref(false);
let observer, drag;
const clamp = (value) => Math.max(240, Math.min(max.value, value));
function resize() {
  max.value = Math.max(
    240,
    Math.min(720, (root.value?.clientWidth || 1000) - 440),
  );
  width.value = clamp(width.value);
}
function remember() {
  try {
    localStorage.setItem("game-night.sidebar-width", String(width.value));
  } catch {}
}
function down(e) {
  if (e.button || !e.isPrimary) return;
  e.preventDefault();
  e.currentTarget.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, width: width.value };
  dragging.value = true;
}
function move(e) {
  if (dragging.value) width.value = clamp(drag.width + drag.x - e.clientX);
}
function finish() {
  dragging.value = false;
  remember();
}
function key(e) {
  const next = {
    ArrowLeft: width.value + 10,
    ArrowRight: width.value - 10,
    Home: 240,
    End: max.value,
  }[e.key];
  if (next === undefined) return;
  e.preventDefault();
  width.value = clamp(next);
  remember();
}
onMounted(() => {
  try {
    const saved = Number(localStorage.getItem("game-night.sidebar-width"));
    if (saved >= 240) width.value = saved;
  } catch {}
  resize();
  observer = new ResizeObserver(resize);
  observer.observe(root.value);
});
onUnmounted(() => observer?.disconnect());
</script>
<template>
  <div
    ref="root"
    class="grid min-h-0 flex-1 items-stretch grid-cols-[minmax(0,1fr)_16px_var(--chat-width)] max-[1050px]:grid-cols-1"
    :class="{ 'select-none': dragging }"
    :style="{ '--chat-width': `${width}px` }"
  >
    <section id="table-pane" class="min-h-0 min-w-0 overflow-auto overscroll-contain" :class="pane === 'chat' ? 'max-[1050px]:hidden' : ''" aria-label="Game field"><slot /></section>
    <div
      role="separator"
      tabindex="0"
      aria-label="Resize table chat"
      aria-orientation="vertical"
      :aria-valuenow="width"
      :aria-valuemin="240"
      :aria-valuemax="max"
      class="self-stretch max-[1050px]:hidden flex cursor-col-resize touch-none items-center justify-center rounded hover:bg-base-300 focus-visible:outline-2 focus-visible:outline-primary"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="finish"
      @pointercancel="finish"
      @lostpointercapture="finish"
      @keydown="key"
      @dblclick="
        width = 340;
        resize();
        remember();
      "
    >
      <GripVertical class="size-4 text-base-content/40" aria-hidden="true" />
    </div>
    <aside id="chat-pane" class="flex min-h-0 min-w-0 flex-col overflow-y-auto overscroll-contain" :class="pane === 'table' ? 'max-[1050px]:hidden' : ''" aria-label="Chat and turn tracking">
      <slot name="chat" />
    </aside>
  </div>
</template>
