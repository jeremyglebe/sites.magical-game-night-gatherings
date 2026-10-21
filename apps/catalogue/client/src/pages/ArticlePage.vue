<script setup>
import { computed } from "vue";
import { ArrowLeft, ArrowUp, FileText, List } from "@lucide/vue";
import ArticleOutline from "../components/ArticleOutline.vue";
import CatalogueProse from "../components/CatalogueProse.vue";

const props = defineProps({
  page: { type: Object, required: true },
  pages: { type: Array, default: () => [] },
  base: { type: String, default: "/" },
});
const href = (path) => `${props.base.replace(/\/$/, "")}${path}`;
const ancestors = computed(() => {
  const segments = props.page.path.split("/").filter(Boolean);
  const result = [];
  for (let length = 1; length < segments.length; length++) {
    const prefix = `/${segments.slice(0, length).join("/")}`;
    const parent = props.pages.find(
      (page) => page.path === `${prefix}/` || page.path === `${prefix}.html`,
    );
    if (parent && parent.path !== props.page.path) result.push(parent);
  }
  return result;
});
const parent = computed(() => ancestors.value.at(-1));
const headings = computed(() =>
  (props.page.headings || []).filter(({ level }) => level === 2 || level === 3),
);
const sourceUrl = computed(() =>
  props.page.source
    ? `https://github.com/jeremyglebe/sites.magical-game-night-gatherings/blob/main/${props.page.source.split("/").map(encodeURIComponent).join("/")}`
    : "",
);
</script>

<template>
  <div
    class="grid min-w-0 grid-cols-1 gap-x-10 xl:grid-cols-[minmax(0,1fr)_13rem]"
  >
    <div class="min-w-0">
      <nav
        class="breadcrumbs mb-5 text-sm text-base-content/65"
        aria-label="Breadcrumb"
      >
        <ul>
          <li><a :href="href('/')">Home</a></li>
          <li v-for="ancestor in ancestors" :key="ancestor.path">
            <a :href="href(ancestor.path)">{{ ancestor.title }}</a>
          </li>
        </ul>
      </nav>

      <details
        v-if="headings.length"
        class="collapse collapse-arrow mb-6 rounded-none border-y border-base-300 xl:hidden"
      >
        <summary
          class="collapse-title flex min-h-12 items-center gap-2 py-3 text-sm font-medium"
        >
          <List class="size-4" aria-hidden="true" />On this page
        </summary>
        <div class="collapse-content">
          <ArticleOutline :headings="headings" />
        </div>
      </details>

      <!-- The compiler owns the complete Markdown body; this view never truncates it. -->
      <article id="article-top" class="min-w-0 max-w-[78ch] scroll-mt-24">
        <CatalogueProse :html="page.html" />
      </article>

      <footer
        class="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-base-300 pt-5 text-sm"
      >
        <a
          v-if="parent"
          :href="href(parent.path)"
          class="link link-hover inline-flex items-center gap-2"
        >
          <ArrowLeft class="size-4 shrink-0" aria-hidden="true" />{{
            parent.title
          }}
        </a>
        <a
          v-else
          :href="href('/')"
          class="link link-hover inline-flex items-center gap-2"
        >
          <ArrowLeft class="size-4" aria-hidden="true" />Catalogue home
        </a>
        <a
          v-if="sourceUrl"
          :href="sourceUrl"
          class="link link-hover inline-flex items-center gap-2 text-base-content/65"
        >
          <FileText class="size-4" aria-hidden="true" />Markdown source
        </a>
      </footer>
    </div>

    <aside
      v-if="headings.length"
      class="hidden min-w-0 xl:block"
      aria-label="Page contents"
    >
      <div
        class="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto border-l border-base-300 pl-5"
      >
        <h2 class="mb-3 flex items-center gap-2 text-sm font-semibold">
          <List class="size-4" aria-hidden="true" />On this page
        </h2>
        <ArticleOutline :headings="headings" />
        <a
          href="#article-top"
          class="link link-hover mt-5 inline-flex items-center gap-2 text-xs text-base-content/65"
        >
          <ArrowUp class="size-3.5" aria-hidden="true" />Back to top
        </a>
      </div>
    </aside>
  </div>
</template>
