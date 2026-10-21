<script setup>
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import { Layers, History } from "@lucide/vue";
import { request } from "./lib/api.js";
const liveTableUrl = ref("/");
const route = useRoute();
onMounted(async () => {
  try {
    liveTableUrl.value = (await request("/api/ui")).liveTableUrl || "/";
  } catch {
    /* Development and legacy server default to the live table. */
  }
});
</script>
<template>
  <header
    v-if="route.name !== 'table'"
    class="navbar min-h-12 border-b border-base-300 bg-base-100 px-4"
  >
    <div class="flex flex-1 items-center gap-3">
      <Layers class="size-7 text-primary" aria-hidden="true" />
      <div>
        <a :href="liveTableUrl" class="font-semibold tracking-tight"
          >Game Night</a
        >
      </div>
    </div>
    <nav aria-label="Tabletop navigation" class="flex gap-1">
      <a :href="liveTableUrl" class="btn btn-sm btn-ghost"
        ><Layers class="size-4" aria-hidden="true" />Table</a
      >
      <RouterLink to="/games" class="btn btn-sm btn-ghost"
        ><History class="size-4" aria-hidden="true" />Saved games</RouterLink
      >
    </nav>
  </header>
  <RouterView />
</template>
