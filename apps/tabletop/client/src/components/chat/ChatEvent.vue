<script setup>
import { computed, ref } from "vue";
import { playerLabel } from "../../../../shared/table-language.mjs";
import {
  activityParts,
  avatarImage,
  cardImage,
  eventTime,
} from "./activity.mjs";

const props = defineProps({
  event: { type: Object, required: true },
  players: { type: Array, default: () => [] },
  configs: { type: Array, default: () => [] },
  playerDetails: Boolean,
});
const emit = defineEmits(["inspect", "player-details"]);
const seat = computed(() =>
  props.players.findIndex((player) => player.id === props.event.actor),
);
const name = computed(
  () =>
    playerLabel(props.event.actor, props.players),
);
const avatar = computed(() =>
  avatarImage(
    props.configs.find((player) => player.id === props.event.actor)?.avatar,
  ),
);
const canOpenPlayer = computed(() => props.playerDetails && seat.value >= 0);
const failedImages = ref(new Set());
const parts = computed(() => activityParts(props.event, props.players));
</script>

<template>
  <li
    class="chat min-w-0 py-2"
    :class="players.length === 2 && seat === 1 ? 'chat-end' : 'chat-start'"
    :data-revision="event.revision"
  >
    <component
      :is="canOpenPlayer ? 'button' : 'div'"
      class="chat-image avatar avatar-placeholder mt-1 self-start"
      :class="canOpenPlayer ? 'btn btn-sm btn-circle btn-ghost border-0 p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary' : ''"
      :type="canOpenPlayer ? 'button' : undefined"
      :aria-hidden="canOpenPlayer ? undefined : true"
      :aria-label="canOpenPlayer ? `View ${name} details` : undefined"
      :aria-haspopup="canOpenPlayer ? 'dialog' : undefined"
      :title="canOpenPlayer ? name : undefined"
      @click="canOpenPlayer && emit('player-details', event.actor)"
    >
      <div class="w-8 rounded-full bg-base-300 text-base-content">
        <img
          v-if="avatar && !failedImages.has(avatar)"
          :src="avatar"
          alt=""
          width="32"
          height="32"
          class="object-cover"
          @error="failedImages.add(avatar)"
        />
        <span v-else class="text-xs">{{ seat < 0 ? "·" : seat + 1 }}</span>
      </div>
    </component>
    <div class="chat-header mb-1 flex flex-wrap gap-x-2 text-xs">
      <strong>{{ name }}</strong>
      <time
        class="text-base-content/60 tabular-nums"
        :datetime="event.at"
        :title="`Update ${event.revision}`"
        >{{ eventTime(event.at) }}</time
      >
    </div>
    <div
      class="chat-bubble min-w-0 max-w-full space-y-2 border border-base-300 bg-base-200 text-base-content text-sm break-words"
    >
      <template v-for="(part, index) in parts" :key="index">
        <details
          v-if="part.kind === 'actions' && part.lines.length > 2"
          class="collapse collapse-arrow min-h-0 rounded-none"
        >
          <summary
            class="collapse-title min-h-0 py-1 pl-0 pr-6 text-xs text-base-content/70"
          >
            {{ part.lines.length }} table actions
          </summary>
          <div
            class="collapse-content space-y-1 px-0 text-xs text-base-content/70"
          >
            <p v-for="(line, n) in part.lines" :key="n">{{ line }}</p>
          </div>
        </details>
        <div
          v-else-if="part.kind === 'actions'"
          class="space-y-1 text-xs leading-relaxed text-base-content/70"
        >
          <p v-for="(line, n) in part.lines" :key="n">{{ line }}</p>
        </div>
        <p
          v-else-if="part.kind === 'speech'"
          class="whitespace-pre-wrap leading-relaxed"
        >
          {{ part.text }}
        </p>
        <div v-else-if="part.kind === 'reveal'" class="space-y-2">
          <p class="text-xs text-base-content/70">{{ part.text }}</p>
          <div class="flex flex-wrap gap-2" aria-label="Revealed cards">
            <button
              v-for="(card, n) in part.cards"
              :key="n"
              type="button"
              class="w-20 rounded border border-base-300 bg-base-100 p-1 text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
              :aria-label="`Inspect revealed ${card.name}`"
              @click="emit('inspect', card, { historical: true })"
            >
              <img
                v-if="cardImage(card) && !failedImages.has(card.image_url)"
                :src="cardImage(card)"
                alt=""
                width="72"
                height="100"
                class="aspect-[0.716] w-full rounded object-contain"
                loading="lazy"
                @error="failedImages.add(card.image_url)"
              />
              <span
                v-else
                class="flex aspect-[0.716] items-center justify-center bg-base-300 p-1 text-xs"
                >{{ card.name }}</span
              >
              <span class="mt-1 block text-xs leading-tight">{{
                card.name
              }}</span>
            </button>
          </div>
        </div>
      </template>
    </div>
  </li>
</template>
