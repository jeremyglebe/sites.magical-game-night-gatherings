<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  RefreshCw,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
} from "@lucide/vue";
import { useRecording } from "../composables/useRecording.js";
import GameTable from "../components/table/GameTable.vue";
import TurnTracker from "../components/chat/TurnTracker.vue";
import MatchScore from "../components/preparation/MatchScore.vue";
import { gameSegments, decksForGame } from "../../../shared/replay.mjs";
import { turnCountSummary } from "../../../shared/table-language.mjs";
import ReviewConversation from "../components/review/ReviewConversation.vue";
import ReviewDecks from "../components/review/ReviewDecks.vue";
import ReviewFeedback from "../components/review/ReviewFeedback.vue";
import ReviewCardDialog from "../components/review/ReviewCardDialog.vue";
import {
  formatDate,
  keyboardTabs,
  resultLabel,
} from "../components/review/review-format.js";
const route = useRoute();
const {
  game,
  recording,
  loading,
  error,
  position,
  playing,
  speed,
  liveTableUrl,
  length,
  state,
  decks,
  events,
  load,
  seek,
  stop,
  toggle,
} = useRecording(() => route.params.id);
const tab = ref(route.hash === "#feedback" ? "feedback" : "replay"),
  selection = ref(null),
  conversation = ref(null);
const sections = [
  { id: "replay", label: "Table & conversation" },
  { id: "decks", label: "Player decks" },
  { id: "feedback", label: "Player feedback" },
];
const players = computed(() =>
  (recording.value?.initial.players || []).map((player) => ({
    ...player,
    ...(game.value?.players?.find((p) => p.id === player.id) || {}),
  })),
);
const segments = computed(() => recording.value ? gameSegments(recording.value) : []);
const deckGame = ref(1);
const gameDecks = computed(() => recording.value ? decksForGame(recording.value, deckGame.value) : decks.value);
const matchSeries = computed(() => recording.value?.frames?.reduce((series, frame) => frame.delta?.series ?? series, recording.value?.initial.series));
const tableApp = computed(() => ({
  match: { layout: game.value?.layout, players: players.value },
}));
// Owner review deliberately includes saved hidden cards. It never fetches live seat state.
const table = computed(() => {
  const current = state.value;
  if (!current) return null;
  const cards = Object.fromEntries(
    Object.entries(current.cards).map(([id, card]) => [
      id,
      { ...card.definition, ...card },
    ]),
  );
  return {
    ...current,
    cards,
    zones: Object.fromEntries(
      Object.entries(current.zones).map(([id, zone]) => [
        id,
        {
          ...zone,
          count: zone.cards.length,
          cards: zone.cards.map((cardId) => cards[cardId]).filter(Boolean),
        },
      ]),
    ),
  };
});
const positionLabel = computed(() =>
  position.value
    ? `Batch ${position.value} of ${length.value} · Revision ${state.value?.revision}`
    : `Initial setup · ${length.value} ${length.value === 1 ? "batch" : "batches"} saved`,
);
const positionNote = computed(
  () =>
    `${position.value === length.value ? "Latest saved position" : position.value === 0 ? "Original recorded setup" : "Earlier position — later messages are dimmed"} · Revision ${state.value?.revision ?? 0}${position.value ? " · " + formatDate(recording.value.frames[position.value - 1].event.at, { hour: "numeric", minute: "2-digit", second: "2-digit" }) : ""}`,
);
function selectTab(value) {
  if (value !== "replay") stop();
  tab.value = value;
}
async function showPosition(value) {
  seek(value);
  tab.value = "replay";
  await nextTick();
  conversation.value?.scrollToCurrent();
}
function inspect(definition, card) {
  selection.value = { definition, card };
}
watch(game, (value) => {
  if (value) document.title = `${value.title || "Saved game"} · Game Night`;
});
watch(
  () => route.params.id,
  () => {
    selection.value = null;
    deckGame.value = 1;
    tab.value = route.hash === "#feedback" ? "feedback" : "replay";
  },
);
watch(
  () => route.hash,
  (hash) => {
    if (hash === "#feedback") selectTab("feedback");
  },
);
watch(position, async () => {
  if (playing.value) {
    await nextTick();
    conversation.value?.scrollToCurrent();
  }
});
</script>
<template>
  <main
    class="mx-auto max-w-[1800px] space-y-5 p-4 sm:p-6"
    aria-labelledby="review-title"
  >
    <RouterLink to="/games" class="btn btn-sm btn-ghost w-fit"
      ><ArrowLeft class="size-4" />Saved games</RouterLink
    >
    <p v-if="error" role="alert" class="alert alert-error">{{ error }}</p>
    <div
      v-if="loading && !game"
      class="flex items-center gap-3 py-8"
      role="status"
    >
      <span class="loading loading-spinner loading-sm" />Loading recording…
    </div>
    <template v-if="game && recording">
      <header class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <h1
            id="review-title"
            class="break-words text-2xl font-semibold tracking-tight"
          >
            {{ game.title || recording.title || "Saved game" }}
          </h1>
          <p class="mt-2 text-sm text-base-content/65">
            {{ resultLabel(game) }} · {{ players.length }} players · Last
            recorded revision {{ game.revision ?? recording.initial.revision }}
          </p>
          <p class="mt-1 text-xs text-base-content/65">
            Started {{ formatDate(game.startedAt || recording.started_at) }} ·
            Saved {{ formatDate(game.updatedAt || recording.started_at) }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <a :href="liveTableUrl" class="btn btn-sm"
            ><ExternalLink class="size-4" />Live table</a
          ><button class="btn btn-sm" :disabled="loading" @click="load(true)">
            <RefreshCw class="size-4" />Refresh recording</button
          ><a
            :href="`/api/games/${encodeURIComponent(route.params.id)}/recording`"
            class="btn btn-sm"
            ><Download class="size-4" />JSON recording</a
          >
        </div>
      </header>
      <MatchScore :series="matchSeries" :players="players" />
      <div class="space-y-1 text-sm text-base-content/75" aria-label="Turns played">
        <p v-for="segment in segments" :key="segment.gameNumber">
          <span v-if="segments.length > 1" class="font-semibold">Game {{ segment.gameNumber }} · </span>
          {{ turnCountSummary(segment.turn, segment.players) }}
        </p>
      </div>
      <p
        class="rounded-lg border border-base-300 bg-base-200 px-4 py-3 text-sm"
      >
        Owner review · Includes full decks and private cards. Playback uses
        saved actions; it never runs the players.
      </p>
      <div
        class="tabs tabs-border max-w-full flex-wrap"
        role="tablist"
        aria-label="Game review sections"
        @keydown="
          keyboardTabs(
            $event,
            sections.map((s) => s.id),
            tab,
            selectTab,
          )
        "
      >
        <button
          v-for="section in sections"
          :id="`review-tab-${section.id}`"
          :key="section.id"
          role="tab"
          class="tab"
          :class="{ 'tab-active': tab === section.id }"
          :aria-selected="tab === section.id"
          :aria-controls="`review-panel-${section.id}`"
          :tabindex="tab === section.id ? 0 : -1"
          @click="selectTab(section.id)"
        >
          {{ section.label }}
        </button>
      </div>
      <section
        v-show="tab === 'replay'"
        id="review-panel-replay"
        role="tabpanel"
        aria-labelledby="review-tab-replay"
        class="space-y-4"
      >
        <div
          class="flex flex-wrap items-end gap-3 rounded-lg border border-base-300 bg-base-200 p-3"
        >
          <div class="flex gap-1">
            <button
              class="btn btn-sm btn-square"
              aria-label="Go to initial setup"
              :disabled="position === 0"
              @click="showPosition(0)"
            >
              <SkipBack class="size-4" /></button
            ><button
              class="btn btn-sm btn-square"
              aria-label="Previous action"
              :disabled="position === 0"
              @click="showPosition(position - 1)"
            >
              <ChevronLeft class="size-4" /></button
            ><button
              class="btn btn-sm"
              :aria-label="playing ? 'Pause recording' : 'Play recording'"
              :disabled="!length"
              @click="toggle"
            >
              <Pause v-if="playing" class="size-4" /><Play
                v-else
                class="size-4"
              />{{ playing ? "Pause" : "Play" }}</button
            ><button
              class="btn btn-sm btn-square"
              aria-label="Next action"
              :disabled="position === length"
              @click="showPosition(position + 1)"
            >
              <ChevronRight class="size-4" /></button
            ><button
              class="btn btn-sm btn-square"
              aria-label="Go to latest saved action"
              :disabled="position === length"
              @click="showPosition(length)"
            >
              <SkipForward class="size-4" />
            </button>
          </div>
          <label class="min-w-40 flex-1"
            ><span class="mb-2 block text-xs tabular-nums">{{
              positionLabel
            }}</span
            ><input
              type="range"
              class="range range-xs w-full"
              min="0"
              :max="length"
              step="1"
              :value="position"
              :disabled="!length"
              aria-label="Replay position"
              :aria-valuetext="positionLabel"
              @input="showPosition($event.target.value)"
          /></label>
          <label
            ><span class="mb-1 block text-xs">Pace</span
            ><select
              v-model.number="speed"
              class="select select-sm w-auto"
              aria-label="Replay pace"
            >
              <option :value="3000">3 sec / action</option>
              <option :value="1500">1.5 sec / action</option>
              <option :value="600">0.6 sec / action</option>
            </select></label
          >
        </div>
        <label v-if="segments.length > 1" class="flex flex-wrap items-center gap-2 text-sm">
          Jump to game
          <select class="select select-sm w-auto" :value="state?.series?.gameNumber || 1" @change="showPosition(segments.find((item) => item.gameNumber === Number($event.target.value))?.position || 0)">
            <option v-for="segment in segments" :key="segment.gameNumber" :value="segment.gameNumber">Game {{ segment.gameNumber }}{{ segment.result ? (segment.result.winners.length ? ' · ' + segment.result.winners.map((id) => players.find((player) => player.id === id)?.name || id).join(' & ') + ' won' : ' · Draw') : '' }}</option>
          </select>
        </label>
        <MatchScore :series="state?.series" :players="players" />
        <p class="text-xs text-base-content/65" aria-live="polite">
          {{ positionNote }}
        </p>
        <div
          class="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.4fr)]"
        >
          <div class="min-w-0">
            <GameTable
              v-if="table"
              :table="table"
              :app="tableApp"
              :human="null"
              readonly
            />
            <p
              v-if="
                state.notes?.filter((note) => note.kind !== 'speech').at(-1)
                  ?.text
              "
              class="mt-3 text-sm text-base-content/70"
            >
              {{
                state.notes.filter((note) => note.kind !== "speech").at(-1).text
              }}
            </p>
          </div>
          <div class="min-w-0">
            <ReviewConversation
              ref="conversation"
              :events="events"
              :players="players"
              :position="position"
              @seek="showPosition"
              @inspect="inspect"
            />
            <TurnTracker v-if="table" :table="table" :app="tableApp" readonly />
          </div>
        </div>
      </section>
      <section
        v-show="tab === 'decks'"
        id="review-panel-decks"
        role="tabpanel"
        aria-labelledby="review-tab-decks"
      >
        <label v-if="segments.length > 1" class="mb-4 flex flex-wrap items-center gap-2 text-sm">
          Decks for game
          <select v-model.number="deckGame" class="select select-sm w-auto">
            <option v-for="segment in segments" :key="segment.gameNumber" :value="segment.gameNumber">Game {{ segment.gameNumber }}</option>
          </select>
        </label>
        <ReviewDecks :decks="gameDecks" :players="players" @inspect="inspect" />
      </section>
      <section
        v-show="tab === 'feedback'"
        id="review-panel-feedback"
        role="tabpanel"
        aria-labelledby="review-tab-feedback"
      >
        <ReviewFeedback
          :recording="recording"
          :players="players"
          @seek="showPosition"
        />
      </section>
      <ReviewCardDialog
        :selection="selection"
        :state="state"
        @close="selection = null"
        @inspect="inspect"
      />
    </template>
  </main>
</template>
