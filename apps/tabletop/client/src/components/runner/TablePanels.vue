<script setup>
import { computed, nextTick, ref, useId, watch } from "vue";
import { X, Users, Gauge, ClipboardList, Settings2 } from "@lucide/vue";
import PlayersPanel from "./PlayersPanel.vue";
import PlanUsage from "./PlanUsage.vue";
import SurveyPanel from "../survey/SurveyPanel.vue";

const props = defineProps({ app: Object, table: Object, busy: Boolean, request: Function });
const emit = defineEmits(["limits", "wake", "changed"]);
const dialog = ref(null);
const active = ref(null);
const titleId = useId();
const panels = {
  players: { title: "Players", icon: Users },
  usage: { title: "Plan usage", icon: Gauge },
  feedback: { title: "Player feedback", icon: ClipboardList },
};
const panel = computed(() => panels[active.value]);
const runState = computed(() =>
  String(props.app?.coordinator?.state || props.app?.coordinator?.mode || "idle")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/^./, (letter) => letter.toUpperCase()),
);

async function open(name) {
  if (!Object.hasOwn(panels, name)) return;
  active.value = name;
  await nextTick();
  if (active.value === name && !dialog.value?.open) dialog.value?.showModal();
}
function reset() {
  active.value = null;
}
function close() {
  dialog.value?.close();
  reset();
}
function openLimits() {
  close();
  emit("limits");
}
watch(() => props.app?.match?.id, close);
defineExpose({ open, close });
</script>

<template>
  <dialog ref="dialog" class="modal" :aria-labelledby="titleId" @close="reset">
    <div class="modal-box flex max-h-[calc(100dvh-2rem)] w-11/12 flex-col overflow-hidden p-0" :class="active === 'players' ? 'max-w-md' : 'max-w-3xl'">
      <header class="relative z-10 flex shrink-0 items-center justify-between gap-2 border-b border-base-300 px-4 py-3">
        <div class="flex min-w-0 items-center gap-2">
          <h2 :id="titleId" class="flex min-w-0 items-center gap-2 text-lg font-semibold">
            <component :is="panel.icon" v-if="panel" class="size-5 shrink-0" aria-hidden="true" />
            <span class="min-w-0 break-words">{{ panel?.title || "Table panel" }}</span>
          </h2>
          <span v-if="active === 'players'" class="badge badge-sm shrink-0" :aria-label="`Coordinator: ${runState}`">{{ runState }}</span>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <div v-if="active === 'players'" class="tooltip tooltip-bottom" data-tip="Run limits">
            <button type="button" class="btn btn-sm btn-ghost btn-square" aria-label="Run limits" :disabled="busy" @click="openLimits">
              <Settings2 class="size-4" aria-hidden="true" />
            </button>
          </div>
          <button type="button" class="btn btn-sm btn-ghost btn-square" :aria-label="`Close ${panel?.title?.toLowerCase() || 'table panel'}`" @click="close">
            <X class="size-4" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div class="min-h-0 overflow-y-auto overscroll-contain p-4">
        <PlayersPanel
          v-if="active === 'players'"
          :app="app"
          :table="table"
          :busy="busy"
          embedded
          @wake="emit('wake', $event)"
        />
        <PlanUsage
          v-else-if="active === 'usage'"
          :plan="app?.planUsage"
          :run="app?.coordinator"
          :request="request"
          embedded
          @changed="emit('changed')"
        />
        <template v-else-if="active === 'feedback'">
          <SurveyPanel v-if="app?.postgame" :app="app" :request="request" @changed="emit('changed')" />
          <p v-else class="text-sm text-base-content/70">Player feedback will be available when the match ends.</p>
        </template>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button>Close table panel</button>
    </form>
  </dialog>
</template>
