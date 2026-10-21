<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import PlayerBoard from "./PlayerBoard.vue";
import CardTile from "./CardTile.vue";
import CardInspector from "./CardInspector.vue";
import TableActionDialog from "./TableActionDialog.vue";
import { createCardDragController } from "../../../../shared/card-drag.mjs";
const props = defineProps({
  table: { type: Object, required: true },
  app: Object,
  human: Object,
  readonly: Boolean,
  compact: Boolean,
});
const root = ref(null),
  inspected = ref(null),
  historical = ref(false),
  zone = ref(null),
  zoneDialog = ref(null),
  actionMode = ref(""),
  dragStatus = ref(""),
  seatChoice = ref("");
let drag = null;
const name = (id) =>
  props.table.players.find((p) => p.id === id)?.name || id || "—";
const players = computed(() => {
  const ps = [...props.table.players];
  if (
    !props.readonly &&
    props.human?.seatId &&
    ps.length === 2 &&
    props.app?.match?.layout !== "emperor"
  )
    return ps.sort(
      (a, b) =>
        (a.id === props.human.seatId ? 1 : 0) -
        (b.id === props.human.seatId ? 1 : 0),
    );
  return ps;
});
const split = computed(() =>
  players.value.length === 1
    ? 0
    : Math.ceil(Math.min(players.value.length, 6) / 2),
);
const top = computed(() => players.value.slice(0, split.value));
const bottom = computed(() => players.value.slice(split.value));
const columns = (count) =>
  count === 1
    ? "grid-cols-1"
    : count === 2
      ? props.compact
        ? "grid-cols-2"
        : "grid-cols-1 xl:grid-cols-2"
      : props.compact
        ? "grid-cols-3"
        : "grid-cols-1 lg:grid-cols-3";
const phases = computed(() => [
  ...new Set(
    [
      "Setup",
      "Untap",
      "Upkeep",
      "Draw",
      "Main 1",
      "Begin combat",
      "Declare attackers",
      "Declare blockers",
      "Combat damage",
      "End combat",
      "Main 2",
      "End step",
      "Cleanup",
      props.table.turn?.phase,
    ].filter(Boolean),
  ),
]);
const boardIndex = (p) => props.table.players.findIndex((x) => x.id === p.id);
const team = computed(
  () =>
    props.app?.match?.layout === "emperor" && props.table.players.length === 6,
);
const humans = computed(
  () => props.app?.match?.players?.filter((p) => p.ai === false) || [],
);
watch(
  humans,
  (list) => {
    if (!list.some((p) => p.id === seatChoice.value))
      seatChoice.value = list[0]?.id || "";
  },
  { immediate: true },
);
function attempt(fn) {
  try {
    if (props.human) props.human.error = "";
    return fn();
  } catch (error) {
    if (props.human) props.human.error = error.message;
    dragStatus.value = error.message;
    return false;
  }
}
function select(source) {
  if (!props.readonly) attempt(() => props.human?.selectSource(source));
}
function target(dest) {
  if (props.human?.selectedSource)
    attempt(() => props.human.queueDrop(props.human.selectedSource, dest));
}
function inspect(card, { historical: history = false } = {}) {
  zone.value = null;
  zoneDialog.value?.close();
  historical.value = history;
  inspected.value = card;
}
function closePrivate() {
  inspected.value = null;
  zone.value = null;
  zoneDialog.value?.close();
  actionMode.value = "";
  drag?.cancel();
  dragStatus.value = "";
}
watch(() => props.human?.seatId, closePrivate);
watch(
  () => props.human?.view,
  (next, old) => {
    if (old && !next) closePrivate();
  },
);
watch(() => props.app?.match?.id, closePrivate);
async function browse(value) {
  zone.value = value;
  await nextTick();
  if (!zoneDialog.value.open) zoneDialog.value.showModal();
}
function action(mode) {
  attempt(() => {
    const quick = {
      draw: () => props.human.draw(),
      shuffle: () => props.human.shuffle(),
      untap: () => props.human.untap(),
      return: () => props.human.returnHand(),
    };
    if (quick[mode]) quick[mode]();
    else actionMode.value = mode;
  });
}
function phase(event) {
  attempt(() =>
    props.human.queue(
      { type: "turn", set: { phase: event.target.value } },
      `Set phase to ${event.target.value}`,
    ),
  );
}
function keyboard(event) {
  if (event.key === "Escape") props.human?.cancelSelection();
}
onMounted(() => {
  if (props.readonly || !props.human) return;
  drag = createCardDragController({
    root: root.value,
    canStart: (s) => props.human.canDrag(s),
    canDrop: (s, t) => props.human.canDrop(s, t),
    getContext: () => props.human.context(),
    onDrop: (s, t) => attempt(() => props.human.queueDrop(s, t)),
    onStatus: (text) => (dragStatus.value = text),
  });
});
watch(
  () => props.human?.context?.(),
  () => drag?.sync(),
);
onBeforeUnmount(() => drag?.destroy());
defineExpose({ inspect });
</script>
<template>
  <div
    ref="root"
    class="min-w-0 [&_.hc-drop-ready]:outline [&_.hc-drop-ready]:outline-dashed [&_.hc-drop-ready]:outline-primary/60 [&_.hc-drop-ready]:outline-offset-2 [&_.hc-drop-active]:outline-2 [&_.hc-drop-active]:outline-solid [&_.hc-drop-active]:outline-primary [&_.hc-drop-active]:bg-primary/10 [&_.hc-drag-source]:opacity-40 [&.hc-dragging]:cursor-grabbing [&.hc-dragging]:[user-select:none]"
    @keydown="keyboard"
  >
    <section
      v-if="!compact && !readonly && human && !human.seatId && humans.length"
      id="human-controls"
      class="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-base-300 bg-base-200 p-3"
    >
      <label class="flex items-center gap-2 text-sm"
        >Play as<select
          aria-label="Play as"
          v-model="seatChoice"
          class="select select-sm w-40"
        >
          <option v-for="p in humans" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
        </select></label
      ><button
        class="btn btn-sm btn-primary"
        :disabled="!seatChoice || human.busy"
        @click="human.join(seatChoice)"
      >
        Enter seat · show hand</button
      ><span class="text-xs text-base-content/60"
        >Private cards stay hidden until you enter.</span
      >
    </section>
    <p
      v-if="!compact && !readonly && human?.seatId"
      class="mb-3 text-xs text-base-content/65"
      role="status"
    >
      {{ human.status }}
    </p>
    <p
      v-if="!readonly && human?.error"
      class="alert alert-error mb-3 text-sm"
      role="alert"
    >
      {{ human.error }}
    </p>
    <p v-if="!readonly && table.players.length > 6" class="alert mb-4">
      The viewer supports up to six players. This larger table can continue
      through MCP.
    </p>
    <div
      v-if="readonly || table.players.length <= 6"
      :class="
        compact
          ? 'flex h-[calc(100dvh-var(--table-toolbar-height,80px)-8px)] min-h-96 flex-col gap-1.5'
          : ''
      "
      data-table-arena
    >
      <div
        v-if="top.length"
        class="grid"
        :class="[
          columns(top.length),
          compact ? 'min-h-0 flex-1 gap-1.5' : 'gap-3',
        ]"
      >
        <PlayerBoard
          v-for="p in top"
          :key="p.id"
          :player="p"
          :table="table"
          :app="app"
          :human="human"
          :index="boardIndex(p)"
          :team="team"
          :readonly="readonly"
          :compact="compact"
          @inspect="inspect"
          @zone="browse"
          @action="action"
          @select="select"
          @target="target"
        />
      </div>
      <section
        class="flex items-center border-y border-base-300 px-2"
        :class="
          compact ? 'min-h-12 shrink-0 gap-3 py-1' : 'my-3 flex-wrap gap-5 py-3'
        "
        aria-label="Shared table"
      >
        <div
          :class="
            compact
              ? 'flex min-w-0 max-w-[75%] flex-wrap items-center gap-x-3 gap-y-1'
              : 'min-w-40'
          "
        >
          <div>
            <p class="text-sm font-semibold">
              Turn {{ table.turn.number }} · {{ name(table.turn.active) }}
            </p>
            <p
              :class="
                compact
                  ? 'text-[10px] leading-4 text-base-content/65'
                  : 'mt-1 text-xs text-base-content/65'
              "
            >
              {{ table.turn.phase || "Setup" }} · Priority:
              {{ name(table.turn.priority) }}
            </p>
          </div>
          <div
            v-if="human?.seatId && !readonly"
            class="flex flex-wrap items-center gap-2"
            :class="compact ? '' : 'mt-2'"
          >
            <label class="flex items-center gap-2 text-xs"
              >Phase<select
                aria-label="Turn phase"
                :value="table.turn.phase || 'Setup'"
                class="select"
                :class="compact ? 'select-xs w-28' : 'select-sm w-36'"
                :disabled="!human.canCommit"
                @change="phase"
              >
                <option v-for="value in phases" :key="value">
                  {{ value }}
                </option>
              </select></label
            ><button
              class="btn btn-xs"
              :disabled="!human.canCommit"
              @click="action('markers')"
            >
              Edit turn
            </button>
          </div>
        </div>
        <section
          class="flex min-w-0 flex-1 items-center rounded-md border border-transparent"
          :class="compact ? 'gap-2' : 'min-h-18 gap-3 p-1'"
          data-hc-drop-zone="stack"
          data-hc-drop-position="top"
          data-hc-drop-label="Stack · top"
          @click.self="target({ zoneId: 'stack', position: 'top' })"
        >
          <div class="shrink-0 text-xs tracking-wider text-base-content/70">
            STACK<br /><span class="text-[10px] font-mono">TOP FIRST</span>
          </div>
          <div
            class="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1"
            @click.self="target({ zoneId: 'stack', position: 'top' })"
          >
            <div
              v-for="(card, index) in table.zones?.stack?.cards || []"
              :key="card.id"
              class="relative pt-1"
            >
              <span
                v-if="index === 0"
                class="pointer-events-none absolute -top-1 left-1 z-10 rounded bg-primary px-1 font-mono text-[10px] text-primary-content"
                >TOP</span
              ><CardTile
                :card="card"
                compact
                :miniature="compact"
                :draggable="human?.canDrag?.({ cardId: card.id })"
                :selected="human?.selectedSource?.cardId === card.id"
                @inspect="inspect"
                @select="select"
              />
            </div>
            <span
              v-if="!table.zones?.stack?.cards?.length"
              class="self-center text-sm text-base-content/50"
              >Stack is empty</span
            >
          </div>
        </section>
      </section>
      <div
        class="grid"
        :class="[
          columns(Math.min(bottom.length, 3)),
          compact ? 'min-h-0 flex-1 gap-1.5' : 'gap-3',
        ]"
      >
        <PlayerBoard
          v-for="p in bottom"
          :key="p.id"
          :player="p"
          :table="table"
          :app="app"
          :human="human"
          :index="boardIndex(p)"
          :team="team"
          :readonly="readonly"
          :compact="compact"
          @inspect="inspect"
          @zone="browse"
          @action="action"
          @select="select"
          @target="target"
        />
      </div>
    </div>
    <div v-if="human?.selectedSource && !readonly" class="alert mt-3 text-sm">
      <span>Card selected · choose a zone to queue the move.</span
      ><button class="btn btn-sm" @click="human.cancelSelection()">
        Cancel selection
      </button>
    </div>
    <p v-if="dragStatus" class="mt-2 text-xs text-primary" aria-live="polite">
      {{ dragStatus }}
    </p>
    <footer
      v-if="!compact"
      class="mt-3 flex flex-wrap justify-between gap-2 border-t border-base-300 pt-3 text-xs text-base-content/60"
    >
      <span>{{
        readonly
          ? "Owner review · saved position"
          : human?.seatId
            ? "Your seat’s view · select a card to inspect it"
            : "Public information · select a card to inspect it"
      }}</span
      ><span
        >Update {{ table.revision
        }}{{
          human?.pending?.length
            ? ` · Preview: ${human.pending.length} unsent actions`
            : ""
        }}</span
      >
    </footer>
    <CardInspector
      :card="inspected"
      :table="table"
      :human="human"
      :historical="historical"
      :readonly="readonly"
      @close="inspected = null"
      @select="select"
    />
    <TableActionDialog
      v-if="human"
      :mode="actionMode"
      :table="table"
      :human="human"
      @close="actionMode = ''"
    />
    <dialog
      ref="zoneDialog"
      class="modal"
      aria-labelledby="table-zone-title"
      @close="zone = null"
    >
      <div class="modal-box w-11/12 max-w-4xl">
        <header class="mb-4 flex justify-between gap-3">
          <div>
            <h2 id="table-zone-title" class="text-xl font-semibold">
              {{ zone?.name || zone?.id }}
            </h2>
            <p class="text-xs text-base-content/60">
              {{ zone?.count || 0 }} cards{{
                zone?.hidden_count ? ` · ${zone.hidden_count} concealed` : ""
              }}
            </p>
          </div>
          <button class="btn btn-sm btn-ghost" @click="zoneDialog.close()">
            Close
          </button>
        </header>
        <div class="flex flex-wrap gap-3">
          <CardTile
            v-for="card in zone?.cards || []"
            :key="card.id"
            :card="card"
            hand
            @inspect="inspect"
          />
        </div>
        <p
          v-if="!zone?.cards?.length"
          class="py-8 text-sm text-base-content/60"
        >
          {{
            zone?.count
              ? "These cards are concealed. Use a permitted look or draw action."
              : "This zone is empty."
          }}
        </p>
        <div
          v-if="human?.seatId && zone?.id === `${human.seatId}:library`"
          class="mt-4 flex gap-2"
        >
          <button
            class="btn btn-sm"
            :disabled="!human.canCommit"
            @click="
              action('draw');
              zoneDialog.close();
            "
          >
            Queue draw</button
          ><button
            class="btn btn-sm"
            :disabled="!human.canCommit"
            @click="
              zoneDialog.close();
              action('peek');
            "
          >
            Look at cards
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button>Close zone</button>
      </form>
    </dialog>
  </div>
</template>
