<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { Search, X, ArrowRight, BookOpen } from "@lucide/vue";
import { searchPages } from "./search.mjs";
const props = defineProps({ base: String });
const dialog = ref(null),
  field = ref(null),
  query = ref(""),
  section = ref(""),
  pages = ref([]),
  loading = ref(false),
  error = ref("");
const results = computed(() =>
  searchPages(pages.value, query.value, section.value),
);
const shown = ref(20);
watch([query, section], () => (shown.value = 20));
async function load() {
  if (pages.value.length || loading.value) return;
  loading.value = true;
  error.value = "";
  try {
    const response = await fetch(props.base + "search-index.json");
    if (!response.ok) throw new Error();
    pages.value = await response.json();
  } catch {
    error.value =
      "The search index could not be loaded. You can still browse the catalogue.";
  } finally {
    loading.value = false;
  }
}
async function open() {
  dialog.value.showModal();
  await nextTick();
  field.value.focus();
  load();
}
function shortcut(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    open();
  }
}
onMounted(() => window.addEventListener("keydown", shortcut));
onBeforeUnmount(() => window.removeEventListener("keydown", shortcut));
defineExpose({ open });
</script>
<template>
  <dialog
    ref="dialog"
    class="modal modal-top sm:modal-middle"
    aria-labelledby="search-title"
  >
    <div class="modal-box max-w-2xl border border-base-300 p-5 sm:p-6">
      <div class="mb-4 flex items-center justify-between gap-3">
        <h2 id="search-title" class="text-xl font-semibold">
          Search the catalogue
        </h2>
        <button
          class="btn btn-sm btn-square btn-ghost"
          aria-label="Close search"
          @click="dialog.close()"
        >
          <X class="size-5" aria-hidden="true" />
        </button>
      </div>
      <label class="input input-sm flex w-full items-center gap-2"
        ><Search class="size-4" aria-hidden="true" /><input
          ref="field"
          v-model="query"
          type="search"
          aria-label="Search rules, formats and research"
          placeholder="Search rules, formats and research…"
      /></label>
      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label class="flex items-center gap-2 text-sm"
          >In
          <select
            v-model="section"
            class="select select-sm w-auto"
            aria-label="Search section"
          >
            <option value="">All sections</option>
            <option
              v-for="name in [
                'Formats',
                'Boxed Sets',
                'Using the Rules',
                'Research',
                'Sources',
              ]"
              :key="name"
            >
              {{ name }}
            </option>
          </select></label
        >
        <p
          v-if="query.trim() && !loading && !error"
          class="text-sm text-base-content/65"
          role="status"
        >
          {{ results.length }} results
        </p>
      </div>
      <div class="mt-5 max-h-[55dvh] overflow-y-auto">
        <p v-if="loading" class="py-5" role="status">Loading search…</p>
        <div v-else-if="error" class="alert alert-soft" role="alert">
          <p>{{ error }}</p>
          <button class="btn btn-sm" @click="load">Retry</button>
        </div>
        <p v-else-if="!query.trim()" class="py-5 text-sm text-base-content/70">
          Try “Horde”, “victory”, or a card name. Search covers the full rules
          and reference notes.
        </p>
        <p v-else-if="!results.length" class="py-5 text-sm">
          No matches for “{{ query }}”. Try fewer words or another section.
        </p>
        <ul v-else class="list">
          <li
            v-for="result in results.slice(0, shown)"
            :key="result.path"
            class="border-t border-base-300"
          >
            <a
              :href="
                base +
                result.path.slice(1) +
                (result.anchor ? '#' + result.anchor : '')
              "
              class="block rounded-sm p-3 hover:bg-base-200 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span
                class="mb-1 flex items-center gap-2 text-xs text-base-content/60"
                ><BookOpen class="size-3.5" aria-hidden="true" />{{
                  result.section
                }}</span
              >
              <span
                class="flex items-center justify-between gap-3 font-semibold"
                >{{ result.title
                }}<ArrowRight class="size-4 shrink-0" aria-hidden="true"
              /></span>
              <span
                class="mt-1 block text-sm leading-relaxed text-base-content/75"
                >{{ result.snippet }}</span
              >
            </a>
          </li>
        </ul>
        <button
          v-if="results.length > shown"
          class="btn btn-sm mt-4"
          @click="shown += 20"
        >
          Show more results
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button>Close search</button>
    </form>
  </dialog>
</template>
