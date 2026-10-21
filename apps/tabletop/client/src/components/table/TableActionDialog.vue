<script setup>
import { computed, nextTick, reactive, ref, watch } from "vue";
import { playerLabel, zoneLabel, phaseLabel } from "../../../../shared/table-language.mjs";
const props = defineProps({ mode: String, table: Object, human: Object });
const emit = defineEmits(["close"]);
const dialog = ref(null),
  form = reactive({}),
  error = ref("");
const context = ref("");
const titles = {
  life: "Life & player counters",
  markers: "Turn & phase markers",
  peek: "Look at concealed cards",
  token: "Create a token",
  ability: "Add a stack ability",
  outcome: "Player status & game outcome",
  "draw-many": "Draw cards",
};
const canEdit = computed(
  () => props.human?.canCommit && context.value === props.human.context(),
);
const textCounters = (value) =>
  Object.entries(value || {})
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
function counters(text) {
  return Object.fromEntries(
    String(text || "")
      .split("\n")
      .filter((s) => s.trim())
      .map((line) => {
        const i = line.lastIndexOf(":");
        const n = Number(line.slice(i + 1));
        if (i < 1 || !Number.isSafeInteger(n) || n < 0 || n > 100000)
          throw Error("Use one counter per line, for example poison: 1.");
        return [line.slice(0, i).trim(), n];
      }),
  );
}
function fillPlayer() {
  const p = props.table.players.find((p) => p.id === form.player);
  if (p)
    Object.assign(form, {
      life: p.life,
      counters: textCounters(p.counters),
      mana: textCounters(p.mana),
      status: p.status || "active",
    });
}
watch(
  () => props.mode,
  async (mode) => {
    error.value = "";
    if (!mode) {
      dialog.value?.close();
      return;
    }
    context.value = props.human.context();
    Object.assign(form, {
      player: props.human.seatId,
      number: props.table.turn.number,
      phase: props.table.turn.phase,
      active: props.table.turn.active,
      zone: `${props.human.seatId}:library`,
      count: 1,
      name: "",
      type_line: mode === "ability" ? "Ability" : "Token Creature",
      oracle_text: "",
      short_description: "",
      long_description: "",
      power: "",
      toughness: "",
      winners: [],
      explanation: "",
      agreed: false,
    });
    fillPlayer();
    await nextTick();
    if (!dialog.value.open) dialog.value.showModal();
  },
);
function queue(action, label) {
  if (!canEdit.value)
    throw Error("The table changed. Close this editor and try again.");
  props.human.queue(action, label);
  emit("close");
}
async function submit() {
  try {
    error.value = "";
    switch (props.mode) {
      case "life":
        queue(
          {
            type: "player",
            player: form.player,
            set: {
              life: Number(form.life),
              counters: counters(form.counters),
              mana: counters(form.mana),
              status: form.status,
            },
          },
          `Set ${playerLabel(form.player, props.table.players)} to ${form.life} life and update counters`,
        );
        break;
      case "markers":
        queue(
          {
            type: "turn",
            set: {
              number: Number(form.number),
              phase: form.phase,
              active: form.active,
            },
          },
          `Turn ${form.number} · ${playerLabel(form.active, props.table.players)} · ${phaseLabel(form.phase)}`,
        );
        break;
      case "peek":
        queue(
          { type: "peek", zone: form.zone, count: Number(form.count) },
          `Look at the top ${form.count} card${Number(form.count) === 1 ? '' : 's'} of ${zoneLabel(props.table.zones[form.zone] || form.zone, props.table.players)}`,
        );
        break;
      case "draw-many":
        props.human.draw(Number(form.count));
        emit("close");
        break;
      case "token":
      case "ability": {
        const definition = {
          name: form.name.trim(),
          type_line: form.type_line,
          oracle_text: form.oracle_text,
          ...(props.mode === "ability" ? {
            ...(form.short_description.trim() ? { short_description: form.short_description.trim() } : {}),
            ...(form.long_description.trim() ? { long_description: form.long_description.trim() } : {}),
          } : {}),
          ...(form.power ? { power: form.power } : {}),
          ...(form.toughness ? { toughness: form.toughness } : {}),
        };
        queue(
          props.mode === "ability"
            ? { type: "stack_item", definition }
            : {
                type: "token",
                definition,
                count: Number(form.count),
                owner: form.player,
              },
          props.mode === "ability"
            ? `Add ${definition.name} to stack`
            : `Create ${form.count} ${definition.name}`,
        );
        break;
      }
      case "outcome":
        if (!form.agreed) throw Error("Confirm that the result is agreed.");
        if (
          await props.human.send({
            handoff: {
              type: "result",
              winners: form.winners,
              explanation: form.explanation,
            },
          })
        )
          emit("close");
        else error.value = props.human.error;
        break;
    }
  } catch (err) {
    error.value = err.message;
  }
}
function concede() {
  try {
    queue(
      {
        type: "player",
        player: props.human.seatId,
        set: { status: "conceded" },
      },
      `${playerLabel(props.human.seatId, props.table.players)} concedes`,
    );
  } catch (err) {
    error.value = err.message;
  }
}
</script>
<template>
  <dialog
    ref="dialog"
    class="modal"
    aria-labelledby="table-action-title"
    @close="emit('close')"
    @cancel="emit('close')"
  >
    <div class="modal-box max-w-xl">
      <header class="mb-4 flex items-start justify-between gap-3">
        <h2 id="table-action-title" class="text-xl font-semibold">
          {{ titles[mode] }}
        </h2>
        <button class="btn btn-sm btn-ghost" @click="emit('close')">
          Close
        </button>
      </header>
      <p v-if="!canEdit" class="alert alert-warning mb-3 text-sm">
        The table changed or control passed. Close this editor and try again.
      </p>
      <p v-if="error" role="alert" class="alert alert-error mb-3 text-sm">
        {{ error }}
      </p>
      <form class="grid gap-4" @submit.prevent="submit">
        <template v-if="mode === 'life'"
          ><label class="grid gap-1 text-sm"
            >Player<select
              aria-label="Player"
              v-model="form.player"
              class="select select-sm w-full"
              @change="fillPlayer"
            >
              <option v-for="p in table.players" :key="p.id" :value="p.id">
                {{ p.name }}
              </option>
            </select></label
          ><label class="grid gap-1 text-sm"
            >Life total<input
              v-model.number="form.life"
              class="input input-sm w-full"
              type="number"
              required /></label
          ><label class="grid gap-1 text-sm"
            >Counters · name: count<textarea
              v-model="form.counters"
              class="textarea textarea-sm w-full"
              placeholder="poison: 1"
            /></label
          ><label class="grid gap-1 text-sm"
            >Mana pool · color: amount<textarea
              v-model="form.mana"
              class="textarea textarea-sm w-full"
              placeholder="G: 2"
            /></label
          ><label class="grid gap-1 text-sm"
            >Player status<select
              v-model="form.status"
              class="select select-sm w-full"
            >
              <option value="active">Playing</option>
              <option value="eliminated">Eliminated</option>
              <option value="conceded">Conceded</option>
            </select></label
          ></template
        >
        <template v-if="mode === 'markers'"
          ><p class="text-sm text-base-content/60">
            These are display markers. Use Pass priority or Pass turn to notify
            another player.
          </p>
          <label class="grid gap-1 text-sm"
            >Global turn marker<input
              v-model.number="form.number"
              class="input input-sm w-full"
              type="number"
              min="1"
              required /></label
          ><label class="grid gap-1 text-sm"
            >Active player<select
              v-model="form.active"
              class="select select-sm w-full"
            >
              <option v-for="p in table.players" :key="p.id" :value="p.id">
                {{ p.name }}
              </option>
            </select></label
          ><label class="grid gap-1 text-sm"
            >Phase or step<input
              v-model="form.phase"
              class="input input-sm w-full"
              maxlength="100"
              required /></label
        ></template>
        <template v-if="mode === 'peek'"
          ><p class="text-sm text-base-content/60">
            Only look when the rules permit it. These cards appear in your
            private view after you send.
          </p>
          <label class="grid gap-1 text-sm"
            >Zone<select v-model="form.zone" class="select select-sm w-full">
              <option v-for="(zone, id) in table.zones" :key="id" :value="id">
                {{ zoneLabel(zone, table.players) }}
              </option>
            </select></label
          ></template
        >
        <label
          v-if="['peek', 'draw-many', 'token'].includes(mode)"
          class="grid gap-1 text-sm"
          >Number of cards<input
            v-model.number="form.count"
            class="input input-sm w-full"
            type="number"
            min="1"
            max="100"
            required
        /></label>
        <template v-if="mode === 'token' || mode === 'ability'"
          ><label class="grid gap-1 text-sm"
            >Name<input
              v-model="form.name"
              class="input input-sm w-full"
              maxlength="200"
              required /></label
          ><label v-if="mode === 'token'" class="grid gap-1 text-sm"
            >Type line<input
              v-model="form.type_line"
              class="input input-sm w-full" /></label
          ><label v-if="mode === 'token'" class="grid gap-1 text-sm"
            >Rules text<textarea
              v-model="form.oracle_text"
              class="textarea textarea-sm w-full"
              maxlength="12000"
              rows="4"
            /></label
          ><template v-if="mode === 'ability'">
            <label class="grid gap-1 text-sm">
              Short description
              <textarea v-model="form.short_description" class="textarea textarea-sm w-full" maxlength="500" rows="2" placeholder="Return a creature card from your graveyard to your hand." />
              <span class="text-xs text-base-content/60">Shown on hover. Uses the name if left blank.</span>
            </label>
            <label class="grid gap-1 text-sm">
              Full description
              <textarea v-model="form.long_description" class="textarea textarea-sm w-full" maxlength="12000" rows="4" placeholder="Optional effect text, chosen targets, or other public details." />
              <span class="text-xs text-base-content/60">Shown when someone clicks the ability.</span>
            </label>
          </template><template v-if="mode === 'token'"
            ><div class="grid grid-cols-2 gap-3">
              <label class="grid gap-1 text-sm"
                >Power<input
                  v-model="form.power"
                  class="input input-sm w-full" /></label
              ><label class="grid gap-1 text-sm"
                >Toughness<input
                  v-model="form.toughness"
                  class="input input-sm w-full"
              /></label>
            </div>
            <label class="grid gap-1 text-sm"
              >Owner<select
                aria-label="Player"
                v-model="form.player"
                class="select select-sm w-full"
              >
                <option v-for="p in table.players" :key="p.id" :value="p.id">
                  {{ p.name }}
                </option>
              </select></label
            ></template
          ></template
        >
        <template v-if="mode === 'outcome'"
          ><p class="text-sm text-base-content/60">
            A concession marks your seat. It does not automatically end a
            multiplayer game. Pass control to a remaining player afterward.
          </p>
          <button
            type="button"
            class="btn btn-sm"
            :disabled="!canEdit"
            @click="concede"
          >
            Queue my concession
          </button>
          <h3 class="border-t border-base-300 pt-4 font-semibold">
            Declare the game finished
          </h3>
          <p class="text-sm">
            Select every winner, or leave all unchecked for a draw.
          </p>
          <label
            v-for="p in table.players"
            :key="p.id"
            class="flex items-center gap-2 text-sm"
            ><input
              aria-label="Winner"
              :aria-describedby="`winner-name-${p.id}`"
              v-model="form.winners"
              class="checkbox checkbox-sm"
              type="checkbox"
              :value="p.id"
            /><span :id="`winner-name-${p.id}`">{{ p.name }} won</span></label
          ><label class="grid gap-1 text-sm"
            >Result explanation<textarea
              aria-label="Result explanation"
              v-model="form.explanation"
              class="textarea textarea-sm w-full"
              maxlength="2000"
            /></label
          ><label class="flex items-center gap-2 text-sm"
            ><input
              aria-label="The result is agreed and the game is over"
              v-model="form.agreed"
              class="checkbox checkbox-sm"
              type="checkbox"
              required
            />The result is agreed and the game is over</label
          >
          <p class="text-xs text-base-content/60">
            Sends your queued play and message, ends gameplay and begins player
            feedback.
          </p></template
        >
        <button class="btn btn-sm btn-primary" :disabled="!canEdit">
          {{
            mode === "outcome"
              ? "Declare outcome & begin feedback"
              : "Queue changes"
          }}
        </button>
      </form>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button>Close action editor</button>
    </form>
  </dialog>
</template>
