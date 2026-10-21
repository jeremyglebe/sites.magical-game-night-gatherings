<script setup>
import { computed, ref } from "vue";
import { Users, Settings2 } from "@lucide/vue";
const props = defineProps({ app: Object, table: Object, busy: Boolean });
defineEmits(["limits", "wake"]);
const recipient = ref("");
const run = computed(() => props.app?.coordinator);
const humanize = (v) =>
  String(v || "idle")
    .replaceAll("_", " ")
    .replaceAll("-", " ");
const recovery = computed(
  () =>
    run.value &&
    !props.app?.postgame &&
    !run.value.pendingRecipient &&
    ["paused", "stalled"].includes(run.value.state || run.value.mode),
);
function status(id) {
  const worker = run.value?.players?.find((p) => p.id === id);
  if (worker?.active) return "Thinking";
  if (worker?.error) return worker.error;
  if (run.value?.pendingRecipient?.playerId === id)
    return props.app?.match?.players.find((p) => p.id === id)?.ai === false
      ? "Your response"
      : "Awaiting response";
  return "Awaiting handoff";
}
</script>
<template>
  <section
    class="min-w-0 border-t border-base-300 pt-5"
    aria-labelledby="players-heading"
  >
    <div class="mb-4 flex items-center justify-between">
      <h2 id="players-heading" class="flex items-center gap-2 font-semibold">
        <Users class="size-4" />Players
      </h2>
      <button
        class="btn btn-sm btn-ghost"
        :disabled="busy"
        @click="$emit('limits')"
      >
        <Settings2 class="size-4" />Run limits
      </button>
    </div>
    <p class="mb-2">
      <span class="badge badge-sm">{{
        humanize(run?.state || run?.mode)
      }}</span>
    </p>
    <p class="mb-4 text-sm text-base-content/70">
      {{
        run?.error ||
        run?.reason ||
        run?.message ||
        `${run?.decisions || 0} decisions recorded · Viewer can be closed`
      }}
    </p>
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="player in app?.match?.players || []"
        :key="player.id"
        class="flex items-start gap-3"
      >
        <div v-if="player.avatar" class="avatar">
          <div class="w-10 rounded-full">
            <img
              :src="`/avatars/${player.avatar}.png`"
              :alt="player.name" class="object-cover"
              width="40"
              height="40"
            />
          </div>
        </div>
        <div>
          <h3 class="font-medium">{{ player.name }}</h3>
          <p class="text-sm text-base-content/70">{{ status(player.id) }}</p>
          <p class="text-xs text-base-content/60">
            {{
              player.ai === false
                ? "Human player"
                : `${player.model?.replace(/^gpt-/, "") || "Codex"} · ${player.reasoning || "high"}`
            }}
          </p>
        </div>
      </div>
    </div>
    <form
      v-if="recovery"
      class="mt-5 flex flex-wrap items-end gap-2"
      @submit.prevent="$emit('wake', recipient)"
    >
      <label class="fieldset"
        >Give control to<select
          v-model="recipient" aria-label="Give control to"
          class="select select-sm"
          :disabled="busy || !!run.active"
        >
          <option disabled value="">Select a player</option>
          <option v-for="p in table?.players || []" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
        </select></label
      >
      <button class="btn btn-sm" :disabled="!recipient || busy || !!run.active">
        Give control
      </button>
    </form>
  </section>
</template>
