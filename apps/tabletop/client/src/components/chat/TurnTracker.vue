<script setup>
import { computed } from "vue";
import TurnOrderPortraits from "./TurnOrderPortraits.vue";
import { phaseLabel, turnLabel, turnCountSummary } from "../../../../shared/table-language.mjs";

const props = defineProps({
  table: { type: Object, required: true },
  app: Object,
  human: Object,
  readonly: Boolean,
  playerDetails: Boolean,
});
defineEmits(["phase", "edit-turn", "player-details"]);
const preparing = computed(() => props.table.preparation?.status === "selecting");
const betweenGames = computed(() => props.table.series?.status === "between_games");
const playing = computed(() => !preparing.value && !betweenGames.value && !props.table.result);
const heading = computed(() => preparing.value ? "Pack selection"
  : betweenGames.value ? "Between games"
  : props.table.result ? "Game finished"
  : turnLabel(props.table.turn, props.table.players));
const phases = computed(() => [...new Set([
  "Setup", "Untap", "Upkeep", "Draw", "Main 1", "Begin combat",
  "Declare attackers", "Declare blockers", "Combat damage", "End combat",
  "Main 2", "End step", "Cleanup", props.table.turn?.phase,
].filter(Boolean))]);
</script>

<template>
  <section class="mt-2 shrink-0 border-t border-base-300 pt-2" aria-label="Turn tracking">
    <div class="px-3 text-center">
      <p class="text-sm font-semibold" :title="turnCountSummary(table.turn, table.players)">{{ heading }}</p>
      <p v-if="playing" class="mt-1 text-xs text-base-content/65">
        {{ phaseLabel(table.turn?.phase) }}
      </p>
      <div v-if="playing && human?.seatId && !readonly" class="mt-2 flex flex-wrap items-center justify-center gap-2">
        <label class="flex items-center gap-2 text-xs">
          Phase
          <select
            aria-label="Turn phase"
            class="select select-sm w-36"
            :value="table.turn?.phase || 'Setup'"
            :disabled="!human.canCommit"
            @change="$emit('phase', $event.target.value)"
          >
            <option v-for="value in phases" :key="value" :value="value">{{ phaseLabel(value) }}</option>
          </select>
        </label>
        <button class="btn btn-sm" :disabled="!human.canCommit" @click="$emit('edit-turn')">Edit turn</button>
      </div>
    </div>
    <TurnOrderPortraits
      :players="table.players"
      :configs="app?.match?.players"
      :turn="table.turn"
      :active="playing ? table.turn?.active : null"
      :interactive="playerDetails && !readonly"
      @player-details="$emit('player-details', $event)"
    />
  </section>
</template>
