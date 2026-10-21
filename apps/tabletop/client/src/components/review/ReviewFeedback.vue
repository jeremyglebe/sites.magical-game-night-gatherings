<script setup>
import { computed } from "vue";
import { ExternalLink } from "@lucide/vue";
import ReviewAvatar from "./ReviewAvatar.vue";
import { formatDate } from "./review-format.js";
const props = defineProps({
  recording: Object,
  players: { type: Array, default: () => [] },
});
const emit = defineEmits(["seek"]);
const survey = computed(() => props.recording?.postgame),
  schema = computed(() => survey.value?.schema || {});
const participants = computed(
  () => survey.value?.players || props.recording?.initial.players || [],
);
const responses = computed(() => survey.value?.responses || {});
const submitted = computed(() =>
  participants.value.filter((p) => responses.value[p.id]),
);
const completed = computed(() =>
  ["complete", "completed"].includes(survey.value?.status),
);
const missing = computed(() =>
  participants.value
    .filter((p) => !responses.value[p.id])
    .map((p) => p.name || p.id),
);
const config = (id) => props.players.find((player) => player.id === id) || {};
function option(options, value) {
  const item = (options || []).find(
    (item) =>
      (typeof item === "string" ? item : item.value || item.id) === value,
  );
  return typeof item === "string"
    ? item.replaceAll("_", " ")
    : item?.label || String(value || "Not supplied").replaceAll("_", " ");
}
const anchors = (rating) =>
  Object.entries(rating.anchors || {})
    .map(([score, text]) => `${score}: ${text}`)
    .join(" · ");
const scores = (rating) =>
  submitted.value
    .map((p) => responses.value[p.id].answers?.ratings?.[rating.id]?.score)
    .filter(Number.isFinite);
function scoreLabel(rating) {
  const values = scores(rating);
  if (!values.length) return "Not rated";
  if (rating.id === "deck_strength")
    return Math.min(...values) === Math.max(...values)
      ? `${values[0]}/10`
      : `${Math.min(...values)}–${Math.max(...values)}/10`;
  return `${(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)}/10`;
}
function evidence(revision) {
  if (!Number.isSafeInteger(revision)) return null;
  if (revision === props.recording.initial.revision) return 0;
  const at = props.recording.frames.findIndex(
    (frame) => frame.event.revision === revision,
  );
  return at >= 0 ? at + 1 : null;
}
</script>
<template>
  <section aria-label="Player feedback" class="space-y-6">
    <p v-if="!survey" class="rounded-lg border border-base-300 p-6 text-sm">
      No post-game questionnaire was recorded for this game. The conversation
      and replay are still available for your own review.
    </p>
    <template v-else>
      <header>
        <h2 class="text-lg font-semibold">
          {{ schema.title || "Post-game feedback" }}
        </h2>
        <p class="mt-1 text-sm">
          {{ submitted.length }} of {{ participants.length }} responses ·
          {{ completed ? "Complete" : "Feedback pending" }}
        </p>
        <p class="mt-3 max-w-4xl text-sm leading-relaxed text-base-content/65">
          Independent player assessments from this game. Ratings reflect each
          player’s perspective, not a verified rules judgment or a conclusion
          about every matchup. AI enjoyment ratings estimate the human play
          experience.
        </p>
      </header>
      <p v-if="!completed" class="alert text-sm" role="status">
        Awaiting {{ missing.join(", ") }}. The outcome is recorded; the playtest
        is complete once all feedback is submitted.
      </p>
      <div
        v-if="submitted.length"
        class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        <section
          v-for="rating in schema.ratings || []"
          :key="rating.id"
          class="border-l border-base-content/20 pl-4"
        >
          <h3 class="text-sm font-semibold">{{ rating.label || rating.id }}</h3>
          <strong class="my-1 block text-2xl tabular-nums">{{
            scoreLabel(rating)
          }}</strong>
          <p class="text-xs text-base-content/65">
            {{
              rating.id === "deck_strength"
                ? "Range of players’ own-deck ratings"
                : rating.id === "complexity"
                  ? "Average difficulty · higher means harder"
                  : "Average player rating"
            }}
          </p>
          <p class="mt-1 text-xs text-base-content/65">
            {{ scores(rating).length }} rated ·
            {{ submitted.length - scores(rating).length }} not enough evidence
          </p>
          <p class="mt-2 text-xs leading-relaxed text-base-content/65">
            {{ anchors(rating) }}
          </p>
        </section>
      </div>
      <section
        v-for="(player, seat) in participants"
        :key="player.id"
        class="space-y-4 rounded-lg border border-base-300 p-4 sm:p-5"
      >
        <header class="flex items-center gap-3">
          <ReviewAvatar :player="config(player.id)" :seat="seat" />
          <div>
            <h3 class="font-semibold">{{ player.name || player.id }}</h3>
            <p class="text-xs text-base-content/65">
              {{
                responses[player.id]
                  ? `Submitted ${formatDate(responses[player.id].submittedAt)} · ${player.ai === false ? "Human" : "AI"} player`
                  : "Awaiting independent feedback"
              }}
            </p>
          </div>
        </header>
        <template v-if="responses[player.id]">
          <p class="text-sm">
            Confidence in this assessment:
            {{
              option(
                schema.confidenceOptions,
                responses[player.id].answers?.confidence,
              )
            }}
          </p>
          <dl class="grid gap-4 md:grid-cols-2">
            <div v-for="rating in schema.ratings || []" :key="rating.id">
              <dt class="text-sm font-medium" :title="anchors(rating)">
                {{
                  player.ai !== false && rating.aiLabel
                    ? rating.aiLabel
                    : rating.label || rating.id
                }}
              </dt>
              <dd class="mt-1 text-sm">
                <strong>{{
                  Number.isFinite(
                    responses[player.id].answers?.ratings?.[rating.id]?.score,
                  )
                    ? `${responses[player.id].answers.ratings[rating.id].score}/10`
                    : "Not enough evidence"
                }}</strong>
                <p
                  v-if="
                    responses[player.id].answers?.ratings?.[rating.id]?.reason
                  "
                  class="mt-1 whitespace-pre-wrap leading-relaxed text-base-content/70"
                >
                  {{ responses[player.id].answers.ratings[rating.id].reason }}
                </p>
              </dd>
            </div>
          </dl>
          <section
            v-for="question in schema.textQuestions || []"
            :key="question.id"
            class="border-t border-base-300 pt-4"
          >
            <h4 class="text-sm font-semibold">
              {{ question.label || question.id }}
            </h4>
            <p
              class="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-base-content/75"
            >
              {{
                responses[player.id].answers?.[question.id] ||
                "No observation supplied."
              }}
            </p>
          </section>
          <section class="space-y-3 border-t border-base-300 pt-4">
            <h4 class="text-sm font-semibold">Rules observations</h4>
            <p class="text-sm">
              {{
                option(
                  schema.rulesObservationOptions,
                  responses[player.id].answers?.rules_observation,
                )
              }}
            </p>
            <div
              v-for="(incident, i) in responses[player.id].answers
                ?.rules_incidents || []"
              :key="i"
              class="space-y-2 border-l border-base-content/20 pl-3"
            >
              <p class="whitespace-pre-wrap text-sm leading-relaxed">
                {{ incident.description }}
              </p>
              <p class="text-xs text-base-content/65">
                {{ option(schema.incidentStatusOptions, incident.status) }} ·
                {{
                  option(schema.incidentImpactOptions, incident.impact)
                }}
                impact
              </p>
              <button
                v-if="evidence(incident.revision) !== null"
                class="btn btn-sm"
                @click="emit('seek', evidence(incident.revision))"
              >
                <ExternalLink class="size-4" />View revision
                {{ incident.revision }}
              </button>
              <p
                v-else-if="Number.isSafeInteger(incident.revision)"
                class="text-xs text-base-content/65"
              >
                Revision {{ incident.revision }} · position not recorded
              </p>
            </div>
          </section>
        </template>
      </section>
    </template>
  </section>
</template>
