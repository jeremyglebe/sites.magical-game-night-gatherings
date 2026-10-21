<script setup>
import { computed } from 'vue';
const props = defineProps({ modelValue: [Number, String], label: String, unit: { type: String, default: 'mm' }, min: { type: Number, default: 0 } });
const emit = defineEmits(['update:modelValue']);
const factor = computed(() => props.unit === 'in' ? 25.4 : 1);
const display = computed(() => typeof props.modelValue === 'number' && Number.isFinite(props.modelValue) ? Number((props.modelValue / factor.value).toFixed(7)) : '');
function update(event) {
  const value = event.target.value;
  emit('update:modelValue', value === '' ? '' : Number(value) * factor.value);
}
</script>
<template>
  <label class="block min-w-0">
    <span class="mb-1.5 block text-sm font-medium">{{ label }} <span class="font-normal text-base-content/55">({{ unit }})</span></span>
    <input class="input w-full bg-base-100 tabular-nums" type="number" step="any" :min="min" :value="display" @input="update" />
  </label>
</template>
