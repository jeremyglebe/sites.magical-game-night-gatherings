<script setup>
defineProps({
  question: { type: Object, required: true },
  answer: { type: Object, required: true },
  maxLength: { type: Number, default: 1200 },
});
</script>

<template>
  <fieldset
    class="fieldset min-w-0 gap-2 rounded-box border border-base-300 p-4"
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
    <p class="text-xs text-base-content/70">
      {{
        Object.entries(question.anchors || {})
          .map(([score, label]) => `${score}: ${label}`)
          .join(" · ")
      }}
    </p>
    <label class="grid gap-1"
      ><span class="label">Rating</span
      ><select
        v-model="answer.score"
        class="select select-sm w-full sm:max-w-64"
        required
      >
        <option value="" disabled>Choose a rating</option>
        <option :value="null">Not enough evidence</option>
        <option v-for="score in 10" :key="score" :value="score">
          {{ score }} / 10
        </option>
      </select></label
    >
    <label class="grid gap-1"
      ><span class="label whitespace-normal"
        >Reason / evidence
        {{ answer.score === null ? "(required)" : "(optional)" }}</span
      ><textarea
        v-model="answer.reason"
        class="textarea textarea-sm min-h-20 w-full"
        :maxlength="maxLength"
        :required="answer.score === null"
        placeholder="Briefly explain using this game. Note any uncertainty."
      />
    </label>
  </fieldset>
</template>
