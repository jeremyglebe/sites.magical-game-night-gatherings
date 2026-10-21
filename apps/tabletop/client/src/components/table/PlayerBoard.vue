<script setup>
import { computed, ref, useId } from "vue";
import { Eye, Shuffle, RotateCcw, Ellipsis } from "@lucide/vue";
import BattlefieldPile from "./BattlefieldPile.vue";
import PlayerHand from "./PlayerHand.vue";
import ZonePile from "./ZonePile.vue";
import { zoneLabel } from "../../../../shared/table-language.mjs";
import { battlefieldPiles } from "../../../../shared/battlefield-piles.mjs";
const props = defineProps({
  player: Object,
  table: Object,
  app: Object,
  human: Object,
  index: Number,
  team: Boolean,
  readonly: Boolean,
  compact: Boolean,
  upper: Boolean,
  playerDetails: Boolean,
  pileOrders: Object,
});
const emit = defineEmits(["inspect", "zone", "action", "select", "target", "player-details", "order"]);
const canOpenPlayers = computed(() => props.playerDetails && !props.readonly);
const actionsMenu = ref(null);
const menuId = useId().replaceAll(":", "");
function menuAction(action) {
  actionsMenu.value?.hidePopover();
  emit("action", action);
}
function inspectBoard() {
  emit("zone", {
    id: "battlefield",
    name: zoneLabel({ id: "battlefield", owner: props.player.id }, props.table.players),
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
const piles = computed(() => battlefieldPiles(props.table.zones?.battlefield?.cards || [])
  .filter((pile) => pile.root.controller === props.player.id));
const lanes = computed(() => {
  const groups = [
    {
      name: "Permanents",
      piles: piles.value.filter(
        (pile) => !(pile.root.type_line || "").split("—")[0].includes("Land"),
      ),
    },
    {
      name: "Lands",
      piles: piles.value.filter((pile) =>
        (pile.root.type_line || "").split("—")[0].includes("Land"),
      ),
    },
  ];
  return props.upper ? groups.reverse() : groups;
});
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
      <component
        :is="canOpenPlayers ? 'button' : 'div'"
        v-if="config.avatar"
        :type="canOpenPlayers ? 'button' : undefined"
        class="avatar shrink-0"
        :class="canOpenPlayers ? 'btn btn-sm btn-circle btn-ghost size-7 border-0 p-0' : ''"
        :aria-label="canOpenPlayers ? `View ${player.name} details` : undefined"
        :aria-haspopup="canOpenPlayers ? 'dialog' : undefined"
        :title="player.name"
        @click="canOpenPlayers && emit('player-details', player.id)"
      >
        <div class="w-7 rounded-full">
          <img
            :src="`/avatars/${config.avatar}.png`"
            alt=""
            width="28"
            height="28"
            class="object-cover"
          />
        </div>
      </component>
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
        <component
          :is="canOpenPlayers ? 'button' : 'div'"
          :type="canOpenPlayers ? 'button' : undefined"
          class="avatar shrink-0"
          :class="[!config.avatar && 'avatar-placeholder', canOpenPlayers && 'btn btn-sm btn-circle btn-ghost size-9 border-0 p-0']"
          :aria-label="canOpenPlayers ? `View ${player.name} details` : undefined"
          :aria-haspopup="canOpenPlayers ? 'dialog' : undefined"
          :title="player.name"
          @click="canOpenPlayers && emit('player-details', player.id)"
        >
          <div v-if="config.avatar" class="w-9 rounded-full">
            <img
              :src="`/avatars/${config.avatar}.png`"
              alt=""
              width="36"
              height="36"
              class="object-cover"
            />
          </div>
          <div v-else class="w-9 rounded-full bg-base-300 text-base-content">
            <span class="text-xs">{{ index + 1 }}</span>
          </div>
        </component>
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
    <PlayerHand
      v-if="upper"
      :player="player"
      :hand="hand"
      :human="human"
      :own="own"
      :compact="compact"
      upper
      @inspect="emit('inspect', $event)"
      @select="emit('select', $event)"
      @target="emit('target', $event)"
      @action="emit('action', $event)"
    />
    <div
      class="grid"
      :class="
        compact
          ? 'min-h-0 flex-2 grid-cols-[minmax(0,1fr)_7.5rem] gap-2'
          : 'grid-cols-[minmax(0,1fr)_7.5rem] gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]'
      "
    >
      <div
        class="flex min-w-0 flex-col"
        :class="
          compact
            ? 'min-h-0 gap-1'
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
            <span>{{ lane.piles.reduce((count, pile) => count + pile.cards.length, 0) }}</span>
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
            <BattlefieldPile
              v-for="pile in lane.piles"
              :key="pile.root.id"
              :pile="pile"
              :order="pileOrders?.[pile.root.id]"
              :human="human"
              :compact="compact"
              :readonly="readonly"
              @inspect="emit('inspect', $event)"
              @select="emit('select', $event)"
              @order="emit('order', $event)"
            />
            <span
              v-if="!lane.piles.length"
              class="self-center text-xs text-base-content/45"
              >{{ own ? "Drop cards here" : "Empty" }}</span
            >
          </div>
        </section>
      </div>
      <div
        class="grid min-w-0 grid-cols-2 auto-rows-max content-start border-l border-base-300"
        :class="
          compact
            ? 'min-h-0 gap-1 overflow-y-auto overscroll-contain pl-1.5 [scrollbar-width:thin]'
            : 'gap-1.5 pl-2'
        "
        :aria-label="`${player.name}’s card zones`"
      >
        <ZonePile
          v-for="zone in zones"
          :key="zone.id"
          :zone="zone"
          :player-name="player.name"
          :own="own"
          :selected-source="human?.selectedSource"
          @zone="emit('zone', $event)"
          @target="emit('target', $event)"
          @select="emit('select', $event)"
        />
      </div>
    </div>
    <div v-if="!compact" class="mt-3 flex flex-wrap justify-between gap-2">
      <div v-if="own" class="flex flex-wrap gap-1">
        <button class="btn btn-xs" :disabled="!human.canCommit" @click="emit('action', 'draw')">Draw a card</button>
        <button class="btn btn-xs" :disabled="!human.canCommit" @click="emit('action', 'shuffle')"><Shuffle :size="12" aria-hidden="true" />Shuffle</button>
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
            name: zoneLabel({ id: 'battlefield', owner: player.id }, table.players),
            cards: field,
            count: field.length,
          })
        "
      >
        <Eye :size="12" aria-hidden="true" />Inspect board
      </button>
    </div>
    <PlayerHand
      v-if="!upper"
      :player="player"
      :hand="hand"
      :human="human"
      :own="own"
      :compact="compact"
      @inspect="emit('inspect', $event)"
      @select="emit('select', $event)"
      @target="emit('target', $event)"
      @action="emit('action', $event)"
    />
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
