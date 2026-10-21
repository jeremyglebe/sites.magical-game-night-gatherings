<script setup>
import CardTile from "./CardTile.vue";
import CardBack from "./CardBack.vue";

const props = defineProps({
  player: { type: Object, required: true },
  hand: { type: Object, required: true },
  human: Object,
  own: Boolean,
  compact: Boolean,
  upper: Boolean,
});
const emit = defineEmits(["inspect", "select", "target", "action"]);
const sourceSelected = (card) => props.human?.selectedSource?.cardId === card.id;
</script>
<template>
  <section
    :id="own ? 'human-controls' : undefined"
    class="border-base-content/20"
    :class="[
      compact ? 'flex min-h-0 max-h-[30%] shrink-0 flex-col' : 'shrink-0',
      upper
        ? (compact ? 'border-b pb-1' : 'mb-3 border-b pb-3')
        : (compact ? 'border-t pt-1' : 'mt-3 border-t pt-3'),
    ]"
    :aria-label="`${player.name}’s hand`"
    :data-hc-drop-zone="`${player.id}:hand`"
    :data-hc-drop-label="`${player.name}’s hand`"
    @click.self="emit('target', { zoneId: `${player.id}:hand` })"
  >
    <div
      class="flex shrink-0 items-center justify-between gap-2"
      :class="compact ? 'mb-0.5 min-h-5' : 'mb-2'"
    >
      <button
        v-if="own"
        class="btn btn-xs btn-ghost px-0"
        @click="emit('target', { zoneId: `${player.id}:hand` })"
      >
        Your hand
      </button>
      <h3
        v-else
        :class="
          compact
            ? 'text-[10px] font-medium uppercase tracking-wider'
            : 'text-sm font-semibold'
        "
      >
        Hand
      </h3>
      <span class="ml-auto text-xs text-base-content/60"
        >{{ hand.count }} cards{{ own ? " · private" : "" }}</span
      ><button
        v-if="own"
        class="btn btn-xs"
        :disabled="human.busy"
        @click="human.leave()"
      >
        Hide hand
      </button>
    </div>
    <p v-if="own && !compact" class="mb-2 text-xs text-base-content/60">
      Drag onto the battlefield or a zone. Moves stay queued until you send.
    </p>
    <div
      class="flex items-start gap-2 overflow-x-auto px-1 pt-1"
      :class="compact
        ? ['min-h-0 pb-1 [container-type:size]', hand.count ? (own ? 'h-20' : 'h-16') : 'h-6']
        : 'min-h-14 pb-2'"
      @click.self="emit('target', { zoneId: `${player.id}:hand` })"
    >
      <CardTile
        v-for="card in hand.cards || []"
        :key="card.id"
        :card="card"
        :compact="!own"
        :dense="compact"
        :fit-lane="compact"
        :hand="own"
        hand-hover
        :draggable="human?.canDrag?.({ cardId: card.id })"
        :selected="sourceSelected(card)"
        @inspect="emit('inspect', $event)"
        @select="emit('select', $event)"
      />
      <CardBack
        v-for="n in Math.max(0, hand.count - (hand.cards?.length || 0))"
        :key="`hidden-${n}`"
        :class="compact ? 'w-[min(2.5rem,70cqh)]' : 'w-10'"
      />
      <span
        v-if="!hand.count"
        class="self-center text-xs text-base-content/45"
        >Empty hand</span
      >
    </div>
    <details v-if="own && !compact" class="mt-2">
      <summary class="cursor-pointer py-1 text-xs text-base-content/70">
        More table actions
      </summary>
      <div class="flex flex-wrap gap-1 py-2">
        <button
          v-for="[action, label] in [
            ['draw-many', 'Draw cards'],
            ['return', 'Return hand'],
            ['peek', 'Look at cards'],
            ['token', 'Create token'],
            ['ability', 'Stack ability'],
            ['outcome', 'Concede / outcome'],
          ]"
          :key="action"
          class="btn btn-xs"
          :disabled="!human.canCommit"
          @click="emit('action', action)"
        >
          {{ label }}
        </button>
      </div>
    </details>
  </section>
</template>
