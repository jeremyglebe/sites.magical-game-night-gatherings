<script setup>
import { computed, reactive, ref } from 'vue';
import { ArrowRight, Box, Layers, RotateCcw } from '@lucide/vue';
import CatalogueProse from '../components/CatalogueProse.vue';
import StorageNumber from '../components/StorageNumber.vue';
import { BOX_PRESETS, calculateStorage, thicknessFromMeasurement } from '../components/card-storage.mjs';

defineProps({ page: Object, base: { type: String, default: '/' } });
const unit = ref('mm');
const view = ref('stack');
const count = ref(25);
const sleeving = ref('double');
const source = ref('gamegenic');
const condition = ref('compressed');
const range = reactive({ min: 0.68, max: 0.72 });
const card = reactive({ width: 66, height: 91 });
const measurements = reactive(Object.fromEntries(['single', 'double'].map(mode => [mode, {
  compressed: { count: 20, depth: '' }, uncompressed: { count: 20, depth: '' },
}])));
const measurement = computed(() => measurements[sleeving.value][condition.value]);
const material = reactive({ card: 0.30, outerFront: 0.12, outerBack: 0.12, innerFront: 0.06, innerBack: 0.06, air: 0 });
const presetId = ref('burger37');
const box = reactive({ ...BOX_PRESETS.find(p => p.id === presetId.value) });
const clearance = ref(0);
const padding = ref(0);
const extras = reactive({ count: 0, thicknessMin: 0.30, thicknessMax: 0.30 });
const profileNote = computed(() => ({
  gamegenic: 'Published practical benchmark: 100 cards with Gamegenic Inner + Matte Prime measured 68 mm. Compression state is unspecified.',
  dragonshield: 'Published practical benchmark: 100 cards with Dragon Shield Perfect Fit + Matte measured 72 mm. Compression state is unspecified.',
  measured: 'Measure your complete sleeved stack, including tracking stickers. Compressed and uncompressed measurements are kept separately for each sleeve setup.',
  custom: 'Your editable thickness range. Set both ends equal for a single measured value.',
  material: 'An estimate from material layers. The 0.30 mm card is an assumption; outer layers start at Dragon Shield’s stated 0.12 mm each. Texture, seams, stickers and air can add thickness.',
})[source.value]);
const thickness = computed(() => {
  if (source.value === 'gamegenic') return { min: 0.68, max: 0.68 };
  if (source.value === 'dragonshield') return { min: 0.72, max: 0.72 };
  if (source.value === 'custom') return { ...range };
  if (source.value === 'measured') {
    const value = thicknessFromMeasurement(measurement.value.count, measurement.value.depth);
    return { min: value, max: value };
  }
  const fields = [material.card, material.outerFront, material.outerBack, material.air];
  if (sleeving.value === 'double') fields.push(material.innerFront, material.innerBack);
  if (fields.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0) || material.card <= 0) return { min: null, max: null };
  const value = fields.reduce((sum, v) => sum + v, 0);
  return { min: value, max: value };
});
const input = computed(() => ({ count: count.value, thicknessMin: thickness.value.min, thicknessMax: thickness.value.max,
  cardWidth: card.width, cardHeight: card.height, box, clearance: clearance.value, padding: padding.value, extras }));
const result = computed(() => calculateStorage(input.value));
const comparisons = computed(() => BOX_PRESETS.map(preset => ({ preset, result: calculateStorage({ ...input.value, box: preset }) })));
const scenarios = computed(() => [20, 25].map(n => ({ count: n, results: BOX_PRESETS.map(preset => calculateStorage({ ...input.value, count: n, box: preset })) })));
const measurementScenarios = computed(() => ['compressed', 'uncompressed'].flatMap(state => [20, 25].map(n => {
  const sample = measurements[sleeving.value][state];
  const t = thicknessFromMeasurement(sample.count, sample.depth);
  return { state, count: n, thickness: t, result: calculateStorage({ ...input.value, count: n, thicknessMin: t, thicknessMax: t }) };
})));
const sourceLink = computed(() => source.value === 'material' ? 'https://www.dragonshield.com/en-eu/collections/standard-size-sleeves?page=1' : 'https://www.doublesleeved.co.uk/blogs/guides/the-ultimate-double-sleeving-guide');
const ratio = value => result.value.valid ? Math.max(0, Math.min(100, value / result.value.interior.depth * 100)) : 0;
const format = (value, digits = 2) => Number.isFinite(value) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value) : '—';
const dimension = value => format(unit.value === 'in' ? value / 25.4 : value, unit.value === 'in' ? 4 : 2);
function span(value, dimensions = false) {
  if (!value) return '—';
  const fn = dimensions ? dimension : format;
  return Math.abs(value.min - value.max) < 1e-9 ? fn(value.min) : `${fn(value.min)}–${fn(value.max)}`;
}
function chooseSleeving() {
  if (sleeving.value === 'single' && ['gamegenic', 'dragonshield'].includes(source.value)) source.value = 'measured';
}
function chooseBox() {
  const preset = BOX_PRESETS.find(p => p.id === presetId.value);
  if (preset) Object.assign(box, preset);
}
function editBox() { presetId.value = 'custom'; }
function reset() {
  unit.value = 'mm'; view.value = 'stack'; count.value = 25; sleeving.value = 'double'; source.value = 'gamegenic';
  condition.value = 'compressed'; range.min = 0.68; range.max = 0.72; card.width = 66; card.height = 91;
  presetId.value = 'burger37'; chooseBox(); clearance.value = 0; padding.value = 0;
  Object.assign(extras, { count: 0, thicknessMin: 0.30, thicknessMax: 0.30 });
  Object.assign(material, { card: 0.30, outerFront: 0.12, outerBack: 0.12, innerFront: 0.06, innerBack: 0.06, air: 0 });
  for (const mode of Object.values(measurements)) for (const sample of Object.values(mode)) Object.assign(sample, { count: 20, depth: '' });
}
</script>

<template>
  <div class="mx-auto min-w-0 max-w-6xl">
    <nav class="mb-6 text-sm text-base-content/60" aria-label="Breadcrumb"><a :href="base + 'research/'" class="link link-hover">Research</a><span class="mx-2">/</span>Card storage</nav>
    <div class="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div class="max-w-2xl"><p class="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-primary">The workbench</p><h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">{{ page.title }}</h1><p class="mt-3 text-base leading-7 text-base-content/70">Start with your cards or start with a box. Find the space a pack needs, see how many cards fit, and compare storage options.</p></div>
      <div class="flex items-center gap-2"><label class="sr-only" for="storage-units">Display units</label><select id="storage-units" class="select select-sm w-24" v-model="unit"><option value="mm">mm</option><option value="in">inches</option></select><button class="btn btn-sm btn-ghost" @click="reset"><RotateCcw class="size-4" aria-hidden="true" />Reset</button></div>
    </div>

    <div class="mb-7 flex flex-wrap gap-2" aria-label="Calculation focus">
      <button class="btn" :class="view === 'stack' ? 'btn-primary' : 'btn-outline'" :aria-pressed="view === 'stack'" @click="view = 'stack'"><Layers class="size-4" aria-hidden="true" />Size my stack</button>
      <button class="btn" :class="view === 'capacity' ? 'btn-primary' : 'btn-outline'" :aria-pressed="view === 'capacity'" @click="view = 'capacity'"><Box class="size-4" aria-hidden="true" />Fill a box</button>
      <a href="#compare-products" class="btn btn-ghost">Compare products<ArrowRight class="size-4" aria-hidden="true" /></a>
    </div>

    <section class="mb-8 overflow-hidden rounded-lg border border-base-300 bg-base-200" aria-label="Calculated result" aria-live="polite" aria-atomic="true">
      <div v-if="result.valid" class="grid gap-7 p-5 sm:p-7 md:grid-cols-[1fr_1.1fr]">
        <div><p class="text-sm font-medium text-base-content/65">{{ view === 'stack' ? 'Stack depth' : 'Depth capacity' }}</p><p class="mt-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl" data-testid="primary-result">{{ view === 'stack' ? span(result.stack, true) : span(result.capacity) }} <span class="text-xl font-normal text-base-content/60">{{ view === 'stack' ? unit : 'cards' }}</span></p><p class="mt-3 text-sm leading-6 text-base-content/65">{{ count }} {{ sleeving === 'double' ? 'double-sleeved' : 'single-sleeved' }} cards<span v-if="extras.count"> + {{ extras.count }} inserts</span> · {{ format(thickness.min, 4) }}<span v-if="thickness.min !== thickness.max">–{{ format(thickness.max, 4) }}</span> mm per card</p></div>
        <div class="self-center"><div class="mb-2 flex justify-between gap-4 text-sm"><span>{{ presetId === 'custom' ? 'Custom box' : box.label }}</span><span class="tabular-nums">{{ dimension(result.interior.depth) }} {{ unit }} inside</span></div>
          <div class="relative h-12 overflow-hidden rounded border border-base-content/20 bg-base-100" role="img" :aria-label="`Stack ${span(result.stack, true)} ${unit}; internal depth ${dimension(result.interior.depth)} ${unit}`"><div class="absolute inset-y-0 left-0 bg-primary/25" :style="{ width: ratio(result.stack.max) + '%' }"></div><div class="absolute inset-y-0 left-0 border-r-2 border-primary bg-primary/65" :style="{ width: ratio(result.stack.min) + '%' }"></div></div>
          <div class="mt-3 grid grid-cols-2 gap-4 text-sm"><p><span class="block text-base-content/60">{{ result.remainingDepth.min < 0 ? 'Space / overflow' : 'Space remaining' }}</span><strong class="font-semibold tabular-nums">{{ span(result.remainingDepth, true) }} {{ unit }}</strong></p><p><span class="block text-base-content/60">Additional cards</span><strong class="font-semibold tabular-nums">{{ span(result.extraCapacity) }}</strong></p></div>
        </div>
        <p v-if="!result.faceFits" class="border-t border-warning/40 pt-4 text-sm leading-6 md:col-span-2"><strong>Width or height does not fit.</strong> Your {{ dimension(card.width) }} × {{ dimension(card.height) }} {{ unit }} sleeve exceeds this box’s {{ dimension(result.interior.width) }} × {{ dimension(result.interior.height) }} {{ unit }} interior in both orientations. The card counts above describe depth capacity only.</p>
        <p v-else-if="result.fits === 'no'" class="text-sm text-error md:col-span-2">This stack exceeds the available depth. Negative remaining space shows the overflow.</p>
        <p v-else-if="result.fits === 'possible'" class="text-sm md:col-span-2">This pack fits at the thinner end of your range, but may exceed the box at the thicker end.</p>
      </div>
      <div v-else class="p-6"><p class="font-semibold">Complete the measurements to calculate.</p><p v-if="source === 'measured' && thickness.min === null" class="mt-2 text-sm text-base-content/70">Enter the depth of a known number of {{ condition }} cards below.</p><ul v-else class="mt-2 list-disc space-y-1 pl-5 text-sm text-base-content/70"><li v-for="error in result.errors" :key="error">{{ error }}</li></ul></div>
    </section>

    <div class="grid min-w-0 gap-6 xl:grid-cols-2">
      <section class="rounded-lg border border-base-300 p-5 sm:p-6" aria-labelledby="your-cards">
        <h2 id="your-cards" class="mb-5 flex items-center gap-2 text-xl font-semibold"><Layers class="size-5 text-primary" aria-hidden="true" />Your cards</h2>
        <div class="grid grid-cols-2 gap-4">
          <label><span class="mb-1.5 block text-sm font-medium">Card count</span><input class="input w-full tabular-nums" type="number" min="0" step="1" v-model.number="count" /></label>
          <label><span class="mb-1.5 block text-sm font-medium">Sleeving</span><select class="select w-full" v-model="sleeving" @change="chooseSleeving"><option value="single">Single sleeve</option><option value="double">Double sleeve</option></select></label>
        </div>
        <div class="my-3 flex gap-2"><button v-for="n in [20,25,60,100]" :key="n" class="btn btn-xs" :class="count === n ? 'btn-primary' : 'btn-ghost'" @click="count = n">{{ n }} cards</button></div>
        <label class="mt-5 block"><span class="mb-1.5 block text-sm font-medium">Thickness source</span><select class="select w-full" v-model="source"><option v-if="sleeving === 'double'" value="gamegenic">Published: Gamegenic double sleeve</option><option v-if="sleeving === 'double'" value="dragonshield">Published: Dragon Shield double sleeve</option><option value="measured">Measure my stack</option><option value="custom">Enter a thickness range</option><option value="material">Estimate from material layers</option></select></label>
        <p class="mt-2 text-sm leading-6 text-base-content/65">{{ profileNote }} <a v-if="['gamegenic','dragonshield','material'].includes(source)" :href="sourceLink" class="link text-primary" target="_blank" rel="noreferrer">Source</a></p>

        <div v-if="source === 'measured'" class="mt-5 rounded-md bg-base-200 p-4">
          <label class="block"><span class="mb-1.5 block text-sm font-medium">Stack condition</span><select class="select w-full bg-base-100" v-model="condition"><option value="compressed">Compressed</option><option value="uncompressed">Uncompressed / after play</option></select></label>
          <div class="mt-4 grid grid-cols-2 gap-3"><label><span class="mb-1.5 block text-sm font-medium">Measured card count</span><input type="number" min="1" step="1" class="input w-full bg-base-100" v-model.number="measurement.count" /></label><StorageNumber label="Measured stack depth" :unit="unit" v-model="measurement.depth" /></div>
          <p class="mt-3 text-xs leading-5 text-base-content/65">Measure a representative stack without the box. This saves a separate value for each sleeve setup and condition while this page is open.</p>
        </div>
        <div v-if="source === 'custom'" class="mt-5 grid grid-cols-2 gap-4"><StorageNumber label="Minimum per card" :unit="unit" v-model="range.min" /><StorageNumber label="Maximum per card" :unit="unit" v-model="range.max" /></div>
        <div v-if="source === 'material'" class="mt-5 grid grid-cols-2 gap-4">
          <StorageNumber label="Bare card" :unit="unit" v-model="material.card" /><StorageNumber label="Air / texture per card" :unit="unit" v-model="material.air" />
          <StorageNumber label="Outer front film" :unit="unit" v-model="material.outerFront" /><StorageNumber label="Outer back film" :unit="unit" v-model="material.outerBack" />
          <template v-if="sleeving === 'double'"><StorageNumber label="Inner front film" :unit="unit" v-model="material.innerFront" /><StorageNumber label="Inner back film" :unit="unit" v-model="material.innerBack" /></template>
          <p class="col-span-2 text-xs leading-5 text-base-content/65">Film values are per side. The initial 0.06 mm inner layers are a measured Dragon Shield Perfect Fit example. Zero air is a material-only estimate, not a verified compressed state.</p>
        </div>

        <details class="mt-6 border-t border-base-300 pt-4"><summary class="cursor-pointer text-sm font-semibold">Sleeve footprint and extra inserts</summary>
          <div class="mt-4 grid grid-cols-2 gap-4"><StorageNumber label="Sleeved card width" :unit="unit" v-model="card.width" /><StorageNumber label="Sleeved card height" :unit="unit" v-model="card.height" /></div><p class="mt-2 text-xs leading-5 text-base-content/60">Default: Gamegenic’s 66 × 91 mm outer sleeve. Enter your actual sleeve dimensions; the box can accept a 90° rotation.</p>
          <label class="mt-4 block"><span class="mb-1.5 block text-sm font-medium">Extra insert count</span><input class="input w-full" type="number" min="0" step="1" v-model.number="extras.count" /></label>
          <div v-if="extras.count > 0" class="mt-4 grid grid-cols-2 gap-4"><StorageNumber label="Insert minimum thickness" :unit="unit" v-model="extras.thicknessMin" /><StorageNumber label="Insert maximum thickness" :unit="unit" v-model="extras.thicknessMax" /><p class="col-span-2 text-xs leading-5 text-base-content/60">Count tokens, title cards and guides here only if they are not already included above. The initial 0.30 mm is an editable stock assumption. Inserts are assumed no wider or taller than your sleeved cards.</p></div>
        </details>
      </section>

      <section class="rounded-lg border border-base-300 p-5 sm:p-6" aria-labelledby="your-box">
        <h2 id="your-box" class="mb-5 flex items-center gap-2 text-xl font-semibold"><Box class="size-5 text-primary" aria-hidden="true" />Your box</h2>
        <label><span class="mb-1.5 block text-sm font-medium">Box preset</span><select class="select w-full" v-model="presetId" @change="chooseBox"><option v-for="preset in BOX_PRESETS" :key="preset.id" :value="preset.id">{{ preset.label }}</option><option value="custom">Custom dimensions</option></select></label>
        <p v-if="presetId !== 'custom'" class="mt-2 text-sm leading-6 text-base-content/65">{{ box.note }} <a :href="box.source" target="_blank" rel="noreferrer" class="link text-primary">Product source</a></p>
        <label class="mt-5 block"><span class="mb-1.5 block text-sm font-medium">These dimensions are</span><select class="select w-full" v-model="box.basis" @change="editBox"><option value="internal">Internal / usable space</option><option value="external">External / outside the box</option></select></label>
        <div class="mt-4 grid grid-cols-3 gap-3"><StorageNumber label="Width" :unit="unit" v-model="box.width" @update:model-value="editBox" /><StorageNumber label="Height" :unit="unit" v-model="box.height" @update:model-value="editBox" /><StorageNumber label="Depth" :unit="unit" v-model="box.depth" @update:model-value="editBox" /></div>
        <div v-if="box.basis === 'external'" class="mt-4"><StorageNumber label="Wall thickness" :unit="unit" v-model="box.wall" @update:model-value="editBox" /><p class="mt-2 text-xs leading-5 text-base-content/60">Subtracts two walls from each outside dimension. Hinges, taper and lid shape may reduce the real space further.</p></div>
        <div class="mt-6 grid grid-cols-2 gap-4 border-t border-base-300 pt-5"><StorageNumber label="Removal clearance" :unit="unit" v-model="clearance" /><StorageNumber label="Padding depth" :unit="unit" v-model="padding" /></div>
        <p class="mt-2 text-xs leading-5 text-base-content/60">Reserved depth is excluded from card capacity. Leave both at zero to see the theoretical maximum.</p>
        <dl v-if="result.valid" class="mt-6 space-y-3 rounded-md bg-base-200 p-4 text-sm"><div class="flex flex-wrap justify-between gap-2"><dt class="text-base-content/65">Inside width × height × depth</dt><dd class="font-medium tabular-nums">{{ dimension(result.interior.width) }} × {{ dimension(result.interior.height) }} × {{ dimension(result.interior.depth) }} {{ unit }}</dd></div><div class="flex justify-between gap-2"><dt class="text-base-content/65">Depth needed with reserves</dt><dd class="font-medium tabular-nums">{{ span(result.requiredDepth, true) }} {{ unit }}</dd></div></dl>
        <p class="mt-5 text-sm leading-6 text-base-content/65">For a box you have not bought yet, use the stack depth plus your chosen clearance as the minimum interior depth. Width and height must also accommodate the sleeves.</p>
      </section>
    </div>

    <section id="compare-products" class="mt-10 scroll-mt-24" aria-labelledby="compare-title">
      <h2 id="compare-title" class="text-2xl font-semibold">Compare the products</h2><p class="mb-4 mt-2 text-sm leading-6 text-base-content/65">Uses your current thickness, inserts, clearance and padding for every box. Capacity counts the main cards; inserts are reserved separately.</p>
      <div class="overflow-x-auto rounded-lg border border-base-300"><table class="table w-full"><thead><tr><th>Box</th><th>Inside depth</th><th>Card capacity</th><th>Space after this pack</th><th>Sleeve footprint</th></tr></thead><tbody><tr v-for="item in comparisons" :key="item.preset.id"><th class="font-medium"><button class="link link-hover text-left text-primary" @click="presetId = item.preset.id; chooseBox()">{{ item.preset.label }}</button></th><td class="whitespace-nowrap tabular-nums">{{ item.result.valid ? dimension(item.result.interior.depth) : '—' }} {{ unit }}</td><td class="whitespace-nowrap font-semibold tabular-nums">{{ span(item.result.capacity) }}</td><td class="whitespace-nowrap tabular-nums">{{ span(item.result.remainingDepth, true) }} {{ unit }}</td><td>{{ !item.result.valid ? 'Enter measurements' : item.result.faceFits ? 'Fits dimensions' : 'Too wide or tall' }}</td></tr></tbody></table></div>
      <div v-if="result.valid" class="mt-6 overflow-x-auto rounded-lg border border-base-300"><table class="table w-full"><caption class="p-4 text-left text-sm font-semibold">Space remaining for common packet sizes · current thickness</caption><thead><tr><th>Main cards</th><th v-for="preset in BOX_PRESETS" :key="preset.id">{{ preset.label }}</th></tr></thead><tbody><tr v-for="scenario in scenarios" :key="scenario.count"><th class="font-medium">{{ scenario.count }}<span v-if="extras.count"> + {{ extras.count }} inserts</span></th><td v-for="(value, index) in scenario.results" :key="index" class="tabular-nums">{{ span(value.remainingDepth, true) }} {{ unit }}</td></tr></tbody></table></div>
    </section>

    <section v-if="source === 'measured'" class="mt-8" aria-labelledby="condition-title"><h2 id="condition-title" class="text-xl font-semibold">Your four packet conditions</h2><p class="my-2 text-sm leading-6 text-base-content/65">{{ sleeving === 'double' ? 'Double' : 'Single' }} sleeves · selected box<span v-if="extras.count"> · {{ extras.count }} extra inserts in each case</span>. Enter both stack measurements above to compare all four cases.</p><div class="overflow-x-auto rounded-lg border border-base-300"><table class="table w-full"><thead><tr><th>Condition</th><th>Stack depth</th><th>Main-card capacity</th><th>Space remaining</th></tr></thead><tbody><tr v-for="row in measurementScenarios" :key="row.state + row.count"><th class="font-medium">{{ row.count }} {{ row.state }}</th><template v-if="row.result.valid"><td>{{ span(row.result.stack, true) }} {{ unit }}</td><td>{{ span(row.result.capacity) }} cards</td><td>{{ span(row.result.remainingDepth, true) }} {{ unit }}</td></template><td v-else colspan="3" class="text-base-content/55">Add a valid {{ row.state }} measurement.</td></tr></tbody></table></div></section>
    <div class="mt-10 max-w-[85ch] border-t border-base-300 pt-2"><CatalogueProse :html="page.html" /></div>
  </div>
</template>
