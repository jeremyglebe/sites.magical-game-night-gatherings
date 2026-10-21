<script setup>
import { ref, watch } from 'vue';
import { ImageOff } from '@lucide/vue';
const props = defineProps({ src: String, name: String, typeLine: String, eager: Boolean });
const failed = ref(false);
watch(() => props.src, () => { failed.value = false; });
</script>

<template>
  <span class="relative block aspect-[63/88] w-full overflow-hidden rounded-lg bg-base-200">
    <img v-if="src && !failed" :src="src" :alt="name" width="488" height="680" :loading="eager ? 'eager' : 'lazy'" decoding="async" class="h-full w-full object-contain" @error="failed = true" />
    <span v-else class="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
      <ImageOff class="size-7 text-base-content/50" aria-hidden="true" />
      <span class="font-semibold">{{ name }}</span>
      <span class="text-xs text-base-content/70">{{ typeLine }}</span>
      <span class="text-xs text-base-content/60">Image unavailable</span>
    </span>
  </span>
</template>
