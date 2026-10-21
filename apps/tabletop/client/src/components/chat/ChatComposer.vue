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
const canChat = computed(
  () =>
    props.human.canChat !== false &&
    !!props.human.seatId &&
    !props.app?.postgame &&
    !props.table?.result,
);
const canCommit = computed(
  () => props.human.canCommit ?? (props.human.canAct && !props.human.stale),
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
    class="space-y-3 border-t border-base-300 pt-4"
    aria-label="Chat and pending actions"
  >
    <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
      <strong>{{ currentName }}</strong
      ><a href="#human-controls" class="link text-xs">Your hand</a>
    </div>
    <div
      v-if="human.pending?.length"
      class="rounded-box border border-base-300 bg-base-200 p-3"
    >
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span class="badge badge-sm">{{ human.pending.length }} pending</span>
        <div class="flex gap-1">
          <button
            type="button"
            class="btn btn-sm btn-ghost"
            :disabled="locked"
            @click="human.undo()"
          >
            <Undo2 class="size-3.5" /> Undo last</button
          ><button
            type="button"
            class="btn btn-sm btn-ghost"
            :disabled="locked"
            @click="human.clear()"
          >
            Clear
          </button>
        </div>
      </div>
      <ol class="max-h-44 space-y-2 overflow-y-auto text-xs">
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
      <p v-if="human.stale" class="mt-2 text-xs text-warning">
        The table changed. Clear these actions and rebuild your play.
      </p>
    </div>
    <p v-if="error || human.error" class="text-sm text-error" role="alert">
      {{ error || human.error }}
    </p>
    <label class="fieldset gap-1"
      ><span class="label">Message the table</span
      ><textarea
        v-model="message"
        class="textarea textarea-sm min-h-20 w-full resize-y"
        rows="2"
        maxlength="2000"
        :disabled="locked || !canChat"
        placeholder="Message the table…"
        @keydown="keydown"
      />
    </label>
    <label class="flex items-center gap-2 text-xs"
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
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="btn btn-sm btn-primary grow"
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
        type="button"
        class="btn btn-sm grow"
        :disabled="locked || !canCommit || !recipient"
        @click="send('priority')"
      >
        <ArrowRight class="size-3.5" /> Pass priority
      </button>
      <button
        type="button"
        class="btn btn-sm grow"
        :disabled="locked || !canCommit || !recipient"
        @click="send('turn')"
      >
        <SkipForward class="size-3.5" /> Pass turn
      </button>
    </div>
    <p v-if="!human.canAct && canChat" class="text-xs text-base-content/70">
      You can still speak. Your message will reach the player currently acting.
    </p>
    <p class="text-xs text-base-content/60">
      <kbd class="kbd kbd-xs">Enter</kbd> to send ·
      <kbd class="kbd kbd-xs">Shift + Enter</kbd> for a new line
    </p>
  </section>
  <p
    v-else-if="app?.match?.players?.some((player) => player.ai === false)"
    class="border-t border-base-300 pt-4 text-sm text-base-content/70"
  >
    <a class="link" href="#seat-selector">Choose a seat to chat</a>
  </p>
</template>
