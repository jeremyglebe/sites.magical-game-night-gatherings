<script setup>
import { computed, nextTick, reactive, ref, watch } from "vue";
import CardBack from "./CardBack.vue";
import { zoneLabel } from "../../../../shared/table-language.mjs";
const props = defineProps({
  card: Object,
  table: Object,
  human: Object,
  historical: Boolean,
  readonly: Boolean,
});
const emit = defineEmits(["close", "select"]);
const dialog = ref(null),
  details = ref(null),
  loading = ref(false),
  error = ref(""),
  edit = reactive({}),
  destination = ref("battlefield"),
  position = ref("bottom");
let serial = 0;
const openedContext = ref(null);
const textCounters = (value) =>
  Object.entries(value || {})
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
function counters(value) {
  return Object.fromEntries(
    String(value || "")
      .split("\n")
      .filter((s) => s.trim())
      .map((s) => {
        const i = s.lastIndexOf(":");
        const n = Number(s.slice(i + 1));
        if (i < 1 || !Number.isSafeInteger(n) || n < 0 || n > 100000)
          throw Error("Use one counter per line, for example +1/+1: 2.");
        return [s.slice(0, i).trim(), n];
      }),
  );
}
const shown = computed(() => details.value || props.card || {});
const canEdit = computed(
  () =>
    !props.readonly &&
    !props.historical &&
    props.card?.id &&
    !props.card.draft &&
    props.card.editable !== false &&
    props.human?.canCommit &&
    openedContext.value === props.human.context(),
);
const battlefield = computed(() => props.table?.zones?.battlefield?.cards || []);
const targets = computed(() => {
  if (!battlefield.value.some(c => c.id === props.card?.id)) return [];
  const excluded = new Set([props.card.id]);
  let previousSize;
  do {
    previousSize = excluded.size;
    for (const card of battlefield.value) {
      if (excluded.has(card.attached_to)) excluded.add(card.id);
    }
  } while (excluded.size !== previousSize);
  return battlefield.value.filter(c => !excluded.has(c.id) && !c.draft && c.editable !== false);
});
const attachedTo = computed(() => !props.historical && battlefield.value.find(c => c.id === shown.value.attached_to));
const image = computed(() => {
  if (shown.value.kind === "ability") return null;
  try {
    const u = new URL(shown.value.image_url);
    return u.protocol === "https:" && u.hostname === "cards.scryfall.io"
      ? u.href
      : null;
  } catch {
    return null;
  }
});
const description = computed(() => shown.value.kind === "ability"
  ? shown.value.long_description?.trim() || shown.value.oracle_text?.trim()
    || shown.value.short_description?.trim() || shown.value.name
  : shown.value.oracle_text);
watch(
  () => props.card,
  async (card) => {
    const run = ++serial;
    error.value = "";
    details.value = card;
    openedContext.value = props.human?.context?.();
    if (!card) {
      dialog.value?.close();
      return;
    }
    Object.assign(edit, {
      damage: card.damage || 0,
      counters: textCounters(card.counters),
      controller: card.controller,
      attached_to: card.attached_to || "",
      tapped: !!card.tapped,
      face_down: !!card.face_down,
      note: card.note || "",
    });
    destination.value = "battlefield";
    position.value = "bottom";
    await nextTick();
    if (!dialog.value.open) dialog.value.showModal();
    if (props.readonly || props.historical || card.draft || !card.id) return;
    loading.value = true;
    try {
      const data = props.human?.seatId
        ? await props.human.cardDetails(card)
        : await fetch(`/api/public-card?id=${encodeURIComponent(card.id)}`, {
            cache: "no-store",
          }).then(async (r) => {
            const v = await r.json();
            if (!r.ok) throw Error(v.error || "Unable to read card");
            return v;
          });
      if (run === serial) details.value = { ...card, ...data };
    } catch (err) {
      if (run === serial) error.value = err.message;
    } finally {
      if (run === serial) loading.value = false;
    }
  },
);
watch(
  () => destination.value,
  (value) => (position.value = value === "stack" ? "top" : "bottom"),
);
function queue(action, label) {
  try {
    error.value = "";
    if (!canEdit.value)
      throw Error("The table changed. Close this card and inspect it again.");
    props.human.queue(action, label);
    emit("close");
  } catch (err) {
    error.value = err.message;
  }
}
function updateMarkers() {
  try {
    const damage = Number(edit.damage);
    if (!Number.isSafeInteger(damage) || damage < 0)
      throw Error("Damage must be a whole number, zero or more.");
    queue(
      {
        type: "card",
        card: props.card.id,
        set: {
          ...edit,
          damage,
          counters: counters(edit.counters),
          attached_to: edit.attached_to || null,
        },
      },
      `Update markers on ${props.card.name}`,
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
    aria-labelledby="table-card-title"
    @close="emit('close')"
    @cancel="emit('close')"
  >
    <div class="modal-box w-11/12 max-w-3xl">
      <header class="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 id="table-card-title" class="text-xl font-semibold">
            {{ shown.name || "Card" }}
          </h2>
          <p v-if="historical" class="mt-1 text-xs text-base-content/60">
            Revealed during this game · saved card reference
          </p>
        </div>
        <button class="btn btn-sm btn-ghost" @click="emit('close')">
          Close
        </button>
      </header>
      <div class="grid gap-5 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <img
          v-if="image"
          :src="image"
          :alt="shown.name"
          width="240"
          height="336"
          class="mx-auto aspect-[5/7] w-48 max-w-full rounded-xl object-contain"
        />
        <CardBack
          v-else-if="shown.kind === 'ability'"
          class="mx-auto w-48 max-w-full rounded-xl"
          aria-label="Ability card back"
        />
        <div
          v-else
          class="grid aspect-[5/7] w-48 place-items-center rounded-xl bg-base-300 p-5 text-center"
        >
          {{ shown.name || "Concealed card" }}
        </div>
        <div class="min-w-0 space-y-3">
          <p class="text-primary">{{ shown.mana_cost }}</p>
          <p class="font-medium">{{ shown.type_line || (shown.kind === 'ability' ? 'Ability' : '') }}</p>
          <p class="whitespace-pre-wrap text-sm leading-relaxed">
            {{
              loading
                ? "Loading card text…"
                : description || "No rules text."
            }}
          </p>
          <p v-if="shown.power !== undefined" class="font-semibold">
            {{ shown.power }} / {{ shown.toughness }}
          </p>
          <p v-if="shown.note" class="whitespace-pre-wrap text-sm">
            {{ shown.note }}
          </p>
          <p v-if="attachedTo" class="text-sm text-base-content/70">
            Attached to {{ attachedTo.name || "Face-down card" }}
          </p>
          <details v-if="shown.rulings?.length">
            <summary class="cursor-pointer text-sm font-semibold">
              Official card rulings ({{ shown.rulings.length }})
            </summary>
            <p
              v-for="(ruling, i) in shown.rulings"
              :key="i"
              class="mt-3 text-sm"
            >
              <span class="text-base-content/60"
                >{{ ruling.published_at }} · </span
              >{{ ruling.comment }}
            </p>
          </details>
        </div>
      </div>
      <p v-if="error" role="alert" class="alert alert-error mt-4 text-sm">
        {{ error }}
      </p>
      <template
        v-if="
          !readonly &&
          !historical &&
          human?.seatId &&
          card?.id &&
          !card.draft &&
          card.editable !== false
        "
      >
        <p v-if="!canEdit" class="mt-4 text-sm text-base-content/60">
          Wait for your handoff to edit, or reopen this card if the table
          changed.
        </p>
        <div class="mt-5 flex flex-wrap gap-2">
          <button
            class="btn btn-sm"
            :disabled="!canEdit"
            @click="
              queue(
                { type: 'card', card: card.id, set: { tapped: !card.tapped } },
                `${card.tapped ? 'Untap' : 'Tap'} ${card.name}`,
              )
            "
          >
            {{ card.tapped ? "Queue untap" : "Queue tap" }}</button
          ><button
            class="btn btn-sm"
            :disabled="!canEdit"
            @click="
              queue(
                { type: 'reveal', card: card.id },
                `Reveal ${card.name} to all players`,
              )
            "
          >
            Reveal to all</button
          ><button
            class="btn btn-sm"
            :disabled="!canEdit"
            @click="
              emit('select', { cardId: card.id });
              emit('close');
            "
          >
            Choose destination
          </button>
          <button
            v-if="card.attached_to"
            class="btn btn-sm"
            :disabled="!canEdit"
            @click="queue(
              { type: 'card', card: card.id, set: { attached_to: null } },
              `Detach ${card.name}`,
            )"
          >
            Detach
          </button>
        </div>
        <form
          class="mt-5 flex flex-wrap items-end gap-2 border-t border-base-300 pt-4"
          @submit.prevent="
            queue(
              { type: 'move', card: card.id, to: destination, position },
              `Move ${card.name} to ${zoneLabel(table.zones[destination] || destination, table.players)} · ${position}`,
            )
          "
        >
          <label class="grid gap-1 text-xs"
            >Move to<select v-model="destination" class="select select-sm">
              <option v-for="(zone, id) in table.zones" :key="id" :value="id">
                {{ zoneLabel(zone, table.players) }}
              </option>
            </select></label
          >
          <label class="grid gap-1 text-xs"
            >Position<select v-model="position" class="select select-sm w-24">
              <option value="bottom">Bottom</option>
              <option value="top">Top</option>
            </select></label
          ><button class="btn btn-sm" :disabled="!canEdit">Queue move</button>
          <p class="w-full text-xs text-base-content/60">
            Moving retains markers. Clear damage, counters or tapped state when
            needed.
          </p>
        </form>
        <details class="mt-4">
          <summary class="cursor-pointer text-sm font-medium">
            Edit markers, control & attachment
          </summary>
          <form
            class="mt-3 grid gap-3 sm:grid-cols-2"
            @submit.prevent="updateMarkers"
          >
            <label class="grid gap-1 text-xs"
              >Damage marked<input
                v-model.number="edit.damage"
                class="input input-sm w-full"
                type="number"
                min="0"
                required
            /></label>
            <label class="grid gap-1 text-xs"
              >Controller<select
                v-model="edit.controller"
                class="select select-sm w-full"
              >
                <option v-for="p in table.players" :key="p.id" :value="p.id">
                  {{ p.name }}
                </option>
              </select></label
            >
            <label class="grid gap-1 text-xs"
              >Counters · name: count<textarea
                v-model="edit.counters"
                class="textarea textarea-sm w-full"
                rows="3"
                placeholder="+1/+1: 2"
              />
            </label>
            <label class="grid gap-1 text-xs"
              >Attached to<select
                aria-label="Attached to"
                v-model="edit.attached_to"
                class="select select-sm w-full"
              >
                <option value="">None</option>
                <option v-for="c in targets" :key="c.id" :value="c.id">
                  {{ c.name }}
                </option>
              </select></label
            >
            <label class="flex items-center gap-2 text-sm"
              ><input
                aria-label="Tapped"
                v-model="edit.tapped"
                class="checkbox checkbox-sm"
                type="checkbox"
              />Tapped</label
            ><label class="flex items-center gap-2 text-sm"
              ><input
                aria-label="Face down"
                v-model="edit.face_down"
                class="checkbox checkbox-sm"
                type="checkbox"
              />Face down</label
            >
            <label class="grid gap-1 text-xs sm:col-span-2"
              >Card note<textarea
                aria-label="Card note"
                v-model="edit.note"
                class="textarea textarea-sm w-full"
                maxlength="2000"
              /></label
            ><button class="btn btn-sm sm:col-span-2" :disabled="!canEdit">
              Queue marker changes
            </button>
          </form>
        </details>
        <button
          v-if="card.token || card.kind === 'ability'"
          class="btn btn-sm btn-ghost mt-4 text-error"
          :disabled="!canEdit"
          @click="
            queue(
              {
                type: card.token ? 'remove_token' : 'remove_stack_item',
                card: card.id,
              },
              `Remove ${card.name}`,
            )
          "
        >
          Remove {{ card.token ? "token" : "stack ability" }}
        </button>
      </template>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button>Close card details</button>
    </form>
  </dialog>
</template>
