<script setup>
import { computed } from "vue";
import { ArrowRight, BookOpen, Box, Library, Search } from "@lucide/vue";
import CatalogueProse from "../components/CatalogueProse.vue";

const props = defineProps({
  page: { type: Object, required: true },
  pages: { type: Array, default: () => [] },
  base: { type: String, default: "/" },
});

// Descriptions follow the format-family index; playable rules stay in Markdown.
const families = [
  {
    slug: "archenemy",
    name: "Archenemy",
    description: "One villain against a team, with an extra scheme deck.",
  },
  {
    slug: "assassin",
    name: "Assassin",
    description: "Secret player-to-player targets.",
  },
  {
    slug: "bang-like",
    name: "BANG-like hidden roles",
    description: "Bluffing, hidden allies, and competing victory conditions.",
  },
  {
    slug: "big-deck",
    name: "Big Deck",
    description: "A communal library and unexpected card combinations.",
  },
  {
    slug: "creature-feature",
    name: "Creature Feature",
    description: "Constructed decks built around a shared creature type.",
  },
  {
    slug: "cube",
    name: "Cube",
    description: "Drafting a reusable, curated card pool.",
  },
  {
    slug: "horde",
    name: "Horde",
    description: "Cooperative games against an automated enemy deck.",
  },
  {
    slug: "jumpstart",
    name: "Jumpstart",
    description: "Combine two prepared themed packets for a quick game.",
  },
];
const hero = computed(() => props.page.frontmatter?.hero || {});
const features = computed(() => props.page.frontmatter?.features || []);
const featureIcons = [BookOpen, Box, Search, Library];
function href(path) {
  return `${props.base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
    <header
      class="grid gap-6 border-b border-base-300 pb-8 lg:grid-cols-[1.35fr_1fr] lg:items-end"
    >
      <h1
        class="max-w-xl text-4xl leading-[1.08] font-semibold tracking-tight sm:text-5xl"
      >
        {{ hero.text || "Find your next way to play." }}
      </h1>
      <div>
        <p class="max-w-md text-base leading-relaxed text-base-content/75">
          {{
            hero.tagline ||
            "Format rules, distinct house variants, and personal boxed sets for the table."
          }}
        </p>
        <div class="mt-5 flex flex-wrap gap-3">
          <a
            v-for="(action, index) in hero.actions || []"
            :key="action.link"
            :href="href(action.link)"
            class="btn btn-sm"
            :class="index === 0 ? 'btn-primary' : 'btn-ghost'"
          >
            {{ action.text }}<ArrowRight class="size-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </header>

    <div class="grid gap-10 py-8 lg:grid-cols-[1.7fr_1fr] lg:gap-12">
      <section aria-labelledby="format-families">
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="format-families" class="text-xl font-semibold tracking-tight">
            Format families
          </h2>
          <a :href="href('/formats/')" class="link text-sm">Compare formats</a>
        </div>
        <ul class="list">
          <li
            v-for="(family, index) in families"
            :key="family.slug"
            class="border-b border-base-300"
          >
            <a
              :href="href(`/formats/${family.slug}/`)"
              class="group grid grid-cols-[1.75rem_minmax(0,1fr)_1.25rem] items-center gap-3 rounded-sm py-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              <span
                class="self-start pt-0.5 font-mono text-xs tabular-nums text-base-content/50"
                aria-hidden="true"
                >{{ String(index + 1).padStart(2, "0") }}</span
              >
              <span class="min-w-0">
                <span class="block font-semibold group-hover:underline">{{
                  family.name
                }}</span>
                <span
                  class="mt-1 block text-sm leading-relaxed text-base-content/70"
                  >{{ family.description }}</span
                >
              </span>
              <ArrowRight
                class="size-4 text-base-content/55"
                aria-hidden="true"
              />
            </a>
          </li>
        </ul>
      </section>

      <aside
        aria-label="Explore the catalogue"
        class="border-t border-base-300 pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8"
      >
        <h2 class="mb-5 text-xl font-semibold tracking-tight">
          In the catalogue
        </h2>
        <div class="space-y-7">
          <section v-for="(feature, index) in features" :key="feature.link">
            <h3 class="flex items-center gap-2 font-semibold">
              <component
                :is="featureIcons[index] || BookOpen"
                class="size-4 shrink-0 text-base-content/65"
                aria-hidden="true"
              />
              <a :href="href(feature.link)" class="link link-hover">{{
                feature.title
              }}</a>
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-base-content/70">
              {{ feature.details }}
            </p>
          </section>
        </div>
      </aside>
    </div>

    <CatalogueProse
      class="max-w-3xl border-t border-base-300 pt-8"
      aria-label="Using this catalogue"
      :html="page.html"
    />
  </div>
</template>
