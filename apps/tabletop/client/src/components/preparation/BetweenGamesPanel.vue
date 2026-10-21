<script setup>
import { computed, ref, shallowRef, watch } from "vue";
import { Check, RefreshCw } from "@lucide/vue";

const props = defineProps({ table: Object, app: Object, human: Object });
const emit = defineEmits(["inspect"]);
const inventory = shallowRef(null), allocations = ref({}), error = ref(""), loading = ref(false);
const startingPlayer = ref(""), message = ref("");
let serial = 0;
const series = computed(() => props.table.series);
const name = (id) => props.table.players.find((player) => player.id === id)?.name || id;
const canPrepare = computed(() => props.human?.canAct && series.value.currentPlayer === props.human.seatId);
const reselecting = computed(() => series.value.resetTo === "preparation");
const canEdit = computed(() => !reselecting.value && canPrepare.value && inventory.value?.canEdit && !loading.value);
const cards = computed(() => inventory.value?.cards || []);
const mainCount = computed(() => cards.value.reduce((total, card) => total + Number(allocations.value[card.id] || 0), 0));
const valid = computed(() => !inventory.value?.available || (mainCount.value === inventory.value.mainSize && cards.value.every((card) => Number.isSafeInteger(allocations.value[card.id]) && allocations.value[card.id] >= 0 && allocations.value[card.id] <= card.total)));
const changed = computed(() => cards.value.some((card) => allocations.value[card.id] !== card.main));
const firstReady = computed(() => !(series.value.ready || []).length);
const gameResult = computed(() => props.table.result?.winners?.length ? `${props.table.result.winners.map(name).join(" & ")} won game ${series.value.gameNumber}.` : `Game ${series.value.gameNumber} ended in a draw.`);
async function load() {
  const request = ++serial;
  inventory.value = null;
  allocations.value = {};
  error.value = "";
  if (!props.human?.seatId) { loading.value = false; return; }
  loading.value = true;
  try {
    const result = await props.human.readSideboard();
    if (request !== serial) return;
    inventory.value = result;
    allocations.value = Object.fromEntries((result?.cards || []).map((card) => [card.id, card.main]));
  } catch (err) {
    if (request === serial) error.value = err.message;
  } finally {
    if (request === serial) loading.value = false;
  }
}
watch([() => props.app?.match?.id, () => props.human?.seatId, () => series.value.gameNumber, () => series.value.currentPlayer, () => series.value.ready.join(",")], load, { immediate: true });
watch([() => props.app?.match?.id, () => props.human?.seatId, () => series.value.gameNumber], () => { message.value = ""; });
watch(() => series.value.nextStartingPlayer, (id) => { startingPlayer.value = id; }, { immediate: true });
async function ready() {
  if (!canPrepare.value || !valid.value || loading.value || !inventory.value) return;
  const confirmed = await props.human.prepareNextGame({
    ...(changed.value ? { main: cards.value.map((card) => ({ id: card.id, count: allocations.value[card.id] })) } : {}),
    ...(firstReady.value ? { startingPlayer: startingPlayer.value } : {}),
    message: message.value,
  });
  if (confirmed) message.value = "";
}
</script>

<template>
  <section class="min-w-0 space-y-4 pb-4" aria-labelledby="between-games-title">
    <header>
      <h2 id="between-games-title" class="text-lg font-semibold">Prepare game {{ series.gameNumber + 1 }}</h2>
      <p class="mt-1 text-sm text-base-content/70">{{ gameResult }} {{ reselecting ? "Everyone chooses packets again after confirming readiness. Their conversations continue across games." : "Players keep their decks and conversations; the table resets after everyone is ready." }}</p>
    </header>
    <ul class="flex flex-wrap gap-2" aria-label="Next game readiness">
      <li v-for="player in table.players" :key="player.id" class="flex items-center gap-2 rounded-box border border-base-300 bg-base-200 px-3 py-2 text-sm">
        <strong>{{ player.name || player.id }}</strong>
        <span v-if="series.ready.includes(player.id)" class="badge badge-sm"><Check class="size-3" aria-hidden="true" />Ready</span>
        <span v-else class="text-xs text-base-content/70">{{ series.currentPlayer === player.id ? 'Preparing' : 'Waiting' }}</span>
      </li>
    </ul>
    <p v-if="!canPrepare" class="text-sm text-base-content/70" role="status">Waiting for {{ name(series.currentPlayer) }} to confirm their deck.</p>
    <p v-if="loading" class="flex items-center gap-2 text-sm" role="status"><span class="loading loading-spinner loading-xs" />Loading your cards…</p>
    <div v-if="error" role="alert" class="flex flex-wrap items-center gap-2 text-sm text-error">{{ error }}<button class="btn btn-sm" @click="load"><RefreshCw class="size-3.5" />Retry</button></div>
    <template v-if="inventory">
      <section v-if="inventory.available && !reselecting" class="min-w-0 rounded-box border border-base-300 bg-base-200 p-3" aria-labelledby="sideboard-title">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 id="sideboard-title" class="font-semibold">Your deck & sideboard</h3>
          <span class="text-sm tabular-nums" :class="valid ? 'text-base-content/70' : 'text-warning'">{{ mainCount }} / {{ inventory.mainSize }} cards in main deck</span>
        </div>
        <p v-if="series.sideboarding" class="mt-1 text-xs text-base-content/70">Change the main-deck counts to swap cards. Keep {{ inventory.mainSize }} cards in the deck; the rest remain in your sideboard. Changes are private until you play the cards.</p>
        <p v-else class="mt-1 text-xs text-base-content/70">Sideboarding is off. Your deck will be restored and shuffled for the next game.</p>
        <div class="mt-3 max-h-[45vh] max-w-full overflow-x-auto overflow-y-auto">
          <table class="table table-sm table-pin-rows">
            <thead><tr><th>Card</th><th class="text-right">Main deck</th><th class="text-right">Sideboard</th></tr></thead>
            <tbody>
              <tr v-for="card in cards" :key="card.id">
                <td class="min-w-24"><button class="text-left hover:underline focus-visible:outline-2 focus-visible:outline-primary" @click="emit('inspect', card.definition)">{{ card.definition.name }}</button><span class="mt-0.5 block text-xs text-base-content/60">{{ card.definition.mana_cost }} · {{ card.definition.type_line }}</span></td>
                <td class="w-24"><label><span class="sr-only">{{ card.definition.name }} main deck count</span><input v-model.number="allocations[card.id]" type="number" min="0" :max="card.total" step="1" class="input input-sm w-20 text-right" :aria-label="`${card.definition.name} main deck count`" :disabled="!canEdit || human.busy" /></label></td>
                <td class="text-right tabular-nums">{{ card.total - Number(allocations[card.id] || 0) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <p v-else class="text-sm text-base-content/70">{{ reselecting ? "Confirm readiness to return to packet selection. You can keep your previous choices or try a different pair." : "No sideboarding for this match. Your deck will be restored and shuffled for the next game." }}</p>
      <form v-if="canPrepare" class="space-y-3 rounded-box border border-base-300 p-3" @submit.prevent="ready">
        <label v-if="firstReady" class="flex flex-wrap items-center gap-2 text-sm">Starting player
          <select v-model="startingPlayer" class="select select-sm w-auto" :disabled="human.busy">
            <option v-for="player in table.players" :key="player.id" :value="player.id">{{ player.name || player.id }}</option>
          </select>
        </label>
        <p v-else class="text-sm text-base-content/70">{{ name(series.nextStartingPlayer) }} starts the next game.</p>
        <label class="grid gap-1"><span class="label">Message with readiness (optional)</span><input v-model="message" maxlength="2000" class="input input-sm w-full" :disabled="human.busy" placeholder="Ready for the next game." /></label>
        <p v-if="!valid" class="text-sm text-warning" role="status">Keep exactly {{ inventory.mainSize }} cards in your main deck.</p>
        <p v-if="human.error" class="text-sm text-error" role="alert">{{ human.error }}</p>
        <button type="submit" class="btn btn-sm btn-primary" :disabled="!valid || loading || human.busy"><Check class="size-4" />{{ human.busy ? 'Confirming…' : changed ? 'Save swaps & ready' : reselecting ? 'Ready to choose packets' : 'Ready for next game' }}</button>
      </form>
    </template>
  </section>
</template>
