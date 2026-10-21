<script setup>
import { computed, reactive, ref, watch } from "vue";
import { Plus, Upload, X } from "@lucide/vue";
import PlayerSetup from "./PlayerSetup.vue";

const props = defineProps({ app: Object, busy: Boolean });
const emit = defineEmits(["create", "cancel"]);
const presets = computed(() =>
  props.app?.presets?.length
    ? props.app.presets
    : [
        { id: "white", name: "Game Night 2018 · White" },
        { id: "green", name: "Game Night 2018 · Green" },
      ],
);
const form = reactive({
  title: "Game Night playtest",
  layout: "table",
  references: "",
  maxDecisions: 2000,
  timeoutSeconds: 120,
  maxOutputTokens: "",
  shuffle: true,
});
const players = ref([]);
const error = ref("");
const importText = ref("");
const importDialog = ref(null);
const fileInput = ref(null);
let sequence = 0;
let imported = {};
function addPlayer() {
  if (players.value.length >= 6) return;
  const defaults = props.app?.defaults || {};
  sequence++;
  players.value.push({
    id: `p${sequence}`,
    name: `Player ${sequence}`,
    ai: true,
    life: 20,
    deckChoice: presets.value[players.value.length % presets.value.length].id,
    deckJSON: "",
    model: defaults.model || "gpt-6-luna",
    reasoning: defaults.reasoning || "high",
  });
}
addPlayer();
addPlayer();
function removePlayer(index) {
  players.value.splice(index, 1);
  if (players.value.length !== 6) form.layout = "table";
}
watch(
  () => form.layout,
  (value) => {
    if (value === "emperor") while (players.value.length < 6) addPlayer();
  },
);
function importSetup(payload) {
  if (!payload || !Array.isArray(payload.players) || !payload.players.length)
    throw Error("The setup needs at least one player.");
  imported = payload;
  form.title = payload.title || "Game Night playtest";
  form.layout = payload.layout === "emperor" ? "emperor" : "table";
  form.references = (payload.references || []).join("\n");
  form.shuffle = payload.shuffle !== false;
  form.maxDecisions = payload.limits?.maxDecisions || 2000;
  form.timeoutSeconds = (payload.limits?.decisionTimeoutMs || 120000) / 1000;
  form.maxOutputTokens = payload.limits?.maxOutputTokens || "";
  players.value = payload.players.map((player, index) => {
    const deck =
      player.deck ??
      player.deckPreset ??
      presets.value[index % presets.value.length].id;
    return {
      ...player,
      id: player.id || `p${index + 1}`,
      name: player.name || `Player ${index + 1}`,
      ai: player.ai !== false,
      life: player.life ?? 20,
      model: player.model || props.app?.defaults?.model || "gpt-6-luna",
      reasoning: player.reasoning || "high",
      deckChoice: Array.isArray(deck) ? "custom" : deck,
      deckJSON: Array.isArray(deck) ? JSON.stringify(deck, null, 2) : "",
    };
  });
  sequence = Math.max(
    players.value.length,
    ...players.value.map(
      (player) => Number(player.id.match(/^p(\d+)$/)?.[1]) || 0,
    ),
  );
  importDialog.value?.close();
  error.value = "";
}
function parseImport() {
  try {
    importSetup(JSON.parse(importText.value));
  } catch (err) {
    error.value = `Could not import setup: ${err.message}`;
  }
}
async function readFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 4_000_000)
      throw Error("Setup file must be smaller than 4 MB.");
    importSetup(JSON.parse(await file.text()));
  } catch (err) {
    error.value = `Could not import setup: ${err.message}`;
  } finally {
    event.target.value = "";
  }
}
function submit() {
  error.value = "";
  try {
    const configured = players.value.map(
      ({ deckChoice, deckJSON, ...player }) => {
        const deck =
          deckChoice === "custom" ? JSON.parse(deckJSON) : deckChoice;
        if (deckChoice === "custom" && !Array.isArray(deck))
          throw Error(`${player.name}: the custom deck must be a JSON array.`);
        return {
          ...player,
          name: player.name.trim(),
          model: player.model.trim(),
          deck,
        };
      },
    );
    const limits = {
      ...(imported.limits || {}),
      maxDecisions: Number(form.maxDecisions),
      decisionTimeoutMs: Number(form.timeoutSeconds) * 1000,
    };
    delete limits.maxOutputTokens;
    if (form.maxOutputTokens !== "")
      limits.maxOutputTokens = Number(form.maxOutputTokens);
    emit("create", {
      ...imported,
      title: form.title.trim(),
      layout: form.layout,
      shuffle: form.shuffle,
      players: configured,
      references: form.references
        .split("\n")
        .map((path) => path.trim())
        .filter(Boolean),
      limits,
    });
  } catch (err) {
    error.value = err.message;
  }
}
</script>

<template>
  <section class="mx-auto max-w-5xl py-4" aria-labelledby="setup-title">
    <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 id="setup-title" class="text-2xl font-semibold">Set the table</h1>
        <p class="mt-2 max-w-xl text-sm text-base-content/70">
          Play against AI players, or watch a playtest and return to its saved
          game.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-if="app?.match"
          class="btn btn-sm"
          :disabled="busy"
          @click="emit('cancel')"
        >
          Back to table</button
        ><button
          class="btn btn-sm"
          :disabled="busy"
          @click="
            error = '';
            importDialog.showModal();
          "
        >
          <Upload class="size-4" /> Import setup
        </button>
      </div>
    </header>
    <p v-if="error" role="alert" class="alert alert-error mb-4">{{ error }}</p>
    <form
      class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]"
      @submit.prevent="submit"
    >
      <fieldset class="min-w-0 space-y-5" :disabled="busy">
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="fieldset"
            ><span class="label">Match name</span
            ><input
              v-model="form.title"
              class="input input-sm w-full"
              maxlength="200"
              required
          /></label>
          <label class="fieldset"
            ><span class="label">Seating</span
            ><select v-model="form.layout" class="select select-sm w-full">
              <option value="table">Open table</option>
              <option value="emperor">Two teams of three</option>
            </select></label
          >
        </div>
        <h2 class="flex items-center gap-2 text-lg font-semibold">
          Players <span class="badge badge-sm">{{ players.length }} / 6</span>
        </h2>
        <p v-if="players.length > 6" class="text-sm text-warning">
          This imported game can run in the background. The visual table
          supports up to six players.
        </p>
        <PlayerSetup
          v-for="(player, index) in players"
          :key="player.id"
          :player="player"
          :index="index"
          :layout="form.layout"
          :presets="presets"
          :removable="players.length > 1"
          :disabled="busy"
          @remove="removePlayer(index)"
        />
        <button
          class="btn btn-sm"
          type="button"
          :disabled="players.length >= 6 || busy"
          @click="addPlayer"
        >
          <Plus class="size-4" /> Add player
        </button>
      </fieldset>
      <aside class="min-w-0 space-y-4">
        <div
          class="rounded-box border border-base-300 p-4 text-sm leading-relaxed"
        >
          <h2 class="mb-2 font-semibold">Ready to play</h2>
          <ul
            class="[list-style-type:disc] space-y-2 pl-4 text-base-content/70"
          >
            <li>Each AI has its own session and private hand.</li>
            <li>Players interpret the rules and explicitly hand off.</li>
            <li>The table saves every game automatically.</li>
          </ul>
          <p v-if="form.layout === 'emperor'" class="mt-3">
            The middle player of each team is its emperor. Seats stay fixed.
          </p>
        </div>
        <details class="collapse collapse-arrow border border-base-300">
          <summary class="collapse-title text-sm font-medium">
            Format references
          </summary>
          <div class="collapse-content">
            <label class="fieldset"
              ><span class="label whitespace-normal"
                >Catalogue paths, one per line</span
              ><textarea
                v-model="form.references"
                :disabled="busy"
                class="textarea textarea-sm w-full"
                spellcheck="false"
                placeholder="formats/horde/variants/classic.md"
              /><span class="text-xs text-base-content/60"
                >Leave blank for ordinary Magic.</span
              ></label
            >
          </div>
        </details>
        <details class="collapse collapse-arrow border border-base-300">
          <summary class="collapse-title text-sm font-medium">
            Run limits
          </summary>
          <div class="collapse-content space-y-3">
            <label class="fieldset"
              ><span class="label">Maximum decisions</span
              ><input
                v-model.number="form.maxDecisions"
                :disabled="busy"
                type="number"
                min="1"
                step="1"
                required
                class="input input-sm w-full" /></label
            ><label class="fieldset"
              ><span class="label">Seconds per decision</span
              ><input
                v-model.number="form.timeoutSeconds"
                :disabled="busy"
                type="number"
                min="1"
                step="1"
                required
                class="input input-sm w-full" /></label
            ><label class="fieldset"
              ><span class="label whitespace-normal"
                >Output token limit (optional)</span
              ><input
                v-model="form.maxOutputTokens"
                :disabled="busy"
                type="number"
                min="1"
                step="1"
                class="input input-sm w-full"
                placeholder="No additional limit"
            /></label>
          </div>
        </details>
        <label class="flex items-center gap-2 text-sm"
          ><input
            v-model="form.shuffle"
            :disabled="busy"
            type="checkbox"
            class="checkbox checkbox-sm"
          />
          Shuffle decks at setup</label
        >
        <button
          class="btn btn-sm btn-primary w-full"
          type="submit"
          :disabled="busy"
        >
          <span v-if="busy" class="loading loading-spinner loading-sm" />
          {{ busy ? "Creating table…" : "Create table" }}
        </button>
        <p class="text-xs text-base-content/60">
          Creating a table does not start the AI players. Use Start when you’re
          ready.
        </p>
      </aside>
    </form>
    <dialog ref="importDialog" class="modal" aria-labelledby="import-title">
      <div class="modal-box max-w-2xl">
        <div class="mb-4 flex items-center justify-between">
          <h2 id="import-title" class="text-lg font-semibold">
            Import setup JSON
          </h2>
          <button
            class="btn btn-sm btn-ghost btn-square"
            aria-label="Close setup import"
            @click="importDialog.close()"
          >
            <X class="size-4" />
          </button>
        </div>
        <p class="mb-4 text-sm text-base-content/70">
          Import a saved configuration to review its players, decks, and rules
          before creating the table.
        </p>
        <button class="btn btn-sm mb-3" @click="fileInput.click()">
          <Upload class="size-4" /> Choose JSON file</button
        ><input
          ref="fileInput"
          aria-label="Setup JSON file"
          type="file"
          accept=".json,application/json"
          hidden
          @change="readFile"
        /><label class="fieldset"
          ><span class="label">Or paste setup JSON</span
          ><textarea
            v-model="importText"
            class="textarea textarea-sm h-60 w-full font-mono"
            spellcheck="false"
          />
        </label>
        <p v-if="error" class="mt-3 text-sm text-error" role="alert">
          {{ error }}
        </p>
        <div class="modal-action">
          <button class="btn btn-sm" @click="importDialog.close()">
            Cancel</button
          ><button
            class="btn btn-sm btn-primary"
            :disabled="!importText.trim()"
            @click="parseImport"
          >
            Load setup
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button>Close import</button>
      </form>
    </dialog>
  </section>
</template>
