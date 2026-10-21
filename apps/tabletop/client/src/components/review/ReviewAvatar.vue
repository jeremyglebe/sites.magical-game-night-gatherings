<script setup>
import { computed, ref, watch } from "vue";
import { avatarURL } from "./review-format.js";
const props = defineProps({
  player: { type: Object, default: () => ({}) },
  seat: { type: Number, default: 0 },
});
const failed = ref(false),
  source = computed(() => avatarURL(props.player));
watch(source, () => {
  failed.value = false;
});
</script>
<template>
  <span
    class="avatar shrink-0"
    :class="{ 'avatar-placeholder': !source || failed }"
    aria-hidden="true"
  >
    <span
      class="flex size-9 items-center justify-center overflow-hidden rounded-full bg-base-300 text-base-content"
    >
      <img
        v-if="source && !failed"
        :src="source"
        alt=""
        width="36"
        height="36"
        class="h-full w-full object-cover"
        loading="lazy"
        @error="failed = true"
      />
      <span v-else class="text-xs tabular-nums">{{
        seat >= 0 ? seat + 1 : "•"
      }}</span>
    </span>
  </span>
</template>
