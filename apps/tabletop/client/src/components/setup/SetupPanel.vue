<script setup>
import { computed, reactive, ref, watch } from "vue";
import { Plus, Upload, X } from "@lucide/vue";
import PlayerSetup from "./PlayerSetup.vue";

const props = defineProps({ app: Object, busy: Boolean });
const emit = defineEmits(["create", "cancel"]);
const preparationSources = computed(() => props.app?.preparationSources || [{
  id: "zombies-vs-plants-v0.1", title: "Zombies vs Plants: Jumpstart", version: "0.1",
}]);
const defaultSource = computed(() => props.app?.defaultPreparation?.source || preparationSources.value[0]?.id || "custom");
const jumpstart = computed(() => form.deckSource !== "custom");
const form = reactive({
  title: "Zombies vs Plants · Jumpstart v0.1",
  deckSource: defaultSource.value,
  layout: "table",
  references: "",
  maxDecisions: 2000,
  timeoutSeconds: 120,
  maxOutputTokens: "",
  allowBanter: true,
  shuffle: true,
  seriesMode: "single",
  winsRequired: 2,
  maxGames: 3,
  sideboarding: false,
  resetTo: "game",
});
const players = ref([]);
const error = ref("");
const importText = ref("");
const importDialog = ref(null);
const fileInput = ref(null);
let sequence = 0;
let imported = {};
function addPlayer() {
  if (jumpstart.value && players.value.length >= 2) return;
  if (players.value.length >= 6) return;
  const defaults = props.app?.defaults || {};
  sequence++;
  players.value.push({
    id: `p${sequence}`,
    name: `Player ${sequence}`,
    ai: true,
    life: 20,
    deckJSON: "",
    sideboardJSON: "",
    model: defaults.model || "gpt-6-luna",
    reasoning: defaults.reasoning || "high",
    faction: players.value.length === 0 ? "plants" : "zombies",
  });
}
addPlayer();
addPlayer();
function chooseSource() {
  if (!jumpstart.value) return;
  form.sideboarding = false;
  players.value = players.value.slice(0, 2);
  while (players.value.length < 2) addPlayer();
  players.value.forEach((player, index) => {
    player.faction = index === 0 ? "plants" : "zombies";
    player.life = 20;
  });
  form.layout = "table";
  form.shuffle = true;
}
function chooseFaction(index, faction) {
  players.value[index].faction = faction;
  players.value[1 - index].faction = faction === "plants" ? "zombies" : "plants";
}
function removePlayer(index) {
  players.value.splice(index, 1);
  if (players.value.length !== 6) form.layout = "table";
}
watch(
  () => form.layout,
  (value) => {
    if (jumpstart.value) {
      form.layout = "table";
      return;
    }
    if (value === "emperor") while (players.value.length < 6) addPlayer();
  },
);
function importSetup(payload) {
  if (!payload || !Array.isArray(payload.players) || !payload.players.length)
    throw Error("The setup needs at least one player.");
  const hasDecks = payload.players.some((player) => player.deck != null || player.deckPreset != null);
  const preparation = payload.preparation || (!hasDecks ? { kind: "jumpstart", source: defaultSource.value } : null);
  if (preparation && (preparation.kind !== "jumpstart" || !preparationSources.value.some((source) => source.id === preparation.source)))
    throw Error("Unknown packet selection source.");
  if (preparation && payload.players.length !== 2)
    throw Error("Jumpstart needs exactly two players.");
  if (!preparation && payload.players.some((player) => !Array.isArray(player.deck)))
    throw Error("The original test-deck presets have been removed. Choose Zombies vs Plants, or provide a card-list array for every custom deck.");
  imported = payload;
  form.deckSource = preparation?.source || "custom";
  form.title = payload.title || (preparation ? "Zombies vs Plants · Jumpstart v0.1" : "Local playtest");
  form.layout = !jumpstart.value && payload.layout === "emperor" ? "emperor" : "table";
  form.references = (payload.references || []).join("\n");
  form.shuffle = payload.shuffle !== false;
  form.allowBanter = payload.allowBanter !== false;
  form.seriesMode = payload.series?.mode || "single";
  form.winsRequired = payload.series?.winsRequired ?? 2;
  form.maxGames = payload.series?.maxGames ?? 3;
  form.sideboarding = payload.series?.sideboarding === true;
  form.resetTo = payload.series?.resetTo === "preparation" ? "preparation" : "game";
  form.maxDecisions = payload.limits?.maxDecisions || 2000;
  form.timeoutSeconds = (payload.limits?.decisionTimeoutMs || 120000) / 1000;
  form.maxOutputTokens = payload.limits?.maxOutputTokens || "";
  players.value = payload.players.map((player, index) => {
    const deck = player.deck;
    return {
      ...player,
      id: player.id || `p${index + 1}`,
      name: player.name || `Player ${index + 1}`,
      ai: player.ai !== false,
      life: jumpstart.value ? 20 : player.life ?? 20,
      model: player.model || props.app?.defaults?.model || "gpt-6-luna",
      reasoning: player.reasoning || "high",
      deckJSON: Array.isArray(deck) ? JSON.stringify(deck, null, 2) : "",
      sideboardJSON: Array.isArray(player.sideboard) ? JSON.stringify(player.sideboard, null, 2) : "",
      faction: player.faction || (index === 0 ? "plants" : "zombies"),
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
    if (jumpstart.value && (
      players.value.length !== 2 ||
      !players.value.some((player) => player.faction === "plants") ||
      !players.value.some((player) => player.faction === "zombies")
    )) throw Error("Jumpstart needs two players: one Plants and one Zombies.");
    if (form.seriesMode !== "single" && (!Number.isSafeInteger(form.winsRequired) || form.winsRequired < 1))
      throw Error("Wins needed must be a positive whole number.");
    if (form.seriesMode === "best_of" && (!Number.isSafeInteger(form.maxGames) || form.maxGames < form.winsRequired))
      throw Error("Maximum games must be at least the number of wins needed.");
    const configured = players.value.map(
      ({ deckChoice, deckJSON, sideboardJSON, sideboard: importedSideboard, deck: importedDeck, deckPreset, ...player }) => {
        if (jumpstart.value) return {
          ...player,
          name: player.name.trim(),
          model: player.model.trim(),
          life: 20,
        };
        delete player.faction;
        const deck = JSON.parse(deckJSON);
        if (!Array.isArray(deck))
          throw Error(`${player.name}: the custom deck must be a JSON array.`);
        const sideboard = sideboardJSON.trim() ? JSON.parse(sideboardJSON) : [];
        if (!Array.isArray(sideboard))
          throw Error(`${player.name}: the sideboard must be a JSON array.`);
        return {
          ...player,
          name: player.name.trim(),
          model: player.model.trim(),
          sideboard,
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
    const { preparation: importedPreparation, ...base } = imported;
    emit("create", {
      ...base,
      ...(jumpstart.value ? { preparation: { kind: "jumpstart", source: form.deckSource } } : {}),
      series: form.seriesMode === "single" ? { mode: "single" } : {
        mode: form.seriesMode, winsRequired: form.winsRequired,
        ...(form.seriesMode === "best_of" ? { maxGames: form.maxGames } : {}),
        resetTo: jumpstart.value ? form.resetTo : "game",
        sideboarding: !jumpstart.value && form.sideboarding,
      },
      title: form.title.trim(),
      layout: jumpstart.value ? "table" : form.layout,
      shuffle: jumpstart.value || form.shuffle,
      allowBanter: form.allowBanter,
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
        <label class="fieldset">
          <span class="label">Deck source</span>
          <select v-model="form.deckSource" class="select select-sm w-full" @change="chooseSource">
            <option v-for="source in preparationSources" :key="source.id" :value="source.id">
              {{ source.title }} · v{{ source.version }}
            </option>
            <option value="custom">Custom deck JSON</option>
          </select>
          <span v-if="jumpstart" class="text-xs text-base-content/70">Each player chooses two packets from their faction before the game. Two packets make a forty-card deck.</span>
        </label>
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
            ><select v-model="form.layout" class="select select-sm w-full" :disabled="jumpstart">
              <option value="table">Open table</option>
              <option value="emperor">Two teams of three</option>
            </select></label
          >
        </div>
        <fieldset class="fieldset gap-3 rounded-box border border-base-300 p-4">
          <legend class="fieldset-legend">Match length</legend>
          <div class="grid items-end gap-3 sm:grid-cols-3">
            <label class="grid gap-1">
              <span class="label">Play</span>
              <select v-model="form.seriesMode" class="select select-sm w-full">
                <option value="single">One game</option>
                <option value="best_of">Best X out of Y</option>
                <option value="first_to">First to Z wins</option>
              </select>
            </label>
            <label v-if="form.seriesMode !== 'single'" class="grid gap-1">
              <span class="label">Wins needed</span>
              <input v-model.number="form.winsRequired" type="number" min="1" step="1" required class="input input-sm w-full" />
            </label>
            <label v-if="form.seriesMode === 'best_of'" class="grid gap-1">
              <span class="label">Maximum games</span>
              <input v-model.number="form.maxGames" type="number" :min="form.winsRequired || 1" step="1" required class="input input-sm w-full" />
            </label>
          </div>
          <template v-if="form.seriesMode !== 'single'">
            <p class="text-xs text-base-content/70">The same players keep their conversations across games and review the whole match at the end.</p>
            <p v-if="form.seriesMode === 'best_of'" class="text-xs text-base-content/70">Ends when a player reaches {{ form.winsRequired }} wins, or after {{ form.maxGames }} games. At the limit, the highest score wins; tied scores draw. Drawn games count toward the limit.</p>
            <p v-else class="text-xs text-base-content/70">Drawn games do not add a win. Run limits still apply across the whole match.</p>
            <label v-if="!jumpstart" class="flex items-center gap-2 text-sm">
              <input v-model="form.sideboarding" type="checkbox" class="checkbox checkbox-sm" />
              Allow sideboarding between games
            </label>
            <label v-if="jumpstart" class="grid gap-1 sm:max-w-xs">
              <span class="label">Between games</span>
              <select v-model="form.resetTo" class="select select-sm w-full">
                <option value="game">Keep the chosen decks</option>
                <option value="preparation">Choose packets again</option>
              </select>
            </label>
            <p v-if="jumpstart" class="text-xs text-base-content/70">{{ form.resetTo === 'preparation' ? 'Each new game returns to packet selection. Players keep their factions and conversations.' : 'Players keep their chosen packets for the whole match.' }} This boxed set has no sideboards.</p>
            <p v-else-if="form.sideboarding" class="text-xs text-base-content/70">Supply each player's sideboard below. Swaps use only that player's original cards and keep their main deck the same size.</p>
          </template>
        </fieldset>
        <h2 class="flex items-center gap-2 text-lg font-semibold">
          Players <span class="badge badge-sm">{{ players.length }} / {{ jumpstart ? 2 : 6 }}</span>
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
          :jumpstart="jumpstart"
          :sideboarding="form.seriesMode !== 'single' && form.sideboarding"
          :removable="!jumpstart && players.length > 1"
          :disabled="busy"
          @remove="removePlayer(index)"
          @faction="chooseFaction(index, $event)"
        />
        <button
          v-if="!jumpstart"
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
        <div class="space-y-1.5">
          <label class="flex items-center gap-2 text-sm">
            <input
              v-model="form.allowBanter"
              :disabled="busy"
              type="checkbox"
              class="checkbox checkbox-sm"
              aria-describedby="banter-help"
            />
            AI may banter
          </label>
          <p id="banter-help" class="text-xs text-base-content/60">
            Occasional light table talk alongside clear gameplay messages.
            Players use their configured names either way.
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
        <label v-if="!jumpstart" class="flex items-center gap-2 text-sm"
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
