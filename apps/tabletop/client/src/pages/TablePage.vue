<script setup>
import {
  computed,
  ref,
  reactive,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
} from "vue";
import { Plus, TriangleAlert, RefreshCw, History } from "@lucide/vue";
import { useLiveTable } from "../composables/useLiveTable.js";
import { useHumanPlayer } from "../composables/useHumanPlayer.js";
import GameTable from "../components/table/GameTable.vue";
import ChatPanel from "../components/chat/ChatPanel.vue";
import SetupPanel from "../components/setup/SetupPanel.vue";
import SurveyPanel from "../components/survey/SurveyPanel.vue";
import ResizableWorkspace from "../components/layout/ResizableWorkspace.vue";
import RunControls from "../components/runner/RunControls.vue";
import RunLimits from "../components/runner/RunLimits.vue";
import PlayersPanel from "../components/runner/PlayersPanel.vue";
import PlanUsage from "../components/runner/PlanUsage.vue";
const { app, table, connected, loading, error, legacy, refresh, request } =
  useLiveTable();
const human = reactive(
  useHumanPlayer({ app, publicTable: table, connected, request, refresh }),
);
const gameTable = ref(null),
  limits = ref(null),
  busy = ref(false),
  actionError = ref(""),
  showSetup = ref(false);
const displayedTable = computed(
  () => human.displayTable || human.preview || human.view || table.value,
);
const humans = computed(
  () => app.value?.match?.players?.filter((p) => p.ai === false) || [],
);
const toolbar = ref(null);
const toolbarHeight = ref(64);
let toolbarObserver;
onMounted(() => {
  toolbarObserver = new ResizeObserver(() => {
    // Measure the real wrapped toolbar rather than assuming a desktop height.
    toolbarHeight.value =
      toolbar.value.offsetTop + toolbar.value.offsetHeight + 8;
  });
  toolbarObserver.observe(toolbar.value);
});
onBeforeUnmount(() => toolbarObserver?.disconnect());
function changeSeat(event) {
  if (event.target.value) human.join(event.target.value);
  else human.leave();
}
watch(
  () => app.value?.match?.id,
  () => {
    showSetup.value = false;
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
  if (["running", "stepping"].includes(app.value?.coordinator?.mode)) {
    actionError.value =
      "Pause or stop the current players before creating another table.";
    return;
  }
  showSetup.value = true;
  await nextTick();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
</script>
<template>
  <main
    class="mx-auto max-w-[2400px] p-2 sm:px-3"
    :style="{ '--table-toolbar-height': `${toolbarHeight}px` }"
  >
    <header
      ref="toolbar"
      class="mb-2 flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-base-300 pb-2"
      aria-label="Table controls"
    >
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <span
          class="status status-sm shrink-0"
          :class="connected ? 'status-success' : 'status-error'"
          :title="connected ? 'Connected' : 'Disconnected'"
          :aria-label="connected ? 'Connected' : 'Disconnected'"
        ></span>
        <h1
          class="max-w-56 truncate text-sm font-semibold"
          :title="app?.match?.title || table?.title || 'Game Night'"
        >
          {{ app?.match?.title || table?.title || "Game Night" }}
        </h1>
      </div>
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
      <a
        v-if="app?.postgame && !showSetup"
        href="#postgame-feedback"
        class="btn btn-sm btn-ghost"
        >Feedback</a
      >
      <RunControls
        v-else-if="!legacy && app?.match && !showSetup"
        :run="app?.coordinator"
        :busy="busy"
        @control="operate('/api/control', { action: $event })"
      />
      <RouterLink to="/games" class="btn btn-sm btn-ghost" title="Saved games"
        ><History class="size-4" aria-hidden="true" />Games</RouterLink
      >
    </header>
    <div v-if="loading" class="flex items-center gap-3 py-12" role="status">
      <span class="loading loading-spinner loading-sm"></span>Connecting to your
      table…
    </div>
    <template v-else>
      <div
        v-if="error || actionError"
        class="alert alert-error alert-soft mb-4"
        role="alert"
      >
        <TriangleAlert class="size-5" /><span>{{ actionError || error }}</span
        ><button v-if="error" class="btn btn-sm" @click="refresh">
          <RefreshCw class="size-4" />Retry</button
        ><button v-else class="btn btn-sm btn-ghost" @click="actionError = ''">
          Dismiss
        </button>
      </div>
      <SetupPanel
        v-if="!legacy && (!app?.match || showSetup)"
        :app="app"
        :busy="busy"
        @create="create"
        @cancel="showSetup = false"
      />
      <template v-else-if="table">
        <ResizableWorkspace>
          <GameTable
            ref="gameTable"
            :table="displayedTable"
            :app="app"
            :human="human"
            compact
          />
          <template #chat>
            <ChatPanel
              :app="app"
              :table="displayedTable"
              :human="human"
              :request="request"
              :connected="connected"
              @inspect="(card, options) => gameTable?.inspect(card, options)"
            />
            <div
              v-if="app?.match"
              class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-base-300 pt-2"
            >
              <RouterLink
                :to="`/games/${app.match.id}`"
                class="link text-sm text-primary"
                >Game log</RouterLink
              >
              <button class="btn btn-sm btn-ghost" @click="newTable">
                <Plus class="size-4" />New table
              </button>
            </div>
          </template>
        </ResizableWorkspace>
        <SurveyPanel
          v-if="app?.postgame"
          id="postgame-feedback"
          class="mt-3"
          :app="app"
          :request="request"
          @changed="refresh"
        />
        <div v-if="!legacy" class="mt-6 grid gap-8 lg:grid-cols-2">
          <PlayersPanel
            :app="app"
            :table="table"
            :busy="busy"
            @limits="limits.open()"
            @wake="operate('/api/control', { action: 'wake', player: $event })"
          />
          <PlanUsage
            :plan="app?.planUsage"
            :run="app?.coordinator"
            :request="request"
            @changed="refresh"
          />
        </div>
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
