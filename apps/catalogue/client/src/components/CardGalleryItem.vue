<script setup>
import CardImage from './CardImage.vue';
import { cardImage } from './card-gallery.mjs';

defineProps({ card: { type: Object, required: true }, interactive: Boolean, eager: Boolean });
const emit = defineEmits(['select']);

function tilt(event) {
  if (event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches) return;
  // Measure the stationary wrapper so the tilted image cannot move its own hit area.
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
  const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
  event.currentTarget.style.setProperty('--card-rotate-x', `${-y * 7}deg`);
  event.currentTarget.style.setProperty('--card-rotate-y', `${x * 7}deg`);
}

function reset(event) {
  event.currentTarget.style.removeProperty('--card-rotate-x');
  event.currentTarget.style.removeProperty('--card-rotate-y');
}
</script>

<template>
  <div class="gallery-card" @pointermove="tilt" @pointerleave="reset" @pointercancel="reset" @focusout="reset">
    <component :is="interactive ? 'button' : 'div'" :type="interactive ? 'button' : undefined"
      class="gallery-card-trigger block w-full rounded-lg" :class="interactive ? 'cursor-pointer' : ''"
      :aria-label="interactive ? 'Inspect ' + card.name : undefined"
      @click="interactive && emit('select', card)">
      <span class="gallery-card-surface block rounded-lg">
        <CardImage :src="cardImage(card)" :name="card.name" :type-line="card.type_line" :eager="eager" />
      </span>
    </component>
  </div>
</template>

<style scoped>
.gallery-card {
  position: relative;
  perspective: 900px;
}
.gallery-card-trigger {
  outline-offset: 5px;
}
.gallery-card-trigger:focus-visible {
  outline: 2px solid var(--color-primary);
}
.gallery-card-surface {
  box-shadow: 0 2px 5px #0002;
  transition: transform 250ms ease, box-shadow 250ms ease;
}
.gallery-card:focus-within {
  z-index: 1;
}
@media (hover: hover) and (pointer: fine) {
  .gallery-card:hover {
    z-index: 1;
  }
  .gallery-card:hover .gallery-card-surface {
    transform: translateY(-5px) rotateX(var(--card-rotate-x, 0deg)) rotateY(var(--card-rotate-y, 0deg)) scale(1.025);
    box-shadow: 0 14px 24px #0004;
    transition-duration: 100ms;
  }
}
@media (prefers-reduced-motion: reduce) {
  .gallery-card .gallery-card-surface,
  .gallery-card:hover .gallery-card-surface {
    transform: none;
    transition: none;
  }
}
</style>
