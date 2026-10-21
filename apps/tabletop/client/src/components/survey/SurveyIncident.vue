<script setup>
import { Trash2 } from "@lucide/vue";
defineProps({
  incident: { type: Object, required: true },
  schema: { type: Object, required: true },
  revision: Number,
  index: Number,
});
defineEmits(["remove"]);
</script>

<template>
  <fieldset class="fieldset gap-3 border-t border-base-300 pt-4">
    <legend class="fieldset-legend">Incident {{ index + 1 }}</legend>
    <label class="grid gap-1"
      ><span class="label">What happened?</span
      ><textarea
        v-model="incident.description"
        class="textarea textarea-sm min-h-24 w-full"
        required
        :maxlength="schema.limits?.incidentDescription || 2000"
        placeholder="Which rule was involved, and how did it affect the game?"
      />
    </label>
    <div class="grid gap-3 sm:grid-cols-3">
      <label class="grid gap-1"
        ><span class="label">Recorded revision</span
        ><input
          v-model="incident.revision"
          class="input input-sm w-full"
          type="number"
          min="0"
          :max="revision"
          step="1"
          placeholder="Optional"
      /></label>
      <label class="grid gap-1"
        ><span class="label">Was it corrected?</span
        ><select
          aria-label="Was it corrected?"
          v-model="incident.status"
          class="select select-sm w-full"
          required
        >
          <option
            v-for="option in schema.incidentStatusOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select></label
      >
      <label class="grid gap-1"
        ><span class="label">Impact</span
        ><select
          aria-label="Impact"
          v-model="incident.impact"
          class="select select-sm w-full"
          required
        >
          <option
            v-for="option in schema.incidentImpactOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select></label
      >
    </div>
    <button
      type="button"
      class="btn btn-sm btn-ghost justify-self-end"
      @click="$emit('remove')"
    >
      <Trash2 class="size-3.5" /> Remove incident
    </button>
  </fieldset>
</template>
