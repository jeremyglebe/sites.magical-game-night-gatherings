<script setup>
import { computed } from "vue";
const props = defineProps({ headings: { type: Array, default: () => [] } });
const groups = computed(() => {
  const result = [];
  for (const heading of props.headings) {
    if (heading.level === 3 && result.length)
      result.at(-1).children.push(heading);
    else result.push({ ...heading, children: [] });
  }
  return result;
});
</script>

<template>
  <nav aria-label="Article sections">
    <ul class="menu menu-sm w-full p-0">
      <li v-for="heading in groups" :key="heading.id">
        <a :href="`#${heading.id}`" class="min-w-0 whitespace-normal [overflow-wrap:anywhere]">{{ heading.text }}</a>
        <ul v-if="heading.children.length">
          <li v-for="child in heading.children" :key="child.id">
            <a :href="`#${child.id}`" class="min-w-0 whitespace-normal [overflow-wrap:anywhere]">{{ child.text }}</a>
          </li>
        </ul>
      </li>
    </ul>
  </nav>
</template>
