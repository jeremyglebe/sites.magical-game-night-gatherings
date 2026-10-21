<script setup>
import { onMounted, ref } from "vue";
import {
  BookOpen,
  Search,
  Menu,
  X,
  Moon,
  Sun,
  Layers,
  Package,
  ScrollText,
  FlaskConical,
  Bookmark,
} from "@lucide/vue";
import HomePage from "./pages/HomePage.vue";
import ArticlePage from "./pages/ArticlePage.vue";
import CatalogueNavigation from "./components/CatalogueNavigation.vue";
import CatalogueSearch from "./components/CatalogueSearch.vue";
const props = defineProps({ page: Object, pages: Array, base: String });
const search = ref(null),
  navigation = ref(null),
  dark = ref(false),
  modifier = ref("Ctrl");
const links = [
  { text: "Formats", path: "formats/", icon: Layers },
  { text: "Boxed Sets", path: "boxed-sets/", icon: Package },
  { text: "Using the Rules", path: "rules/", icon: ScrollText },
  { text: "Research", path: "research/", icon: FlaskConical },
  { text: "Sources", path: "sources/", icon: Bookmark },
];
onMounted(() => {
  dark.value = document.documentElement.dataset.theme === "catalogue-dark";
  modifier.value = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
});
function toggleTheme() {
  dark.value = !dark.value;
  const name = dark.value ? "catalogue-dark" : "catalogue";
  document.documentElement.dataset.theme = name;
  try {
    localStorage.setItem("catalogue-theme", name);
  } catch {
    /* Theme still works when storage is unavailable. */
  }
}
</script>
<template>
  <a
    href="#main-content"
    class="sr-only fixed left-3 top-3 z-50 bg-base-100 p-3 focus:not-sr-only"
    >Skip to content</a
  >
  <header class="sticky top-0 z-20 border-b border-base-300 bg-base-100">
    <div class="navbar mx-auto min-h-16 max-w-[1600px] gap-3 px-4 sm:px-6">
      <button
        class="btn btn-sm btn-square btn-ghost lg:hidden"
        aria-label="Open navigation"
        @click="navigation.showModal()"
      >
        <Menu class="size-5" aria-hidden="true" />
      </button>
      <a
        :href="base"
        class="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
        ><BookOpen class="size-5 text-primary" aria-hidden="true" /><span
          >MTG Game Night</span
        ></a
      >
      <nav class="ml-6 hidden flex-1 lg:block" aria-label="Main navigation">
        <ul class="menu menu-horizontal menu-sm">
          <li v-for="link in links" :key="link.path">
            <a
              :href="base + link.path"
              :aria-current="
                page?.section === link.text ? 'location' : undefined
              "
              :class="
                page?.section === link.text ? 'text-primary font-semibold' : ''
              "
              >{{ link.text }}</a
            >
          </li>
        </ul>
      </nav>
      <div class="ml-auto flex items-center gap-1">
        <button
          class="btn btn-sm btn-ghost"
          aria-label="Search catalogue"
          @click="search.open()"
        >
          <Search class="size-4" aria-hidden="true" /><span
            class="hidden sm:inline"
            >Search</span
          ><kbd class="kbd kbd-xs ml-2 hidden xl:inline-flex"
            >{{ modifier }} K</kbd
          >
        </button>
        <button
          class="btn btn-sm btn-square btn-ghost"
          :aria-label="dark ? 'Use light theme' : 'Use dark theme'"
          :title="dark ? 'Use light theme' : 'Use dark theme'"
          @click="toggleTheme"
        >
          <component
            :is="dark ? Sun : Moon"
            class="size-4"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  </header>
  <main id="main-content" tabindex="-1" class="outline-none">
    <HomePage
      v-if="page?.path === '/'"
      :page="page"
      :pages="pages"
      :base="base"
    />
    <div
      v-else
      class="mx-auto grid max-w-[1600px] grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)]"
    >
      <aside class="hidden border-r border-base-300 lg:block">
        <div
          class="sticky top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto px-3 py-6"
        >
          <CatalogueNavigation :base="base" :page="page" />
        </div>
      </aside>
      <div class="min-w-0 px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
        <ArticlePage v-if="page" :page="page" :pages="pages" :base="base" />
        <section v-else class="max-w-xl py-10">
          <h1 class="text-3xl font-semibold">Page not found</h1>
          <p class="my-5 leading-relaxed">
            This address is not in the catalogue. Browse the format index or
            search for the rules you need.
          </p>
          <a :href="base + 'formats/'" class="btn btn-sm btn-primary"
            >Browse formats</a
          ><button class="btn btn-sm btn-ghost ml-2" @click="search.open()">
            Search catalogue
          </button>
        </section>
      </div>
    </div>
  </main>
  <footer class="border-t border-base-300">
    <div
      class="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-6 py-5 text-xs text-base-content/60"
    >
      <p>A fan-made catalogue. Personal play kits, not commercial products.</p>
      <a
        href="https://github.com/jeremyglebe/sites.magical-game-night-gatherings"
        class="link link-hover"
        >Project on GitHub</a
      >
    </div>
  </footer>
  <CatalogueSearch ref="search" :base="base" />
  <dialog
    ref="navigation"
    class="modal modal-start"
    aria-labelledby="navigation-title"
  >
    <div class="modal-box h-full max-h-full w-80 max-w-[90vw] rounded-none p-4">
      <div class="mb-4 flex items-center justify-between">
        <h2 id="navigation-title" class="font-semibold">Catalogue</h2>
        <button
          class="btn btn-sm btn-square btn-ghost"
          aria-label="Close navigation"
          @click="navigation.close()"
        >
          <X class="size-5" aria-hidden="true" />
        </button>
      </div>
      <ul class="menu w-full border-b border-base-300 pb-4">
        <li v-for="link in links" :key="link.path">
          <a :href="base + link.path"
            ><component :is="link.icon" class="size-4" aria-hidden="true" />{{
              link.text
            }}</a
          >
        </li>
      </ul>
      <CatalogueNavigation :base="base" :page="page" />
    </div>
    <form method="dialog" class="modal-backdrop">
      <button>Close navigation</button>
    </form>
  </dialog>
</template>
