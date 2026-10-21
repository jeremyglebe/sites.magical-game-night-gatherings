<script setup>
import { computed, ref, watch } from "vue";
import ReviewAvatar from "./ReviewAvatar.vue";
import ReviewCard from "./ReviewCard.vue";
import { keyboardTabs, modelLabel } from "./review-format.js";
const props = defineProps({
  decks: { type: Array, default: () => [] },
  players: { type: Array, default: () => [] },
});
const emit = defineEmits(["inspect"]);
const selected = ref(null);
watch(
  () => props.decks,
  (decks) => {
    if (!decks.some((deck) => deck.id === selected.value))
      selected.value = decks[0]?.id;
  },
  { immediate: true },
);
const deck = computed(() =>
  props.decks.find((deck) => deck.id === selected.value),
);
const groups = computed(() => deck.value ? [
  { title: "Main deck", cards: deck.value.cards, total: deck.value.total },
  ...(deck.value.sideboard?.length ? [{ title: "Sideboard", cards: deck.value.sideboard, total: deck.value.sideboardTotal ?? deck.value.sideboard.reduce((sum, card) => sum + card.count, 0) }] : []),
] : []);
const player = (id) => props.players.find((player) => player.id === id) || {};
</script>
<template>
  <section aria-label="Player decks" class="space-y-5">
    <div
      class="tabs tabs-box w-fit max-w-full flex-wrap"
      role="tablist"
      aria-label="Choose a player's deck"
      @keydown="
        keyboardTabs(
          $event,
          decks.map((d) => d.id),
          selected,
          (value) => (selected = value),
        )
      "
    >
      <button
        v-for="(item, seat) in decks"
        :id="`review-deck-tab-${seat}`"
        :key="item.id"
        class="tab gap-2"
        :class="{ 'tab-active': selected === item.id }"
        role="tab"
        :aria-selected="selected === item.id"
        aria-controls="review-deck-content"
        :tabindex="selected === item.id ? 0 : -1"
        @click="selected = item.id"
      >
        <ReviewAvatar :player="player(item.id)" :seat="seat" />{{ item.name }}
      </button>
    </div>
    <div
      v-if="deck"
      id="review-deck-content"
      role="tabpanel"
      :aria-labelledby="`review-deck-tab-${decks.indexOf(deck)}`"
    >
      <div class="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">{{ deck.name }} · Deck</h2>
          <p class="text-sm text-base-content/65">
            {{ modelLabel(player(deck.id)) }}
          </p>
        </div>
        <p class="text-sm tabular-nums">
          {{ deck.total }} cards · {{ deck.cards.length }} entries
        </p>
      </div>
      <p class="mb-5 text-sm text-base-content/65">
        {{
          deck.source === "setup"
            ? "Full starting deck saved with this game. Select a card for its cached Oracle text and rulings."
            : deck.source === "game-start"
              ? "Deck and sideboard saved at the start of this game. Select a card for its cached Oracle text and rulings."
              : deck.note
        }}
      </p>
      <p v-if="!deck.cards.length" class="py-5 text-sm">
        No card definitions were saved for this player.
      </p>
      <section v-for="group in groups" :key="group.title" class="mt-5" :aria-label="group.title">
      <h3 v-if="groups.length > 1" class="mb-3 font-semibold">{{ group.title }} · {{ group.total }} cards</h3>
      <ul class="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
        <li
          v-for="(item, index) in group.cards"
          :key="index"
          class="flex min-w-0 items-center gap-3 border-b border-base-300 pb-3"
        >
          <span class="w-6 shrink-0 text-right font-semibold tabular-nums"
            >{{ item.count }}×</span
          ><ReviewCard
            :definition="item.definition"
            @inspect="(definition) => emit('inspect', definition)"
          />
          <button
            class="min-w-0 flex-1 rounded text-left focus-visible:outline-2 focus-visible:outline-primary"
            :aria-label="`${item.count} ${item.definition.name}, inspect card`"
            @click="emit('inspect', item.definition)"
          >
            <span class="block font-medium">{{
              item.definition.name || "Unnamed card"
            }}</span
            ><span class="mt-1 block text-xs text-base-content/65">{{
              item.definition.type_line
            }}</span
            ><span class="mt-1 block text-xs">{{
              item.definition.mana_cost
            }}</span>
          </button>
        </li>
      </ul>
      </section>
    </div>
  </section>
</template>
