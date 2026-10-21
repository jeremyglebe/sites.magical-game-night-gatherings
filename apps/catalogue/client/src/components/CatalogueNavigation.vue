<script setup>
import { navigation, href } from "../navigation.js";
defineProps({ page: Object, base: String });
const canonical = (path) =>
  path.endsWith("/") || path.endsWith(".html") ? path : path + ".html";
</script>
<template>
  <nav aria-label="Catalogue navigation">
    <ul class="menu menu-sm w-full">
      <li v-for="group in navigation" :key="group.text">
        <details
          :open="
            group.items.some((item) => canonical(item.link) === page?.path) ||
            group.text === 'Start'
          "
        >
          <summary class="font-semibold">{{ group.text }}</summary>
          <ul>
            <li v-for="item in group.items" :key="item.link">
              <a
                :href="href(base, item.link)"
                :class="
                  canonical(item.link) === page?.path ? 'menu-active' : ''
                "
                :aria-current="
                  canonical(item.link) === page?.path ? 'page' : undefined
                "
                >{{ item.text }}</a
              >
            </li>
          </ul>
        </details>
      </li>
    </ul>
  </nav>
</template>
