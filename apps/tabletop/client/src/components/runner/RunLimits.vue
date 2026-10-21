<script setup>
import { ref, reactive } from "vue";
import { X } from "@lucide/vue";
const props = defineProps({ run: Object, request: Function });
const emit = defineEmits(["changed"]);
const modal = ref(null),
  busy = ref(false),
  error = ref(""),
  form = reactive({ maxDecisions: 2000, timeout: 120, output: "" });
function open() {
  Object.assign(form, {
    maxDecisions: props.run?.limits?.maxDecisions ?? 2000,
    timeout: Math.ceil((props.run?.limits?.decisionTimeoutMs ?? 120000) / 1000),
    output: props.run?.limits?.maxOutputTokens ?? "",
  });
  error.value = "";
  modal.value.showModal();
}
async function save() {
  busy.value = true;
  error.value = "";
  try {
    await props.request("/api/control", {
      action: "configure",
      limits: {
        maxDecisions: Number(form.maxDecisions),
        decisionTimeoutMs: Number(form.timeout) * 1000,
        maxOutputTokens: form.output === "" ? null : Number(form.output),
      },
    });
    emit("changed");
    modal.value.close();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
defineExpose({ open });
</script>
<template>
  <dialog ref="modal" class="modal" aria-labelledby="limits-title">
    <div class="modal-box">
      <div class="flex items-center justify-between gap-3">
        <h2 id="limits-title" class="text-lg font-semibold">Run limits</h2>
        <button
          class="btn btn-sm btn-ghost btn-square"
          aria-label="Close run limits"
          @click="modal.close()"
        >
          <X class="size-4" />
        </button>
      </div>
      <p class="my-4 text-sm text-base-content/70">
        Reaching a limit pauses the players. Saving limits does not start them.
      </p>
      <form class="grid gap-4" @submit.prevent="save">
        <label class="fieldset"
          >Maximum decisions<input
            v-model="form.maxDecisions"
            type="number"
            min="1"
            required
            class="input input-sm w-full"
        /></label>
        <label class="fieldset"
          >Seconds per decision<input
            v-model="form.timeout"
            type="number"
            min="1"
            required
            class="input input-sm w-full"
        /></label>
        <label class="fieldset"
          >Output-token limit (optional)<input
            v-model="form.output"
            type="number"
            min="1"
            class="input input-sm w-full"
        /></label>
        <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
        <button
          class="btn btn-sm btn-primary justify-self-end"
          :disabled="busy"
        >
          Save limits
        </button>
      </form>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button>Close run limits</button>
    </form>
  </dialog>
</template>
