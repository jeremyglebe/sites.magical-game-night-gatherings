<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { RouterLink } from "vue-router";
import {
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Search,
  Archive,
} from "@lucide/vue";
import ReviewAvatar from "../components/review/ReviewAvatar.vue";
import {
  formatDate,
  getJSON,
  localTableURL,
  modelLabel,
  resultLabel,
} from "../components/review/review-format.js";
const games = shallowRef([]),
  loading = ref(false),
  error = ref(""),
  warnings = ref([]),
  query = ref(""),
  filter = ref("all"),
  liveTableUrl = ref("/");
let request = null;
const visible = computed(() =>
  games.value.filter(
    (game) =>
      `${game.title} ${(game.players || []).map((p) => p.name).join(" ")}`
        .toLocaleLowerCase()
        .includes(query.value.trim().toLocaleLowerCase()) &&
      (filter.value === "all" ||
        (filter.value === "completed"
          ? game.completed
          : filter.value === "feedback"
            ? game.feedback?.status === "pending"
            : !game.result)),
  ),
);
async function load() {
  request?.abort();
  const controller = new AbortController();
  request = controller;
  loading.value = true;
  error.value = "";
  try {
    const data = await getJSON("/api/games", controller.signal);
    if (controller.signal.aborted) return;
    games.value = data.games || [];
    warnings.value = data.warnings || [];
    liveTableUrl.value = localTableURL(data.liveTableUrl);
  } catch (e) {
    if (!controller.signal.aborted) error.value = e.message;
  } finally {
    if (request === controller) loading.value = false;
  }
}
onMounted(() => {
  document.title = "Saved games · Game Night";
  load();
});
onBeforeUnmount(() => request?.abort());
</script>
<template>
  <main
    class="mx-auto max-w-7xl space-y-6 p-4 sm:p-6"
    aria-labelledby="games-title"
  >
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 id="games-title" class="text-2xl font-semibold tracking-tight">
          Saved games
        </h1>
        <p class="mt-2 text-sm text-base-content/65">
          Replay a game, inspect its decks, and read the players’ feedback.
        </p>
      </div>
      <div class="flex gap-2">
        <a :href="liveTableUrl" class="btn btn-sm"
          ><ExternalLink class="size-4" /> Live table</a
        ><button class="btn btn-sm" :disabled="loading" @click="load">
          <RefreshCw class="size-4" />Refresh
        </button>
      </div>
    </header>
    <p v-if="error" role="alert" class="alert alert-error">{{ error }}</p>
    <p v-if="warnings.length" role="status" class="alert alert-warning">
      {{ warnings.join(" ") }}
    </p>
    <div class="flex flex-wrap items-end gap-4">
      <label class="min-w-0 flex-1"
        ><span class="mb-1 block text-xs">Search games or players</span
        ><span class="input input-sm w-full"
          ><Search class="size-4 shrink-0" /><input
            v-model="query"
            type="search"
            placeholder="Game title or player name"
            aria-label="Search games or players" /></span
      ></label>
      <label
        ><span class="mb-1 block text-xs">Status</span
        ><select
          v-model="filter"
          class="select select-sm"
          aria-label="Game status"
        >
          <option value="all">All games</option>
          <option value="completed">Completed</option>
          <option value="feedback">Feedback pending</option>
          <option value="unfinished">Unfinished</option>
        </select></label
      >
      <p class="py-2 text-sm tabular-nums" aria-live="polite">
        {{ visible.length }} {{ visible.length === 1 ? "game" : "games" }}
      </p>
    </div>
    <div
      v-if="loading && !games.length"
      role="status"
      class="flex items-center gap-3 py-8"
    >
      <span class="loading loading-spinner loading-sm" />Loading saved games…
    </div>
    <div
      v-else-if="!visible.length"
      class="flex items-start gap-3 rounded-lg border border-base-300 p-6"
    >
      <Archive class="size-5 shrink-0 text-base-content/60" />
      <p class="text-sm">
        {{
          games.length
            ? "No games match these filters."
            : "Your saved games will appear here after a playtest is created."
        }}
      </p>
    </div>
    <ul v-else class="grid gap-4 lg:grid-cols-2">
      <li v-for="game in visible" :key="game.id">
        <RouterLink
          :to="`/games/${encodeURIComponent(game.id)}`"
          class="block h-full rounded-lg border border-base-300 bg-base-200 p-5 transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <h2 class="break-words font-semibold">
                {{ game.title || "Untitled game" }}
              </h2>
              <p class="mt-1 text-sm text-base-content/70">
                {{ resultLabel(game) }}
              </p>
            </div>
            <time
              :datetime="game.startedAt"
              :title="formatDate(game.startedAt)"
              class="shrink-0 text-xs text-base-content/65"
              >{{
                formatDate(game.startedAt, { month: "short", day: "numeric" })
              }}</time
            >
          </div>
          <ul class="my-5 flex flex-wrap gap-4">
            <li
              v-for="(player, seat) in game.players || []"
              :key="player.id"
              class="flex items-center gap-2 text-sm"
              :title="modelLabel(player)"
            >
              <ReviewAvatar :player="player" :seat="seat" /><span>{{
                player.name || player.id
              }}</span>
            </li>
          </ul>
          <div
            class="flex flex-wrap items-center justify-between gap-2 border-t border-base-content/10 pt-3 text-xs"
          >
            <span class="text-base-content/65 tabular-nums"
              >{{ game.frameCount ?? 0 }} recorded
              {{ game.frameCount === 1 ? "batch" : "batches" }} · Revision
              {{ game.revision ?? 0 }}</span
            ><span class="flex items-center gap-1"
              >Review<ArrowRight class="size-4"
            /></span>
          </div>
        </RouterLink>
      </li>
    </ul>
  </main>
</template>
