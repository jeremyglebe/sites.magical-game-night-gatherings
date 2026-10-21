<script setup>
import { computed, ref, watch } from "vue";
import { Send, Undo2, X, ArrowRight, SkipForward } from "@lucide/vue";

const props = defineProps({
  human: { type: Object, required: true },
  app: Object,
  table: Object,
});
const message = computed({
  get: () => props.human.message || "",
  set: (value) => {
    props.human.message = value;
  },
});
const recipient = computed({
  get: () => props.human.recipient || "",
  set: (value) => {
    props.human.recipient = value;
  },
});
const error = ref("");
const sending = ref(false);
const players = computed(() => props.table?.players || []);
const recipients = computed(() =>
  players.value.filter(
    (player) =>
      player.id !== props.human.seatId &&
      !["dead", "conceded", "eliminated"].includes(player.status),
  ),
);
const recipientOptions = computed(() =>
  recipients.value.length
    ? recipients.value
    : players.value.filter((player) => player.id === props.human.seatId),
);
const currentName = computed(
  () =>
    players.value.find((player) => player.id === props.human.seatId)?.name ||
    props.human.seatId,
);
const locked = computed(() => sending.value || props.human.busy);
const preparing = computed(() => props.table?.preparation?.status === "selecting");
const betweenGames = computed(() => props.table?.series?.status === "between_games");
const canChat = computed(
  () =>
    props.human.canChat !== false &&
    !!props.human.seatId &&
    !props.app?.postgame &&
    (!props.table?.result || betweenGames.value),
);
const canCommit = computed(
  () => !preparing.value && !betweenGames.value && (props.human.canCommit ?? (props.human.canAct && !props.human.stale)),
);
const canSend = computed(
  () =>
    !locked.value &&
    ((canCommit.value && props.human.pending?.length) ||
      (canChat.value && message.value.trim())),
);

watch([() => props.human.seatId, () => props.app?.match?.id], () => {
  error.value = "";
});
watch(
  recipientOptions,
  (options) => {
    if (!options.some((player) => player.id === recipient.value))
      recipient.value = options[0]?.id || "";
  },
  { immediate: true },
);
async function send(handoff = null) {
  if (locked.value) return;
  sending.value = true;
  error.value = "";
  try {
    const sent = await props.human.send({
      message: message.value,
      handoff,
      to: recipient.value,
    });
    if (sent !== false) message.value = "";
  } catch (err) {
    error.value = err.message;
  } finally {
    sending.value = false;
  }
}
function keydown(event) {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    if (canSend.value) send();
  }
}
</script>

<template>
  <section
    v-if="human.seatId"
    class="flex max-h-[60%] min-h-0 shrink-0 flex-col gap-1.5 border-t border-base-300 pt-2"
    aria-label="Chat and pending actions"
  >
    <div class="flex shrink-0 items-center justify-between gap-2 text-sm">
      <strong class="truncate">{{ currentName }}</strong
      ><a v-if="!preparing && !betweenGames" href="#human-controls" class="link shrink-0 text-xs">Your hand</a>
    </div>
    <div
      v-if="human.pending?.length"
      class="flex min-h-10 shrink flex-col rounded-box border border-base-300 bg-base-200 p-1.5"
    >
      <div class="mb-1 flex shrink-0 items-center justify-between gap-1">
        <span class="badge badge-sm">{{ human.pending.length }} pending</span>
        <div class="flex gap-1">
          <button
            type="button"
            class="btn btn-xs btn-ghost"
            :disabled="locked"
            @click="human.undo()"
          >
            <Undo2 class="size-3.5" /> Undo last</button
          ><button
            type="button"
            class="btn btn-xs btn-ghost"
            :disabled="locked"
            @click="human.clear()"
          >
            Clear
          </button>
        </div>
      </div>
      <ol class="max-h-16 min-h-0 space-y-1 overflow-y-auto overscroll-contain text-xs">
        <li
          v-for="(item, index) in human.pending"
          :key="index"
          class="flex items-start justify-between gap-2"
        >
          <span>{{ index + 1 }}. {{ item.label }}</span
          ><button
            class="btn btn-xs btn-ghost btn-square shrink-0"
            type="button"
            :disabled="locked"
            :aria-label="`Remove queued action ${index + 1}: ${item.label}`"
            @click="human.remove(index)"
          >
            <X class="size-3" />
          </button>
        </li>
      </ol>
      <p v-if="human.stale" class="mt-1 shrink-0 text-xs text-warning">
        The table changed. Clear these actions and rebuild your play.
      </p>
    </div>
    <p v-if="error || human.error" class="max-h-10 shrink-0 overflow-y-auto text-xs text-error" role="alert">
      {{ error || human.error }}
    </p>
    <label class="block shrink-0"
      ><span class="sr-only">Message the table</span
      ><textarea
        v-model="message"
        class="textarea textarea-sm block h-12 min-h-12 w-full resize-none"
        rows="2"
        maxlength="2000"
        :disabled="locked || !canChat"
        placeholder="Message the table…"
        title="Enter to send; Shift + Enter for a new line"
        aria-description="Enter to send; Shift + Enter for a new line"
        @keydown="keydown"
      />
    </label>
    <label v-if="!preparing && !betweenGames" class="flex shrink-0 items-center gap-2 text-xs"
      >Pass to
      <select
        aria-label="Pass to"
        v-model="recipient"
        class="select select-sm min-w-0 flex-1"
        :disabled="locked || !human.canAct"
      >
        <option
          v-for="player in recipientOptions"
          :key="player.id"
          :value="player.id"
        >
          {{ player.name || player.id }}
        </option>
      </select></label
    >
    <div class="grid shrink-0 gap-1" :class="!preparing && !betweenGames ? 'grid-cols-3' : 'grid-cols-1'">
      <button
        type="button"
        class="btn btn-sm btn-primary min-w-0 gap-1 px-2"
        :disabled="!canSend"
        @click="send()"
      >
        <Send class="size-3.5" />
        {{
          locked
            ? "Sending…"
            : canCommit && human.pending?.length
              ? "Send play"
              : "Send"
        }}
      </button>
      <button
        v-if="!preparing && !betweenGames"
        type="button"
        class="btn btn-sm min-w-0 gap-1 px-2"
        aria-label="Pass priority"
        title="Pass priority"
        :disabled="locked || !canCommit || !recipient"
        @click="send('priority')"
      >
        <ArrowRight class="size-3.5 shrink-0" /> Priority
      </button>
      <button
        v-if="!preparing && !betweenGames"
        type="button"
        class="btn btn-sm min-w-0 gap-1 px-2"
        aria-label="Pass turn"
        title="Pass turn"
        :disabled="locked || !canCommit || !recipient"
        @click="send('turn')"
      >
        <SkipForward class="size-3.5 shrink-0" /> Turn
      </button>
    </div>
    <p v-if="!human.canAct && canChat" class="shrink-0 text-xs text-base-content/70">
      You can still speak. Your message will reach the player currently acting.
    </p>
  </section>
  <p
    v-else-if="app?.match?.players?.some((player) => player.ai === false)"
    class="border-t border-base-300 pt-4 text-sm text-base-content/70"
  >
    <a class="link" href="#seat-selector">Choose a seat to chat</a>
  </p>
</template>
