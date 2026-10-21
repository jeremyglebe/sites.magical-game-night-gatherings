<script setup>
import { Sparkle } from "@lucide/vue";
</script>
<template>
  <span
    role="img"
    aria-label="Concealed card"
    class="relative inline-block aspect-[5/7] min-h-0 min-w-0 shrink-0 overflow-hidden rounded border border-primary/50 bg-base-300 text-primary"
  >
    <span
      class="absolute inset-[12%] grid place-items-center rounded-sm border border-primary/30"
      aria-hidden="true"
      ><Sparkle class="h-3/4 w-3/4 fill-current" /></span
    >
  </span>
</template>
