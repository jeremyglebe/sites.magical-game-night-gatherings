<script setup>
import { computed, ref, watch } from "vue";
import { Check, Layers } from "@lucide/vue";
import ReviewCard from "../review/ReviewCard.vue";
import { combinedPacketCards, deckCounts, factionName, packetSelectionError } from "./packet-selection.mjs";

const props = defineProps({ table: Object, app: Object, human: Object });
const emit = defineEmits(["inspect"]);
const preparation = computed(() => props.table.preparation);
const selection = ref([]);
const error = ref("");
const browsingFaction = ref("plants");
const seat = computed(() => preparation.value.players.find((player) => player.id === props.human?.seatId));
const shownFaction = computed(() => seat.value?.faction || browsingFaction.value);
const packets = computed(() => preparation.value.packets.filter((packet) => packet.faction === shownFaction.value));
const activePlayer = computed(() => props.table.players.find((player) => player.id === preparation.value.currentPlayer));
const thinking = computed(() => props.app?.coordinator?.players?.some((player) => player.id === preparation.value.currentPlayer && player.active));
const canChoose = computed(() => !!seat.value && !seat.value.ready && preparation.value.currentPlayer === seat.value.id && props.human?.canAct);
const selectionError = computed(() => packetSelectionError(preparation.value, props.human?.seatId, selection.value));
const preview = computed(() => combinedPacketCards(preparation.value.packets, selection.value));
const counts = computed(() => deckCounts(preview.value));
watch(
  [() => props.app?.match?.id, () => props.human?.seatId, () => seat.value?.ready, () => seat.value?.faction],
  () => {
    selection.value = [...(seat.value?.selectedPacketIds || [])];
    error.value = "";
  },
  { immediate: true },
);
function toggle(id, checked) {
  if (!canChoose.value) return;
  selection.value = checked
    ? [...selection.value, id].slice(0, preparation.value.packetsPerPlayer)
    : selection.value.filter((value) => value !== id);
  error.value = "";
}
function playerName(id) {
  return props.table.players.find((player) => player.id === id)?.name || id;
}
function selectedNames(player) {
  return (player.selectedPacketIds || []).map((id) => preparation.value.packets.find((packet) => packet.id === id)?.name || id).join(" + ");
}
async function confirm() {
  if (!canChoose.value || selectionError.value) return;
  error.value = "";
  try {
    await props.human.selectPackets([...selection.value]);
  } catch (err) {
    error.value = err.message;
  }
}
</script>

<template>
  <section class="min-w-0 space-y-4 pb-4" aria-labelledby="preparation-title">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="preparation-title" class="text-lg font-semibold">Choose your packets</h2>
        <p class="text-sm text-base-content/70">{{ preparation.title }} · v{{ preparation.version }}</p>
      </div>
      <span class="badge badge-sm">Before the game</span>
    </header>
    <ul class="grid gap-2 sm:grid-cols-2" aria-label="Packet selection status">
      <li v-for="player in preparation.players" :key="player.id" class="rounded-box border border-base-300 bg-base-200 p-3 text-sm">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <strong>{{ playerName(player.id) }} · {{ factionName(player.faction) }}</strong>
          <span v-if="player.ready" class="badge badge-sm"><Check class="size-3" aria-hidden="true" /> Ready</span>
          <span v-else class="text-xs text-base-content/70">{{ preparation.currentPlayer === player.id ? (thinking ? 'Thinking…' : 'Choosing packets') : 'Waiting' }}</span>
        </div>
        <p class="mt-1 text-xs text-base-content/70">{{ selectedNames(player) || 'No packets confirmed' }}</p>
      </li>
    </ul>
    <p role="status" class="text-sm text-base-content/70">
      <template v-if="canChoose">Choose two different {{ factionName(seat.faction) }} packets. Inspect any card, then confirm your forty-card deck.</template>
      <template v-else-if="seat?.ready">Your deck is confirmed. Waiting for {{ activePlayer?.name || 'the other player' }}.</template>
      <template v-else>{{ activePlayer?.name || 'The next player' }} is choosing packets.<template v-if="!human?.seatId"> Choose a human seat above to participate, or browse the lists.</template></template>
    </p>
    <label v-if="!seat" class="flex flex-wrap items-center gap-2 text-sm">
      Browse faction
      <select v-model="browsingFaction" class="select select-sm w-auto">
        <option value="plants">Plants</option>
        <option value="zombies">Zombies</option>
      </select>
    </label>
    <section v-if="seat" class="rounded-box border border-base-300 bg-base-200 p-3" aria-labelledby="combined-deck-title">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="combined-deck-title" class="flex items-center gap-2 font-semibold"><Layers class="size-4" aria-hidden="true" />Your combined deck</h3>
          <p class="mt-1 text-sm text-base-content/70">{{ selection.length }} / {{ preparation.packetsPerPlayer }} packets · {{ counts.cards }} cards · {{ counts.lands }} lands</p>
        </div>
        <button v-if="!seat.ready" type="button" class="btn btn-sm btn-primary" :disabled="!canChoose || !!selectionError || counts.cards !== 40" @click="confirm">
          <span v-if="human.busy" class="loading loading-spinner loading-xs" aria-hidden="true"></span>
          {{ human.busy ? 'Confirming…' : 'Confirm two packets' }}
        </button>
      </div>
      <details v-if="preview.length" class="collapse collapse-arrow mt-3 border border-base-300">
        <summary class="collapse-title text-sm">Preview combined card list</summary>
        <ul class="collapse-content grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <li v-for="card in preview" :key="card.name"><button type="button" class="text-left hover:underline focus-visible:outline-2 focus-visible:outline-primary" @click="emit('inspect', card)">{{ card.count }}× {{ card.name }}</button></li>
        </ul>
      </details>
      <p v-if="error || human.error" class="mt-3 text-sm text-error" role="alert">{{ error || human.error }}</p>
    </section>
    <div class="grid items-start gap-3 xl:grid-cols-2">
      <article v-for="packet in packets" :key="packet.id" class="card card-border bg-base-200" :class="selection.includes(packet.id) ? 'border-primary' : 'border-base-300'">
        <div class="card-body gap-3 p-3">
          <div class="flex items-center justify-between gap-3">
            <h3 class="card-title text-base">{{ packet.name }}</h3>
            <label v-if="seat" class="flex shrink-0 items-center gap-2 text-xs">
              <input type="checkbox" class="checkbox checkbox-sm" :checked="selection.includes(packet.id)" :disabled="!canChoose || (!selection.includes(packet.id) && selection.length >= preparation.packetsPerPlayer)" :aria-label="`Select ${packet.name}`" @change="toggle(packet.id, $event.target.checked)" />
              {{ selection.includes(packet.id) ? 'Selected' : 'Choose' }}
            </label>
          </div>
          <p class="text-xs text-base-content/70">{{ deckCounts(packet.cards).cards }} cards · {{ deckCounts(packet.cards).lands }} lands</p>
          <p v-if="packet.plan" class="text-sm text-base-content/70">{{ packet.plan }}</p>
          <ul class="grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-3">
            <li v-for="card in packet.cards" :key="card.name" class="flex min-w-0 flex-col items-start gap-1">
              <ReviewCard :definition="card" @inspect="emit('inspect', $event)" />
              <button type="button" class="text-left hover:underline focus-visible:outline-2 focus-visible:outline-primary" @click="emit('inspect', card)">{{ card.count || 1 }}× {{ card.name }}</button>
            </li>
          </ul>
        </div>
      </article>
    </div>
  </section>
</template>
