<script setup>
import {
  computed,
  ref,
  reactive,
  watch,
} from "vue";
import { Plus, TriangleAlert, RefreshCw, History, Gauge, MoreHorizontal, Settings2, ClipboardList, ScrollText } from "@lucide/vue";
import { useLiveTable } from "../composables/useLiveTable.js";
import { useHumanPlayer } from "../composables/useHumanPlayer.js";
import GameTable from "../components/table/GameTable.vue";
import ChatPanel from "../components/chat/ChatPanel.vue";
import TurnTracker from "../components/chat/TurnTracker.vue";
import SetupPanel from "../components/setup/SetupPanel.vue";
import PreparationPanel from "../components/preparation/PreparationPanel.vue";
import BetweenGamesPanel from "../components/preparation/BetweenGamesPanel.vue";
import MatchScore from "../components/preparation/MatchScore.vue";
import CardInspector from "../components/table/CardInspector.vue";
import ResizableWorkspace from "../components/layout/ResizableWorkspace.vue";
import RunControls from "../components/runner/RunControls.vue";
import RunLimits from "../components/runner/RunLimits.vue";
import TablePanels from "../components/runner/TablePanels.vue";
const { app, table, connected, loading, error, legacy, refresh, request } =
  useLiveTable();
const human = reactive(
  useHumanPlayer({ app, publicTable: table, connected, request, refresh }),
);
const gameTable = ref(null),
  limits = ref(null),
  panels = ref(null),
  tableMenu = ref(null),
  mobilePane = ref("table"),
  busy = ref(false),
  actionError = ref(""),
  showSetup = ref(false);
const displayedTable = computed(
  () => human.displayTable || human.preview || human.view || table.value,
);
const preparing = computed(() => displayedTable.value?.preparation?.status === "selecting");
const betweenGames = computed(() => displayedTable.value?.series?.status === "between_games");
const preparationCard = ref(null);
function inspectChatCard(card, options) {
  if (preparing.value || betweenGames.value) preparationCard.value = card;
  else gameTable.value?.inspect(card, options);
}
const humans = computed(
  () => app.value?.match?.players?.filter((p) => p.ai === false) || [],
);
function closeMenu() { tableMenu.value?.hidePopover(); }
function openLimits() { closeMenu(); limits.value?.open(); }
function changeSeat(event) {
  if (event.target.value) human.join(event.target.value);
  else human.leave();
}
watch(
  () => app.value?.match?.id,
  () => {
    showSetup.value = false;
    mobilePane.value = "table";
    actionError.value = "";
  },
);
async function operate(path, body) {
  if (busy.value) return;
  busy.value = true;
  actionError.value = "";
  try {
    await request(path, body);
    await refresh();
    return true;
  } catch (e) {
    actionError.value = e.message;
    return false;
  } finally {
    busy.value = false;
  }
}
function create(setup) {
  return operate("/api/match", setup);
}
async function newTable() {
  closeMenu();
  if (["running", "stepping"].includes(app.value?.coordinator?.mode)) {
    actionError.value =
      "Pause or stop the current players before creating another table.";
    return;
  }
  showSetup.value = true;
}
</script>
<template>
  <main
    class="mx-auto flex h-dvh max-w-[2400px] flex-col overflow-hidden p-2 sm:px-3"
  >
    <header
      class="relative z-20 mb-2 flex shrink-0 flex-col gap-1 border-b border-base-300 pb-2"
      aria-label="Table controls"
    >
      <div class="flex min-w-0 items-center gap-2">
        <span
          class="status status-sm shrink-0"
          :class="connected ? 'status-success' : 'status-error'"
          :title="connected ? 'Connected' : 'Disconnected'"
          :aria-label="connected ? 'Connected' : 'Disconnected'"
        ></span>
        <h1
          class="truncate text-sm font-semibold"
          :title="app?.match?.title || table?.title || 'Game Night'"
        >
          {{ app?.match?.title || table?.title || "Game Night" }}
        </h1>
      </div>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div class="min-w-0 flex-1 max-sm:basis-full">
          <MatchScore v-if="table && !showSetup" :series="table.series" :players="table.players" />
        </div>
        <div class="flex max-w-full shrink-0 flex-wrap items-center gap-1" role="group" aria-label="Table actions">
      <select
        v-if="table && !showSetup && humans.length"
        id="seat-selector"
        class="select select-sm w-auto max-w-40"
        aria-label="View or play as"
        :value="human.seatId || ''"
        :disabled="human.busy"
        @change="changeSeat"
      >
        <option value="">Spectator</option>
        <option v-for="player in humans" :key="player.id" :value="player.id">
          Play as {{ player.name }}
        </option>
      </select>
      <div v-if="app?.postgame && !showSetup" class="tooltip tooltip-bottom inline-flex" data-tip="Game feedback">
      <button
        class="btn btn-sm btn-square btn-ghost"
        aria-label="Feedback"
        @click="panels.open('feedback')"
        ><ClipboardList class="size-4" aria-hidden="true" /></button
      >
      </div>
      <RunControls
        v-else-if="!legacy && app?.match && !showSetup"
        :run="app?.coordinator"
        :busy="busy"
        @control="operate('/api/control', { action: $event })"
      />
      <template v-if="table && app?.match && !showSetup">
        <div class="tooltip tooltip-bottom inline-flex" data-tip="Plan usage">
        <button class="btn btn-sm btn-ghost btn-square" @click="panels.open('usage')" aria-label="Plan usage">
          <Gauge class="size-4" aria-hidden="true" />
        </button>
        </div>
        <div role="group" aria-label="Workspace view" class="tabs tabs-box tabs-xs min-[1051px]:hidden">
          <button class="tab tooltip tooltip-bottom" data-tip="Show the table" :class="mobilePane === 'table' ? 'tab-active' : ''" :aria-pressed="mobilePane === 'table'" aria-controls="table-pane" @click="mobilePane = 'table'">Table</button>
          <button class="tab tooltip tooltip-bottom" data-tip="Show table chat" :class="mobilePane === 'chat' ? 'tab-active' : ''" :aria-pressed="mobilePane === 'chat'" aria-controls="chat-pane" @click="mobilePane = 'chat'">Chat</button>
        </div>
      </template>
      <div class="tooltip tooltip-bottom tooltip-end inline-flex" data-tip="More table controls">
      <button class="btn btn-sm btn-ghost btn-square [anchor-name:--table-menu]" popovertarget="table-menu" aria-label="More table controls"><MoreHorizontal class="size-4" aria-hidden="true" /></button>
      </div>
        </div>
      </div>
      <ul ref="tableMenu" id="table-menu" popover class="dropdown dropdown-end menu menu-sm z-30 w-48 rounded-box border border-base-300 bg-base-100 p-1 shadow-lg [position-anchor:--table-menu]">
        <li v-if="table && app?.match"><RouterLink :to="`/games/${app.match.id}`" @click="closeMenu"><ScrollText class="size-4" aria-hidden="true" />Game log</RouterLink></li>
        <li><RouterLink to="/games" @click="closeMenu"><History class="size-4" aria-hidden="true" />Saved games</RouterLink></li>
        <li v-if="table && !legacy"><button @click="openLimits"><Settings2 class="size-4" aria-hidden="true" />Run limits</button></li>
        <li v-if="table && app?.match && !showSetup"><button @click="newTable"><Plus class="size-4" aria-hidden="true" />New table</button></li>
      </ul>
    </header>
    <div v-if="loading" class="flex items-center gap-3 py-12" role="status">
      <span class="loading loading-spinner loading-sm"></span>Connecting to your
      table…
    </div>
    <template v-else>
      <div
        v-if="error || actionError"
        class="alert alert-error alert-soft mb-2 max-h-24 shrink-0 overflow-y-auto"
        role="alert"
      >
        <TriangleAlert class="size-5" /><span>{{ actionError || error }}</span
        ><button v-if="error" class="btn btn-sm" @click="refresh">
          <RefreshCw class="size-4" />Retry</button
        ><button v-else class="btn btn-sm btn-ghost" @click="actionError = ''">
          Dismiss
        </button>
      </div>
      <div v-if="!legacy && (!app?.match || showSetup)" class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <SetupPanel
        :app="app"
        :busy="busy"
        @create="create"
        @cancel="showSetup = false"
      />
      </div>
      <template v-else-if="table">
        <ResizableWorkspace :pane="mobilePane">
          <PreparationPanel
            v-if="preparing"
            :table="displayedTable"
            :app="app"
            :human="human"
            @inspect="inspectChatCard"
          />
          <BetweenGamesPanel
            v-else-if="betweenGames"
            :table="displayedTable"
            :app="app"
            :human="human"
            @inspect="inspectChatCard"
          />
          <GameTable
            v-else
            ref="gameTable"
            :table="displayedTable"
            :app="app"
            :human="human"
            :player-details="!!app?.match"
            @player-details="panels.open('players')"
            compact
          />
          <template #chat>
            <ChatPanel
              :app="app"
              :table="displayedTable"
              :human="human"
              :request="request"
              :connected="connected"
              :player-details="!!app?.match"
              @player-details="panels.open('players')"
              @inspect="inspectChatCard"
            />
            <TurnTracker
              :table="displayedTable"
              :app="app"
              :human="human"
              :player-details="!!app?.match"
              @player-details="panels.open('players')"
              @phase="gameTable?.setPhase($event)"
              @edit-turn="gameTable?.editTurn()"
            />
          </template>
        </ResizableWorkspace>
        <CardInspector v-if="preparing || betweenGames" :card="preparationCard" :table="displayedTable" readonly @close="preparationCard = null" />
        <TablePanels ref="panels" :app="app" :table="table" :busy="busy" :request="request" @limits="openLimits" @wake="operate('/api/control', { action: 'wake', player: $event })" @changed="refresh" />
        <RunLimits
          ref="limits"
          :run="app?.coordinator"
          :request="request"
          @changed="refresh"
        />
      </template>
    </template>
  </main>
</template>
