<script setup>
import { computed, ref } from "vue";
import { avatarImage } from "./activity.mjs";
import { turnNumberLabel } from "../../../../shared/table-language.mjs";

const props = defineProps({
  players: { type: Array, default: () => [] },
  configs: { type: Array, default: () => [] },
  turn: { type: Object, default: () => ({}) },
  active: { type: String, default: null },
  interactive: Boolean,
});
const emit = defineEmits(["player-details"]);
const activeLabel = computed(() => Number.isSafeInteger(props.turn.counts?.[props.active])
  && props.turn.counts[props.active] > 0
  ? turnNumberLabel(props.turn, props.active).replace(/^./, letter => letter.toUpperCase())
  : "Turn");
const failedImages = ref(new Set());
const portraits = computed(() => props.players.map((player, index) => {
  const config = props.configs.find((candidate) => candidate.id === player.id);
  const image = avatarImage(config?.avatar || player.avatar);
  return {
    ...player,
    name: player.name || config?.name || `Player ${index + 1}`,
    image: failedImages.value.has(image) ? null : image,
    seat: index + 1,
  };
}));
</script>

<template>
  <ul
    v-if="portraits.length"
    class="flex gap-4 overflow-x-auto overscroll-contain px-3 py-4"
    aria-label="Players in turn order"
  >
    <li
      v-for="player in portraits"
      :key="player.id"
      class="flex w-18 shrink-0 items-center first:ml-auto last:mr-auto"
      :data-active-turn-player="player.id === active ? player.id : undefined"
    >
        <component
          :is="interactive ? 'button' : 'div'"
          :type="interactive ? 'button' : undefined"
          :role="interactive ? undefined : 'img'"
          :title="player.name"
          :aria-label="`${interactive ? 'View ' + player.name + ' details' : player.name}${player.id === active ? ' · ' + activeLabel : ''}`"
          :aria-haspopup="interactive ? 'dialog' : undefined"
          class="avatar rounded-full focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-primary"
          :class="[{ 'avatar-placeholder': !player.image }, interactive ? 'btn btn-sm btn-circle btn-ghost size-18 border-0 p-0' : '']"
          @click="interactive && emit('player-details', player.id)"
        >
          <div
            class="size-18 rounded-full ring-offset-base-100 transition-shadow motion-reduce:transition-none"
            :class="player.id === active
              ? 'ring-3 ring-primary ring-offset-4'
              : 'ring-1 ring-base-300'"
          >
            <img
              v-if="player.image"
              :src="player.image"
              alt=""
              width="72"
              height="72"
              class="object-cover"
              @error="failedImages.add(player.image)"
            />
            <span v-else class="flex size-full items-center justify-center bg-base-300 text-xl text-base-content">{{ player.seat }}</span>
          </div>
        </component>
    </li>
  </ul>
</template>
