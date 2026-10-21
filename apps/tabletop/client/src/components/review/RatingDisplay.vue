<script setup>
import { computed } from "vue";

const props = defineProps({
  score: { type: Number, default: null },
  label: { type: String, default: "Rating" },
  neutral: Boolean,
  showValue: { type: Boolean, default: true },
  emptyLabel: { type: String, default: "Not enough evidence" },
});
const rated = computed(() => Number.isFinite(props.score) && props.score >= 1 && props.score <= 10);
const halfStep = computed(() => Math.round(props.score * 2));
const visualDescription = computed(() => `${props.label}: ${props.score}/10${props.score * 2 !== halfStep.value ? " · visual rounded to the nearest half-point" : ""}`);
</script>

<template>
  <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
    <div
      v-if="rated"
      class="rating rating-xs rating-half shrink-0 cursor-default"
      aria-hidden="true"
      :title="visualDescription"
    >
      <span
        v-for="half in 20"
        :key="half"
        class="mask bg-primary motion-reduce:animate-none"
        :class="[
          neutral ? 'mask-circle' : 'mask-star-2',
          half % 2 ? 'mask-half-1' : 'mask-half-2',
        ]"
        :aria-current="half === halfStep ? 'true' : undefined"
      />
    </div>
    <strong v-if="showValue" class="text-sm tabular-nums">{{ rated ? `${score}/10` : emptyLabel }}</strong>
  </div>
</template>
