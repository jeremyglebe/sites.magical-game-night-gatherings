<script setup>
import { ref } from "vue";
import { Gauge, RefreshCw } from "@lucide/vue";
const props = defineProps({ plan: Object, run: Object, request: Function, embedded: Boolean });
const emit = defineEmits(["changed"]);
const busy = ref(false),
  error = ref("");
const number = (v) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(v);
const valid = (v) => typeof v === "number" && Number.isFinite(v);
const remaining = (w) =>
  valid(w.usedPercent) ? Math.max(0, Math.min(100, 100 - w.usedPercent)) : null;
function time(v) {
  if (v === null || v === undefined) return null;
  const d = new Date(typeof v === "number" ? v * 1000 : v);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
}
function label(w) {
  const m = w.windowDurationMins;
  return m === 10080
    ? "Weekly"
    : m === 1440
      ? "Daily"
      : m && m % 60 === 0
        ? `${m / 60}-hour`
        : w.id || "Usage window";
}
async function refresh() {
  busy.value = true;
  error.value = "";
  try {
    await props.request("/api/usage/refresh", {});
    emit("changed");
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section
    class="min-w-0"
    :class="embedded ? '' : 'border-t border-base-300 pt-5'"
    :aria-labelledby="embedded ? undefined : 'usage-heading'"
    :aria-label="embedded ? 'Plan usage' : undefined"
  >
    <div class="mb-4 flex items-center" :class="embedded ? 'justify-end' : 'justify-between'">
      <h2 v-if="!embedded" id="usage-heading" class="flex items-center gap-2 font-semibold">
        <Gauge class="size-4" />Plan usage
      </h2>
      <button
        class="btn btn-sm btn-ghost"
        :disabled="busy || plan?.refreshing"
        @click="refresh"
      >
        <RefreshCw class="size-4" />{{ busy ? "Refreshing…" : "Refresh" }}
      </button>
    </div>
    <p v-if="!plan?.buckets?.length" class="text-sm text-base-content/65">
      Plan usage is not available yet.
    </p>
    <div class="grid gap-4 sm:grid-cols-2">
      <div v-for="bucket in plan?.buckets || []" :key="bucket.id">
        <h3 class="mb-2 font-medium">
          {{ bucket.name || bucket.id || "Codex" }}
        </h3>
        <div
          v-for="window in bucket.windows"
          :key="window.id"
          class="mb-3 text-xs"
        >
          <div class="flex justify-between">
            <span>{{ label(window) }}</span
            ><strong class="tabular-nums text-primary">{{
              remaining(window) === null
                ? "Unavailable"
                : `${number(remaining(window))}% left`
            }}</strong>
          </div>
          <progress
            v-if="remaining(window) !== null"
            class="progress my-1"
            :value="remaining(window)"
            max="100"
            :aria-label="`${label(window)} remaining`"
          ></progress>
          <p class="text-base-content/65">
            {{
              time(window.resetsAt)
                ? `Resets ${time(window.resetsAt)}`
                : "Reset time unavailable"
            }}
          </p>
          <p class="mt-1 text-base-content/65">
            {{
              valid(window.changeSinceBaseline)
                ? `${window.changeSinceBaseline === 0 ? "No measured change" : `${number(window.changeSinceBaseline)} percentage points used`} since ${time(window.baselineAt)}`
                : "Comparison unavailable for this window"
            }}
          </p>
        </div>
      </div>
    </div>
    <p v-if="error || plan?.error" role="alert" class="text-sm text-error">
      {{ error || plan.error }}
    </p>
    <p class="mt-3 text-xs text-base-content/60">
      {{
        time(plan?.checkedAt)
          ? `Checked ${time(plan.checkedAt)}`
          : "No account snapshot recorded."
      }}
    </p>
    <p class="mt-2 text-xs text-base-content/65">
      Account-wide usage, including other Codex activity. Changes are not this
      game’s cost.
    </p>
    <details class="mt-3">
      <summary class="cursor-pointer text-xs text-base-content/65">
        Technical token counts
      </summary>
      <dl class="mt-2 grid grid-cols-2 gap-1 text-xs">
        <template v-for="(count, key) in run?.usage || {}" :key="key"
          ><dt>{{ key.replaceAll("_", " ") }}</dt>
          <dd class="text-right tabular-nums">{{ number(count) }}</dd></template
        >
      </dl>
      <p class="mt-2 text-xs text-base-content/65">
        Tokens measure model traffic, not plan charges.
      </p>
    </details>
  </section>
</template>
