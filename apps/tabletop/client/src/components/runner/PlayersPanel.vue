<script setup>
import { computed, ref } from "vue";
import { Users } from "@lucide/vue";
const props = defineProps({ app: Object, table: Object, busy: Boolean, embedded: Boolean });
defineEmits(["wake"]);
const recipient = ref("");
const run = computed(() => props.app?.coordinator);
const notice = computed(() =>
  run.value?.error || run.value?.reason ||
  (["paused", "stalled"].includes(run.value?.state || run.value?.mode) ? run.value?.message : ""),
);
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
    class="min-w-0"
    :class="embedded ? '' : 'border-t border-base-300 pt-5'"
    :aria-labelledby="embedded ? undefined : 'players-heading'"
    :aria-label="embedded ? 'Players' : undefined"
  >
    <h2 v-if="!embedded" id="players-heading" class="mb-3 flex items-center gap-2 font-semibold">
      <Users class="size-4" />Players
    </h2>
    <p v-if="notice" class="mb-3 break-words text-sm text-base-content/70" :role="run?.error ? 'alert' : undefined">
      {{ notice }}
    </p>
    <ul class="space-y-3">
      <li
        v-for="player in app?.match?.players || []"
        :key="player.id"
        class="flex items-start gap-3"
      >
        <div v-if="player.avatar" class="avatar shrink-0">
          <div class="w-10 rounded-full">
            <img
              :src="`/avatars/${player.avatar}.png`"
              :alt="player.name" class="object-cover"
              width="40"
              height="40"
            />
          </div>
        </div>
        <div class="min-w-0 break-words">
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
      </li>
    </ul>
    <form
      v-if="recovery"
      class="mt-3 flex flex-wrap items-end gap-2 border-t border-base-300 pt-3"
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
