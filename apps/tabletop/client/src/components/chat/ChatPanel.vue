<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { ArrowDown, Expand, MessageSquare, X } from "@lucide/vue";
import ChatEvent from "./ChatEvent.vue";
import ChatComposer from "./ChatComposer.vue";
import { avatarImage } from "./activity.mjs";

const props = defineProps({
  app: Object,
  table: Object,
  human: Object,
  request: Function,
  connected: { type: Boolean, default: true },
});
const emit = defineEmits(["inspect"]);
const log = ref(null);
const historyDialog = ref(null);
const history = ref([]);
const historyError = ref("");
const historyBusy = ref(false);
const historyLimited = ref(false);
const following = ref(true);
const unread = ref(false);
const clock = ref(Date.now());
const clockTimer = setInterval(() => {
  clock.value = Date.now();
}, 1000);
onBeforeUnmount(() => {
  clearInterval(clockTimer);
  historyRequest++;
});
const events = computed(() => props.table?.events || []);
const configs = computed(() => props.app?.match?.players || []);
const thinking = computed(() =>
  props.connected &&
  ["running", "stepping"].includes(props.app?.coordinator?.mode)
    ? props.app.coordinator.players?.find(
        (worker) =>
          worker.enabled !== false &&
          worker.active &&
          !worker.active.completion &&
          !worker.error,
      )
    : null,
);
const thinkingAvatar = computed(() =>
  avatarImage(
    configs.value.find((player) => player.id === thinking.value?.id)?.avatar,
  ),
);
const elapsed = computed(() => {
  const start = Date.parse(thinking.value?.active?.startedAt);
  return Number.isFinite(start)
    ? `${Math.max(0, Math.floor((clock.value - start) / 1000))}s`
    : "";
});
let historyRequest = 0;
function onScroll() {
  if (log.value) {
    following.value =
      log.value.scrollHeight - log.value.clientHeight - log.value.scrollTop <
      40;
    if (following.value) unread.value = false;
  }
}
async function scrollLatest() {
  await nextTick();
  if (log.value) log.value.scrollTop = log.value.scrollHeight;
  following.value = true;
  unread.value = false;
}
onMounted(scrollLatest);
watch([() => props.app?.match?.id, () => props.human?.seatId], () => {
  historyRequest++;
  history.value = [];
  historyDialog.value?.close();
  scrollLatest();
});
watch(
  [
    () => events.value.at(-1)?.revision,
    () => thinking.value?.active?.decisionId,
  ],
  async () => {
    if (following.value) await scrollLatest();
    else unread.value = true;
    if (historyDialog.value?.open && !historyBusy.value) loadHistory();
  },
);
async function openHistory() {
  history.value = [];
  historyLimited.value = false;
  historyDialog.value.showModal();
  await loadHistory();
}
async function loadHistory() {
  const serial = ++historyRequest;
  historyError.value = "";
  historyBusy.value = true;
  const path = `/api/history?since=${history.value.at(-1)?.revision || 0}`;
  try {
    const result = props.request
      ? await props.request(path)
      : await fetch(path).then(async (response) => {
          if (!response.ok) {
            const error = new Error("Could not load public history.");
            error.status = response.status;
            throw error;
          }
          return response.json();
        });
    if (serial === historyRequest) {
      const merged = new Map(
        history.value.map((event) => [event.revision, event]),
      );
      for (const event of result.events || [])
        merged.set(event.revision, event);
      history.value = [...merged.values()].sort(
        (a, b) => a.revision - b.revision,
      );
    }
  } catch (err) {
    if (serial === historyRequest) {
      if ([401, 404].includes(err.status) && !props.app?.match) {
        history.value = [...events.value];
        historyLimited.value = true;
      } else historyError.value = err.message;
    }
  } finally {
    if (serial === historyRequest) historyBusy.value = false;
  }
}
</script>

<template>
  <section
    class="flex min-w-0 flex-col gap-3"
    aria-label="Table talk and actions"
  >
    <div class="flex items-center justify-between gap-2">
      <h2 class="flex items-center gap-2 text-sm font-semibold">
        <MessageSquare class="size-4" /> Chat
      </h2>
      <button class="btn btn-sm btn-ghost" type="button" @click="openHistory">
        <Expand class="size-3.5" /> Expand
      </button>
    </div>
    <ol
      ref="log"
      class="max-h-[calc(100dvh-24rem)] min-h-48 space-y-1 overflow-y-auto overscroll-contain pr-1"
      aria-label="Recent table talk and actions"
      @scroll="onScroll"
    >
      <ChatEvent
        v-for="event in events"
        :key="`${human?.seatId || 'public'}:${event.revision}`"
        :event="event"
        :players="table?.players"
        :configs="configs"
        @inspect="(card, options) => emit('inspect', card, options)"
      />
      <li v-if="!events.length" class="py-6 text-sm text-base-content/60">
        No table talk or actions yet.
      </li>
      <li
        v-if="thinking"
        class="flex items-center gap-2 py-2 text-xs text-base-content/70"
        role="status"
      >
        <div v-if="thinkingAvatar" class="avatar">
          <div class="w-8 rounded-full">
            <img
              :src="thinkingAvatar"
              alt=""
              width="32"
              height="32"
              class="object-cover"
            />
          </div>
        </div>
        <span
          class="loading loading-dots loading-sm motion-reduce:animate-none"
          aria-hidden="true"
        /><span
          >{{ thinking.name || thinking.id }}
          {{ app?.postgame ? "is completing feedback…" : "is thinking…" }}</span
        ><span class="ml-auto tabular-nums">{{ elapsed }}</span>
      </li>
    </ol>
    <button
      v-if="unread"
      type="button"
      class="btn btn-sm self-center"
      @click="scrollLatest"
    >
      <ArrowDown class="size-4" /> New activity
    </button>
    <ChatComposer v-if="human" :human="human" :app="app" :table="table" />
    <dialog
      ref="historyDialog"
      class="modal"
      aria-labelledby="history-title"
      @close="historyRequest++"
    >
      <div class="modal-box w-11/12 max-w-3xl">
        <div class="mb-3 flex items-center justify-between gap-3">
          <h2 id="history-title" class="text-xl font-semibold">
            Table talk & actions
          </h2>
          <button
            class="btn btn-sm btn-ghost btn-square"
            aria-label="Close game history"
            @click="historyDialog.close()"
          >
            <X class="size-4" />
          </button>
        </div>
        <p class="mb-4 text-xs text-base-content/70">
          {{ historyLimited ? "Recent table activity" : "Public game history" }}
          · oldest first
        </p>
        <p v-if="historyLimited" class="mb-4 text-xs text-base-content/60">
          This standalone table shows its currently available history.
        </p>
        <p v-if="historyBusy" role="status" class="flex items-center gap-2">
          <span class="loading loading-spinner loading-sm" /> Loading history…
        </p>
        <p v-if="historyError" role="alert" class="text-error">
          {{ historyError }}
        </p>
        <ol class="space-y-2">
          <ChatEvent
            v-for="event in history"
            :key="event.revision"
            :event="event"
            :players="table?.players"
            :configs="configs"
            @inspect="(card, options) => emit('inspect', card, options)"
          />
        </ol>
        <p
          v-if="!historyBusy && !historyError && !history.length"
          class="text-sm text-base-content/60"
        >
          No public actions recorded yet.
        </p>
        <div class="modal-action">
          <a
            v-if="app?.match?.id"
            :href="`/games/${app.match.id}`"
            target="_blank"
            rel="noopener"
            class="btn btn-sm"
            >Review this game</a
          ><button class="btn btn-sm" @click="historyDialog.close()">
            Close
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button>Close history</button>
      </form>
    </dialog>
  </section>
</template>
