<script setup>
import { computed, ref, useId } from "vue";
import { Eye, Shuffle, RotateCcw, Ellipsis } from "@lucide/vue";
import CardTile from "./CardTile.vue";
import CardBack from "./CardBack.vue";
const props = defineProps({
  player: Object,
  table: Object,
  app: Object,
  human: Object,
  index: Number,
  team: Boolean,
  readonly: Boolean,
  compact: Boolean,
});
const emit = defineEmits(["inspect", "zone", "action", "select", "target"]);
const actionsMenu = ref(null);
const menuId = useId().replaceAll(":", "");
function menuAction(action) {
  actionsMenu.value?.hidePopover();
  emit("action", action);
}
function inspectBoard() {
  emit("zone", {
    id: "battlefield",
    name: `${props.player.name} · battlefield`,
    cards: field.value,
    count: field.value.length,
  });
}
const own = computed(() => props.human?.seatId === props.player.id);
const config = computed(
  () => props.app?.match?.players?.find((p) => p.id === props.player.id) || {},
);
const field = computed(
  () =>
    props.table.zones?.battlefield?.cards?.filter(
      (c) => c.controller === props.player.id,
    ) || [],
);
const lanes = computed(() => [
  {
    name: "Permanents",
    cards: field.value.filter(
      (c) => !(c.type_line || "").split("—")[0].includes("Land"),
    ),
  },
  {
    name: "Lands",
    cards: field.value.filter((c) =>
      (c.type_line || "").split("—")[0].includes("Land"),
    ),
  },
]);
const hand = computed(
  () =>
    props.table.zones?.[`${props.player.id}:hand`] || { count: 0, cards: [] },
);
const zones = computed(() =>
  [
    ["library", "Deck"],
    ["graveyard", "Graveyard"],
    ["exile", "Exile"],
    ["command", "Command"],
    ["sideboard", "Sideboard"],
  ]
    .map(([kind, label]) => ({
      kind,
      label,
      ...props.table.zones?.[`${props.player.id}:${kind}`],
    }))
    .filter((z) => z.id),
);
const outcome = computed(() => {
  const winners = props.table.result?.winners;
  if (winners?.includes(props.player.id)) return "WINNER";
  if (props.player.status === "conceded") return "CONCEDED";
  if (props.player.status === "eliminated" || winners?.length) return "DEAD";
  return winners ? "DRAW" : "";
});
const status = computed(() => {
  const worker = props.app?.coordinator?.players?.find(
    (p) => p.id === props.player.id,
  );
  return worker?.active
    ? "Thinking…"
    : props.app?.coordinator?.pendingRecipient?.playerId === props.player.id
      ? own.value
        ? "Your response"
        : "Has control"
      : "";
});
const sourceSelected = (card) =>
  props.human?.selectedSource?.cardId === card.id;
const topCard = (z) =>
  z.kind === "graveyard" ? z.cards?.at(-1) : z.cards?.[0];
</script>
<template>
  <section
    class="relative min-w-0 rounded-xl border bg-base-200"
    :class="[
      compact ? 'flex h-full min-h-0 flex-col gap-1.5 p-2' : 'p-3 sm:p-4',
      table.turn.priority === player.id
        ? 'border-primary/70 shadow-[inset_0_3px_0_0_var(--color-primary)]'
        : 'border-base-300',
    ]"
    :aria-label="`${player.name} battlefield`"
    :data-player="player.id"
  >
    <header v-if="compact" class="flex min-h-7 shrink-0 items-center gap-2">
      <div v-if="config.avatar" class="avatar shrink-0">
        <div class="w-7 rounded-full">
          <img
            :src="`/avatars/${config.avatar}.png`"
            alt=""
            width="28"
            height="28"
            class="object-cover"
          />
        </div>
      </div>
      <div class="min-w-0 flex-1">
        <h2 class="flex items-center gap-1.5 text-sm font-semibold leading-4">
          <span class="truncate">{{ player.name }}</span
          ><span
            v-if="table.turn.priority === player.id"
            class="badge badge-xs badge-soft"
            >Priority</span
          ><span
            v-if="status"
            class="truncate text-[10px] font-normal text-primary"
            >{{ status }}</span
          >
        </h2>
        <p
          class="flex gap-2 overflow-x-auto text-[10px] leading-3.5 text-base-content/60"
        >
          <span v-if="team" class="shrink-0">{{
            `${index < 3 ? "Team A" : "Team B"} · ${index % 3 === 1 ? "Emperor" : "Flank"}`
          }}</span>
          <span class="shrink-0"
            >{{ table.zones?.[`${player.id}:library`]?.count ?? 0 }} deck ·
            {{ hand.count }} hand</span
          >
          <span
            v-for="(value, name) in player.counters"
            :key="name"
            class="shrink-0"
            >{{ value }} {{ name }}</span
          >
          <span
            v-for="(value, name) in player.mana"
            :key="name"
            class="shrink-0"
            >{{ value }} {{ name }} mana</span
          >
        </p>
      </div>
      <div class="shrink-0 text-2xl leading-7 tabular-nums">
        {{ player.life
        }}<span class="ml-1 text-[10px] text-base-content/60">life</span>
      </div>
      <button
        class="btn btn-xs btn-square btn-ghost"
        :aria-label="`Inspect ${player.name}’s battlefield`"
        @click="inspectBoard"
      >
        <Eye :size="14" aria-hidden="true" />
      </button>
      <button
        v-if="own"
        class="btn btn-xs btn-square"
        :popovertarget="`${menuId}-actions`"
        :style="{ anchorName: `--${menuId}` }"
        :aria-label="`${player.name}’s table actions`"
      >
        <Ellipsis :size="15" aria-hidden="true" />
      </button>
      <ul
        v-if="own"
        ref="actionsMenu"
        popover
        :id="`${menuId}-actions`"
        :style="{ positionAnchor: `--${menuId}` }"
        class="dropdown dropdown-end menu menu-sm z-30 w-48 rounded-box border border-base-300 bg-base-100 p-1 shadow-lg"
      >
        <li
          v-for="[action, label] in [
            ['draw', 'Draw a card'],
            ['draw-many', 'Draw cards'],
            ['shuffle', 'Shuffle deck'],
            ['untap', 'Untap all'],
            ['life', 'Life & counters'],
            ['return', 'Return hand'],
            ['peek', 'Look at cards'],
            ['token', 'Create token'],
            ['ability', 'Stack ability'],
            ['outcome', 'Concede / outcome'],
          ]"
          :key="action"
        >
          <button :disabled="!human.canCommit" @click="menuAction(action)">
            {{ label }}
          </button>
        </li>
      </ul>
    </header>
    <header v-else class="mb-2 flex items-start justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2">
        <div v-if="config.avatar" class="avatar">
          <div class="w-9 rounded-full">
            <img
              :src="`/avatars/${config.avatar}.png`"
              alt=""
              width="36"
              height="36"
              class="object-cover"
            />
          </div>
        </div>
        <div v-else class="avatar avatar-placeholder">
          <div class="w-9 rounded-full bg-base-300 text-base-content">
            <span class="text-xs">{{ index + 1 }}</span>
          </div>
        </div>
        <div class="min-w-0">
          <div class="text-xs text-base-content/60">
            {{
              team
                ? `${index < 3 ? "Team A" : "Team B"} · ${index % 3 === 1 ? "Emperor" : "Flank"}`
                : `Seat ${index + 1}`
            }}{{ own ? " · Your battlefield" : "" }}
          </div>
          <h2 class="flex flex-wrap items-center gap-2 font-semibold">
            {{ player.name
            }}<span
              v-if="table.turn.priority === player.id"
              class="badge badge-sm badge-soft"
              >Priority</span
            >
          </h2>
        </div>
      </div>
      <div class="shrink-0 text-3xl font-medium tabular-nums">
        {{ player.life }}
        <span class="text-xs font-normal text-base-content/60">life</span>
      </div>
    </header>
    <p
      v-if="!compact"
      class="mb-1 flex flex-wrap gap-x-3 text-xs text-base-content/65"
    >
      <span
        >{{ table.zones?.[`${player.id}:library`]?.count ?? 0 }} library</span
      ><span>{{ hand.count }} hand</span
      ><span v-for="(value, name) in player.counters" :key="name"
        >{{ value }} {{ name }}</span
      ><span v-for="(value, name) in player.mana" :key="name"
        >{{ value }} {{ name }} mana</span
      >
    </p>
    <p
      v-if="status && !compact"
      class="mb-2 text-xs text-primary"
      aria-live="polite"
    >
      {{ status }}
    </p>
    <div
      class="grid"
      :class="
        compact
          ? 'min-h-0 flex-1 grid-cols-[minmax(0,1fr)_7.5rem] gap-2'
          : 'grid-cols-[minmax(0,1fr)_7.5rem] gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]'
      "
    >
      <div
        class="flex min-w-0 flex-col"
        :class="
          compact
            ? 'min-h-0 gap-1 [@media(min-width:900px)_and_(max-height:800px)]:flex-row [@media(min-width:900px)_and_(max-height:800px)]:gap-3'
            : 'gap-3'
        "
      >
        <section
          v-for="lane in lanes"
          :key="lane.name"
          class="min-w-0 rounded-md border border-transparent"
          :class="
            compact ? 'flex min-h-0 flex-1 flex-col p-0.5' : 'min-h-25 p-1'
          "
          data-hc-drop-zone="battlefield"
          :data-hc-drop-controller="player.id"
          :data-hc-drop-label="`${player.name}’s battlefield`"
          @click.self="
            emit('target', { zoneId: 'battlefield', controller: player.id })
          "
        >
          <div
            class="flex shrink-0 justify-between text-base-content/60"
            :class="compact ? 'mb-0.5 text-[10px] leading-3' : 'mb-2 text-xs'"
          >
            <h3 class="tracking-wider uppercase">{{ lane.name }}</h3>
            <span>{{ lane.cards.length }}</span>
          </div>
          <div
            class="flex items-start"
            :class="
              compact
                ? 'min-h-0 flex-1 gap-1.5 overflow-auto overscroll-contain [container-type:size]'
                : 'min-h-16 flex-wrap gap-2'
            "
            @click.self="
              emit('target', { zoneId: 'battlefield', controller: player.id })
            "
          >
            <CardTile
              v-for="card in lane.cards"
              :key="card.id"
              :card="card"
              :dense="compact"
              :fit-lane="compact"
              :draggable="human?.canDrag?.({ cardId: card.id })"
              :selected="sourceSelected(card)"
              @inspect="emit('inspect', $event)"
              @select="emit('select', $event)"
            />
            <span
              v-if="!lane.cards.length"
              class="self-center text-xs text-base-content/45"
              >{{ own ? "Drop cards here" : "Empty" }}</span
            >
          </div>
        </section>
      </div>
      <div
        class="grid border-l border-base-300"
        :class="
          compact
            ? 'min-h-0 grid-cols-2 grid-rows-3 gap-1 pl-1.5'
            : 'grid-cols-2 content-start gap-1.5 pl-2'
        "
        :aria-label="`${player.name}’s card zones`"
      >
        <section
          v-for="zone in zones"
          :key="zone.id"
          class="min-h-0 min-w-0 rounded-md border border-dashed border-base-content/25 p-1"
          :class="zone.kind === 'library' ? 'row-span-2' : ''"
          :data-hc-drop-zone="zone.id"
          :data-hc-drop-position="zone.kind === 'library' ? 'top' : 'bottom'"
          :data-hc-drop-label="`${player.name}’s ${zone.kind}`"
        >
          <div
            v-if="!compact"
            class="mb-1 flex flex-wrap justify-between gap-1 text-xs"
          >
            <strong class="font-medium">{{ zone.label }}</strong
            ><span class="text-base-content/60">{{ zone.count }}</span>
          </div>
          <button
            class="w-full rounded text-xs hover:bg-base-300 focus-visible:outline-2 focus-visible:outline-primary"
            :class="
              compact
                ? 'flex min-h-0 items-center justify-center gap-1'
                : 'grid min-h-12 place-items-center'
            "
            type="button"
            :aria-label="`${player.name}: ${zone.kind}, ${zone.count} cards`"
            :data-hc-draw-from="
              own && zone.kind === 'library' ? zone.id : undefined
            "
            :data-hc-card="
              zone.kind !== 'library' ? topCard(zone)?.id : undefined
            "
            @click="
              human?.selectedSource
                ? emit('target', {
                    zoneId: zone.id,
                    position: zone.kind === 'library' ? 'top' : 'bottom',
                  })
                : emit('zone', zone)
            "
            @keydown.space.prevent="
              own && zone.kind === 'library'
                ? emit('select', { drawFrom: zone.id })
                : emit('zone', zone)
            "
          >
            <CardBack
              v-if="
                zone.kind === 'library' || (zone.count && !zone.cards?.length)
              "
              :class="compact ? 'w-4' : 'my-1 w-10'"
            />
            <img
              v-else-if="topCard(zone)?.image_url"
              :src="topCard(zone).image_url"
              alt=""
              width="45"
              height="63"
              class="aspect-[5/7] object-contain"
              :class="compact ? 'w-4' : 'w-10'"
              :draggable="false"
            />
            <span
              v-else-if="!compact"
              class="break-words py-2 text-base-content/50"
              >{{ topCard(zone)?.name || "Empty" }}</span
            >
            <span
              v-if="compact"
              class="min-w-0 flex-1 text-left text-[10px] leading-3"
              ><span class="block truncate">{{
                zone.kind === "graveyard"
                  ? "Grave"
                  : zone.kind === "sideboard"
                    ? "Side"
                    : zone.label
              }}</span
              ><span class="text-base-content/60">{{ zone.count }}</span></span
            >
          </button>
          <div
            v-if="zone.kind === 'library'"
            class="flex flex-wrap justify-center"
            :class="compact ? 'mt-0.5 gap-0' : 'mt-1 gap-1'"
          >
            <button
              v-for="position in ['top', 'bottom']"
              :key="position"
              class="btn btn-xs btn-ghost px-1"
              :class="compact ? 'h-4 min-h-4 text-[9px]' : ''"
              type="button"
              :aria-label="`${player.name}’s library ${position}`"
              :data-hc-drop-zone="zone.id"
              :data-hc-drop-position="position"
              @click="
                human?.selectedSource
                  ? emit('target', { zoneId: zone.id, position })
                  : emit('zone', zone)
              "
            >
              {{ position === "top" ? "Top" : "Bottom" }}
            </button>
            <template v-if="own && !compact"
              ><button
                class="btn btn-xs px-1"
                :disabled="!human.canCommit"
                @click="emit('action', 'draw')"
              >
                Draw</button
              ><button
                class="btn btn-xs px-1"
                :disabled="!human.canCommit"
                @click="emit('action', 'shuffle')"
              >
                <Shuffle :size="12" aria-hidden="true" />Shuffle
              </button></template
            >
          </div>
        </section>
      </div>
    </div>
    <div v-if="!compact" class="mt-3 flex flex-wrap justify-between gap-2">
      <div v-if="own" class="flex flex-wrap gap-1">
        <button
          class="btn btn-xs"
          :disabled="!human.canCommit"
          @click="emit('action', 'untap')"
        >
          <RotateCcw :size="12" aria-hidden="true" />Untap all</button
        ><button
          class="btn btn-xs"
          :disabled="!human.canCommit"
          @click="emit('action', 'life')"
        >
          Life & counters
        </button>
      </div>
      <button
        class="btn btn-xs btn-ghost ml-auto"
        @click="
          emit('zone', {
            id: 'battlefield',
            name: `${player.name} · battlefield`,
            cards: field,
            count: field.length,
          })
        "
      >
        <Eye :size="12" aria-hidden="true" />Inspect board
      </button>
    </div>
    <section
      :id="own ? 'human-controls' : undefined"
      class="shrink-0 border-t border-base-content/20"
      :class="compact ? 'pt-1' : 'mt-3 pt-3'"
      :aria-label="`${player.name}’s hand`"
      :data-hc-drop-zone="`${player.id}:hand`"
      :data-hc-drop-label="`${player.name}’s hand`"
      @click.self="emit('target', { zoneId: `${player.id}:hand` })"
    >
      <div
        class="flex items-center justify-between gap-2"
        :class="compact ? 'mb-0.5 min-h-5' : 'mb-2'"
      >
        <button
          v-if="own"
          class="btn btn-xs btn-ghost px-0"
          @click="emit('target', { zoneId: `${player.id}:hand` })"
        >
          Your hand
        </button>
        <h3
          v-else
          :class="
            compact
              ? 'text-[10px] font-medium uppercase tracking-wider'
              : 'text-sm font-semibold'
          "
        >
          Hand
        </h3>
        <span class="ml-auto text-xs text-base-content/60"
          >{{ hand.count }} cards{{ own ? " · private" : "" }}</span
        ><button
          v-if="own"
          class="btn btn-xs"
          :disabled="human.busy"
          @click="human.leave()"
        >
          Hide hand
        </button>
      </div>
      <p v-if="own && !compact" class="mb-2 text-xs text-base-content/60">
        Drag onto the battlefield or a zone. Moves stay queued until you send.
      </p>
      <div
        class="flex items-start gap-1.5 overflow-x-auto pb-1"
        :class="compact ? 'min-h-8' : 'min-h-14'"
        @click.self="emit('target', { zoneId: `${player.id}:hand` })"
      >
        <CardTile
          v-for="card in hand.cards || []"
          :key="card.id"
          :card="card"
          :compact="!own"
          :dense="compact"
          :hand="own"
          :draggable="human?.canDrag?.({ cardId: card.id })"
          :selected="sourceSelected(card)"
          @inspect="emit('inspect', $event)"
          @select="emit('select', $event)"
        />
        <CardBack
          v-for="n in Math.max(0, hand.count - (hand.cards?.length || 0))"
          :key="`hidden-${n}`"
          :class="compact ? 'w-[clamp(1.5rem,3.5dvh,2.5rem)]' : 'w-10'"
        />
        <span
          v-if="!hand.count"
          class="self-center text-xs text-base-content/45"
          >Empty hand</span
        >
      </div>
      <details v-if="own && !compact" class="mt-2">
        <summary class="cursor-pointer py-1 text-xs text-base-content/70">
          More table actions
        </summary>
        <div class="flex flex-wrap gap-1 py-2">
          <button
            v-for="[action, label] in [
              ['draw-many', 'Draw cards'],
              ['return', 'Return hand'],
              ['peek', 'Look at cards'],
              ['token', 'Create token'],
              ['ability', 'Stack ability'],
              ['outcome', 'Concede / outcome'],
            ]"
            :key="action"
            class="btn btn-xs"
            :disabled="!human.canCommit"
            @click="emit('action', action)"
          >
            {{ label }}
          </button>
        </div>
      </details>
    </section>
    <div
      v-if="outcome"
      class="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-base-100/65"
      :aria-label="`${player.name}: ${outcome}`"
    >
      <span
        class="-rotate-6 border-y-4 border-current px-5 py-2 text-3xl font-black tracking-widest"
        :class="outcome === 'WINNER' ? 'text-primary' : 'text-base-content/80'"
        >{{ outcome }}</span
      >
    </div>
  </section>
</template>
