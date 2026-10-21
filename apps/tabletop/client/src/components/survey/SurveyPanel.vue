<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Check, ClipboardList, Plus, X } from "@lucide/vue";
import SurveyRating from "./SurveyRating.vue";
import SurveyIncident from "./SurveyIncident.vue";
import {
  newSurveyDraft,
  savedSurveyDraft,
  surveyAnswers,
} from "./survey-draft.mjs";

const props = defineProps({
  app: Object,
  request: { type: Function, required: true },
});
const emit = defineEmits(["changed"]);
const survey = computed(() => props.app?.postgame);
const schema = computed(() => survey.value?.schema);
const complete = computed(() =>
  ["complete", "completed"].includes(survey.value?.status),
);
const pendingHumans = computed(() =>
  (survey.value?.players || []).filter(
    (player) => player.ai === false && !survey.value?.responses?.[player.id],
  ),
);
const submitted = computed(
  () =>
    (survey.value?.players || []).filter(
      (player) => survey.value.responses?.[player.id],
    ).length,
);
const dialog = ref(null);
const selected = ref("");
const activeKey = ref("");
const draft = ref(null);
const busy = ref(false);
const error = ref("");
const memoryDrafts = new Map();
function saveDraft() {
  if (!activeKey.value || !draft.value || !schema.value) return;
  const saved = savedSurveyDraft(schema.value, draft.value);
  memoryDrafts.set(activeKey.value, saved);
  try {
    sessionStorage.setItem(activeKey.value, JSON.stringify(saved));
  } catch {
    /* Keep the in-memory draft. */
  }
}
function selectPlayer(playerId) {
  saveDraft();
  selected.value = playerId;
  error.value = "";
  activeKey.value = `game-night-survey:${props.app.match.id}:${survey.value.resultRevision}:${playerId}`;
  let saved = memoryDrafts.get(activeKey.value);
  if (!saved)
    try {
      saved = JSON.parse(sessionStorage.getItem(activeKey.value) || "null");
    } catch {
      /* Start a fresh draft. */
    }
  draft.value = newSurveyDraft(schema.value, saved || {});
}
function open() {
  if (!pendingHumans.value.length) return;
  selectPlayer(
    pendingHumans.value.some((player) => player.id === selected.value)
      ? selected.value
      : pendingHumans.value[0].id,
  );
  dialog.value.showModal();
}
function close() {
  saveDraft();
  dialog.value?.close();
}
function addIncident() {
  if (
    draft.value.rules_incidents.length < (schema.value.limits?.incidents || 20)
  )
    draft.value.rules_incidents.push({
      description: "",
      revision: "",
      status: "uncertain",
      impact: "uncertain",
    });
}
watch(
  () => draft.value?.rules_observation,
  (value) => {
    if (value === "reported" && !draft.value.rules_incidents.length)
      addIncident();
  },
);
watch(draft, saveDraft, { deep: true });
watch(
  () => props.app?.match?.id,
  () => {
    dialog.value?.close();
    activeKey.value = "";
    draft.value = null;
  },
);
watch(pendingHumans, (players) => {
  if (
    dialog.value?.open &&
    !players.some((player) => player.id === selected.value)
  )
    close();
});
onBeforeUnmount(saveDraft);
async function submit() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  saveDraft();
  const key = activeKey.value;
  try {
    await props.request("/api/survey", {
      playerId: selected.value,
      answers: surveyAnswers(schema.value, draft.value),
    });
    activeKey.value = "";
    memoryDrafts.delete(key);
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* The response is already durable. */
    }
    dialog.value.close();
    emit("changed");
  } catch (err) {
    error.value = err.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section
    v-if="survey"
    class="flex flex-wrap items-center justify-between gap-4 rounded-box border border-base-300 bg-base-200 p-4"
    aria-label="Post-game feedback"
  >
    <div>
      <h2 class="flex items-center gap-2 font-semibold">
        <Check v-if="complete" class="size-4 text-success" /><ClipboardList
          v-else
          class="size-4"
        />
        {{
          complete
            ? "Playtest complete"
            : "Game ended · collecting player feedback"
        }}
      </h2>
      <p class="mt-1 max-w-2xl text-sm text-base-content/70">
        {{ submitted }} of {{ survey.players.length }} questionnaires submitted.
        {{
          complete
            ? "Feedback is saved with the game."
            : "Each player answers independently before the playtest is marked complete."
        }}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button
        v-if="pendingHumans.length"
        type="button"
        class="btn btn-sm btn-primary"
        @click="open"
      >
        Answer questionnaire</button
      ><a
        :href="`/games/${app.match.id}#feedback`"
        class="btn btn-sm"
        target="_blank"
        rel="noopener"
        >View player feedback</a
      >
    </div>
    <dialog
      ref="dialog"
      class="modal"
      aria-labelledby="survey-title"
      @cancel="saveDraft"
      @close="saveDraft"
    >
      <div class="modal-box w-11/12 max-w-3xl">
        <div class="mb-4 flex items-center justify-between gap-3">
          <h2 id="survey-title" class="text-xl font-semibold">
            Your playtest feedback
          </h2>
          <button
            class="btn btn-sm btn-ghost btn-square"
            type="button"
            :disabled="busy"
            aria-label="Close questionnaire"
            @click="close"
          >
            <X class="size-4" />
          </button>
        </div>
        <p class="mb-4 text-sm text-base-content/70">
          {{ schema?.introduction }}
        </p>
        <details class="collapse collapse-arrow mb-4 border border-base-300">
          <summary class="collapse-title text-sm font-medium">
            How to assess this game
          </summary>
          <div class="collapse-content space-y-2 text-sm text-base-content/70">
            <p
              v-for="instruction in schema?.instructions || []"
              :key="instruction"
            >
              {{ instruction }}
            </p>
          </div>
        </details>
        <label class="mb-5 flex flex-wrap items-center gap-3 text-sm"
          >Answer as
          <select
            :value="selected"
            :disabled="busy"
            class="select select-sm"
            @change="selectPlayer($event.target.value)"
          >
            <option
              v-for="player in pendingHumans"
              :key="player.id"
              :value="player.id"
            >
              {{ player.name || player.id }}
            </option>
          </select></label
        >
        <form v-if="draft && schema" @submit.prevent="submit">
          <fieldset :disabled="busy" class="space-y-5">
            <SurveyRating
              v-for="question in schema.ratings"
              :key="question.id"
              :question="question"
              :answer="draft.ratings[question.id]"
              :max-length="schema.limits?.ratingReason"
            />
            <fieldset
              v-for="question in schema.textQuestions"
              :key="question.id"
              class="fieldset gap-2 rounded-box border border-base-300 p-4"
            >
              <legend class="fieldset-legend text-sm">
                {{ question.label || question.id }}
              </legend>
              <p class="text-sm">{{ question.question }}</p>
              <p
                v-if="question.help"
                class="text-xs leading-relaxed text-base-content/70"
              >
                {{ question.help }}
              </p>
              <label class="grid gap-1"
                ><span class="label">Your observations (optional)</span
                ><textarea
                  v-model="draft[question.id]"
                  class="textarea textarea-sm min-h-24 w-full"
                  :maxlength="schema.limits?.textAnswer || 3000"
                />
              </label>
            </fieldset>
            <fieldset
              class="fieldset gap-3 rounded-box border border-base-300 p-4"
            >
              <legend class="fieldset-legend text-sm">
                Rules mistakes and corrections
              </legend>
              <p class="text-sm text-base-content/70">
                Report specific mistakes or suspected issues. Distinguish
                corrected mistakes from unresolved ones; a recorded revision is
                optional.
              </p>
              <label class="grid gap-1"
                ><span class="label">What did you observe?</span
                ><select
                  aria-label="What did you observe?"
                  v-model="draft.rules_observation"
                  class="select select-sm w-full"
                  required
                >
                  <option value="" disabled>Choose an observation</option>
                  <option
                    v-for="option in schema.rulesObservationOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select></label
              ><template v-if="draft.rules_observation === 'reported'"
                ><SurveyIncident
                  v-for="(incident, index) in draft.rules_incidents"
                  :key="index"
                  :incident="incident"
                  :index="index"
                  :schema="schema"
                  :revision="survey.resultRevision"
                  @remove="draft.rules_incidents.splice(index, 1)"
                /><button
                  type="button"
                  class="btn btn-sm justify-self-start"
                  :disabled="
                    draft.rules_incidents.length >=
                    (schema.limits?.incidents || 20)
                  "
                  @click="addIncident"
                >
                  <Plus class="size-4" /> Add a rules incident
                </button></template
              >
            </fieldset>
            <fieldset
              class="fieldset gap-2 rounded-box border border-base-300 p-4"
            >
              <legend class="fieldset-legend text-sm">
                Confidence in this assessment
              </legend>
              <p class="text-sm text-base-content/70">
                Consider what you observed, how representative the game was, and
                any rules uncertainty.
              </p>
              <label class="grid gap-1"
                ><span class="label">Your confidence</span
                ><select
                  aria-label="Your confidence"
                  v-model="draft.confidence"
                  class="select select-sm w-full"
                  required
                >
                  <option value="" disabled>Choose your confidence</option>
                  <option
                    v-for="option in schema.confidenceOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select></label
              >
            </fieldset>
          </fieldset>
          <p v-if="error" role="alert" class="alert alert-error mt-4">
            {{ error }}
          </p>
          <div class="modal-action flex-wrap items-center">
            <p class="mr-auto max-w-sm text-xs text-base-content/60">
              Drafts stay in this browser while you switch players. Submit your
              own independent assessment.
            </p>
            <button
              class="btn btn-sm btn-primary"
              type="submit"
              :disabled="busy"
            >
              <span v-if="busy" class="loading loading-spinner loading-sm" />
              {{ busy ? "Submitting…" : "Submit feedback" }}
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button :disabled="busy">Close questionnaire</button>
      </form>
    </dialog>
  </section>
</template>
