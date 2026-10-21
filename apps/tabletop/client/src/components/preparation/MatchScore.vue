<script setup>
import { computed } from "vue";
const props = defineProps({ series: Object, players: { type: Array, default: () => [] } });
const name = (id) => props.players.find((player) => player.id === id)?.name || id;
const description = computed(() => props.series?.mode === "best_of"
  ? `${props.series.winsRequired} wins · ${props.series.maxGames} games maximum`
  : `First to ${props.series?.winsRequired} wins`);
const outcome = computed(() => props.series?.result?.winners?.length
  ? `${props.series.result.winners.map(name).join(" & ")} won the match`
  : "Match drawn");
</script>

<template>
  <div v-if="series && series.mode !== 'single'" class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs" aria-label="Match score">
    <span class="font-medium" :title="description">{{ series.status === 'complete' ? outcome : `Game ${series.gameNumber}` }}</span>
    <span v-for="player in players" :key="player.id" class="whitespace-nowrap tabular-nums">{{ player.name || player.id }} <strong>{{ series.scores?.[player.id] || 0 }}</strong></span>
    <span class="text-base-content/60">{{ description }}</span>
  </div>
</template>
