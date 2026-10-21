<script setup>
import { ref } from "vue";
import { ArrowDown } from "@lucide/vue";
import { activityParts } from "../chat/activity.mjs";
import { playerLabel } from "../../../../shared/table-language.mjs";
import ReviewAvatar from "./ReviewAvatar.vue";
import ReviewCard from "./ReviewCard.vue";
import { formatDate } from "./review-format.js";
const props = defineProps({
  events: { type: Array, default: () => [] },
  players: { type: Array, default: () => [] },
  position: { type: Number, default: 0 },
});
const emit = defineEmits(["seek", "inspect"]);
const list = ref(null);
const player = (id) =>
  props.players.find((p) => p.id === id) || { id, name: playerLabel(id, props.players) };
const seat = (id) => props.players.findIndex((p) => p.id === id);
function groups(event) {
  return activityParts(event, props.players).map(({ kind, lines, ...part }) => ({
    type: kind,
    actions: lines,
    ...part,
  }));
}
function scrollToCurrent() {
  const item = list.value?.querySelector(`[data-position="${props.position}"]`);
  if (item)
    list.value.scrollTop +=
      item.getBoundingClientRect().top -
      list.value.getBoundingClientRect().top -
      12;
  else if (list.value && !props.position) list.value.scrollTop = 0;
}
defineExpose({ scrollToCurrent });
</script>
<template>
  <section aria-labelledby="review-conversation-title" class="min-w-0">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 id="review-conversation-title" class="font-semibold">
          Table talk & actions
        </h2>
        <p class="text-xs text-base-content/65">
          Select an action to see that moment.
        </p>
      </div>
      <button class="btn btn-sm" :disabled="!position" @click="scrollToCurrent">
        <ArrowDown class="size-4" /> Current action
      </button>
    </div>
    <ol
      ref="list"
      class="max-h-[75dvh] min-h-40 space-y-3 overflow-y-auto overscroll-contain pr-2"
      aria-label="Recorded conversation and actions"
    >
      <li v-if="!events.length" class="py-6 text-sm text-base-content/65">
        No table actions have been recorded yet.
      </li>
      <li
        v-for="entry in events"
        :key="entry.position"
        :data-position="entry.position"
        class="chat min-w-0"
        :class="[
          players.length === 2 && seat(entry.event.actor) === 1
            ? 'chat-end'
            : 'chat-start',
          entry.position > position ? 'opacity-45' : 'opacity-100',
        ]"
      >
        <ReviewAvatar
          class="chat-image"
          :player="player(entry.event.actor)"
          :seat="seat(entry.event.actor)"
        />
        <div class="chat-header mb-1 flex flex-wrap gap-2">
          <strong class="text-sm">{{ player(entry.event.actor).name }}</strong
          ><button
            class="btn btn-xs btn-ghost text-xs tabular-nums"
            :aria-current="entry.position === position ? 'step' : undefined"
            :aria-label="`${player(entry.event.actor).name}, batch ${entry.position}, revision ${entry.event.revision}. Show this position.`"
            @click="emit('seek', entry.position)"
          >
            #{{ entry.position }} ·
            {{
              formatDate(entry.event.at, { hour: "numeric", minute: "2-digit" })
            }}
          </button>
        </div>
        <div
          class="chat-bubble max-w-full space-y-2 break-words bg-base-200 text-base-content"
          :class="{ 'ring-1 ring-primary/60': entry.position === position }"
        >
          <template v-for="(group, index) in groups(entry.event)" :key="index">
            <p
              v-if="group.type === 'speech'"
              class="whitespace-pre-wrap border-l-2 border-primary/50 pl-3 text-sm leading-relaxed"
            >
              {{ group.text }}
            </p>
            <div v-else-if="group.type === 'reveal'" class="space-y-2">
              <p class="text-xs leading-relaxed text-base-content/70">
                {{ group.text }}
              </p>
              <div class="flex flex-wrap gap-2" aria-label="Revealed cards">
                <ReviewCard
                  v-for="(card, cardIndex) in group.cards"
                  :key="cardIndex"
                  :definition="card"
                  caption
                  @inspect="(definition) => emit('inspect', definition)"
                />
              </div>
            </div>
            <details
              v-else-if="group.actions.length > 2"
              class="collapse collapse-arrow min-h-0 rounded-none"
            >
              <summary class="collapse-title min-h-0 py-1 pl-0 text-xs">
                {{ group.actions.length }} table actions
              </summary>
              <div
                class="collapse-content space-y-1 px-0 text-xs leading-relaxed text-base-content/70"
              >
                <p v-for="(action, i) in group.actions" :key="i">
                  {{ action }}
                </p>
              </div>
            </details>
            <div
              v-else
              class="space-y-1 text-xs leading-relaxed text-base-content/70"
            >
              <p v-for="(action, i) in group.actions" :key="i">{{ action }}</p>
            </div>
          </template>
        </div>
      </li>
    </ol>
  </section>
</template>
