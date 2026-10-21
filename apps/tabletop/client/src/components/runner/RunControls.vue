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
</script>
<template>
  <span v-if="finished" class="text-xs text-base-content/60">Complete</span>
  <div v-else class="flex items-center gap-1" aria-label="Match controls">
    <button
      class="btn btn-sm btn-primary"
      :disabled="busy"
      @click="$emit('control', moving ? 'pause' : 'start')"
    >
      <component
        :is="moving ? Pause : Play"
        class="size-3.5"
        aria-hidden="true"
      />{{ moving ? "Pause" : run?.decisions ? "Resume" : "Start" }}
    </button>
    <button
      class="btn btn-sm btn-square btn-ghost"
      aria-label="Step"
      title="Run one decision"
      :disabled="busy || moving || finished"
      @click="$emit('control', 'step')"
    >
      <StepForward class="size-4" aria-hidden="true" />
    </button>
    <button
      class="btn btn-sm btn-square btn-ghost text-error"
      aria-label="Stop"
      title="Stop players"
      :disabled="busy || finished || run?.mode === 'stopped'"
      @click="$emit('control', 'stop')"
    >
      <Square class="size-4" aria-hidden="true" />
    </button>
  </div>
</template>
