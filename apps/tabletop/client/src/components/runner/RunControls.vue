<script setup>
import { computed } from "vue";
import { Play, Pause, StepForward, Square } from "@lucide/vue";
const props = defineProps({ run: Object, busy: Boolean });
defineEmits(["control"]);
const moving = computed(() =>
  ["running", "stepping"].includes(props.run?.mode),
);
const finished = computed(
  () => props.run?.state === "finished" || props.run?.mode === "finished",
);
const playbackLabel = computed(() => moving.value ? "Pause" : props.run?.decisions ? "Resume" : "Start");
</script>
<template>
  <span v-if="finished" class="text-xs text-base-content/60">Complete</span>
  <div v-else class="flex items-center gap-1" aria-label="Match controls">
    <div class="tooltip tooltip-bottom tooltip-start inline-flex" :data-tip="`${playbackLabel} players`">
    <button
      class="btn btn-sm btn-square btn-primary"
      :aria-label="playbackLabel"
      :disabled="busy"
      @click="$emit('control', moving ? 'pause' : 'start')"
    >
      <component
        :is="moving ? Pause : Play"
        class="size-4"
        aria-hidden="true"
      />
    </button>
    </div>
    <div class="tooltip tooltip-bottom tooltip-start inline-flex" data-tip="Run one decision">
    <button
      class="btn btn-sm btn-square btn-ghost"
      aria-label="Step"
      :disabled="busy || moving || finished"
      @click="$emit('control', 'step')"
    >
      <StepForward class="size-4" aria-hidden="true" />
    </button>
    </div>
    <div class="tooltip tooltip-bottom tooltip-start inline-flex" data-tip="Stop players">
    <button
      class="btn btn-sm btn-square btn-ghost text-error"
      aria-label="Stop"
      :disabled="busy || finished || run?.mode === 'stopped'"
      @click="$emit('control', 'stop')"
    >
      <Square class="size-4" aria-hidden="true" />
    </button>
    </div>
  </div>
</template>
