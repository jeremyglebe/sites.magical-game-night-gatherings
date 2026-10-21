<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { X } from "@lucide/vue";
import ReviewCard from "./ReviewCard.vue";
import { imageURL } from "./review-format.js";
const props = defineProps({ selection: Object, state: Object });
const emit = defineEmits(["close", "inspect"]);
const dialog = ref(null),
  failed = ref(false);
const definition = computed(() => props.selection?.definition || {});
const card = computed(() => props.selection?.card);
const title = computed(
  () => props.selection?.title || definition.value.name || "Card",
);
const source = computed(() => imageURL(definition.value));
watch(
  () => props.selection,
  async (value) => {
    failed.value = false;
    await nextTick();
    if (value && !dialog.value?.open) dialog.value?.showModal();
    else if (!value) dialog.value?.close();
  },
  { immediate: true },
);
</script>
<template>
  <dialog
    ref="dialog"
    class="modal"
    aria-labelledby="review-card-title"
    @close="emit('close')"
  >
    <div class="modal-box max-w-4xl">
      <div class="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 id="review-card-title" class="text-xl font-semibold">
            {{ title }}
          </h2>
          <p class="mt-1 text-sm text-base-content/65">
            {{
              selection?.cards
                ? `${selection.cards.length} cards · owner review`
                : "Saved card reference"
            }}
          </p>
        </div>
        <button
          type="button"
          class="btn btn-sm btn-ghost"
          aria-label="Close card details"
          @click="dialog.close()"
        >
          <X class="size-4" />
        </button>
      </div>
      <div v-if="selection?.cards" class="flex flex-wrap gap-4">
        <p v-if="!selection.cards.length" class="text-sm text-base-content/65">
          This zone is empty at this position.
        </p>
        <ReviewCard
          v-for="item in selection.cards"
          :key="item.id"
          :definition="item.definition"
          :card="item"
          reveal
          caption
          @inspect="(definition, card) => emit('inspect', definition, card)"
        />
      </div>
      <div v-else class="grid gap-6 sm:grid-cols-[minmax(160px,0.7fr)_1fr]">
        <div>
          <img
            v-if="source && !failed"
            :src="source"
            :alt="definition.name || 'Card'"
            width="300"
            height="419"
            class="w-full max-w-xs rounded-lg object-contain"
            @error="failed = true"
          />
          <p v-else class="rounded-lg bg-base-200 p-6 text-sm">
            No card image saved.
          </p>
        </div>
        <div class="space-y-4 text-sm">
          <p v-if="definition.mana_cost">{{ definition.mana_cost }}</p>
          <p v-if="definition.type_line" class="font-semibold">
            {{ definition.type_line }}
          </p>
          <p class="whitespace-pre-wrap leading-relaxed">
            {{
              definition.oracle_text ||
              "No Oracle text was saved for this card."
            }}
          </p>
          <p
            v-if="
              definition.power !== undefined ||
              definition.toughness !== undefined
            "
          >
            {{ definition.power ?? "—" }} / {{ definition.toughness ?? "—" }}
          </p>
          <p v-if="definition.loyalty !== undefined">
            Loyalty: {{ definition.loyalty }}
          </p>
          <template v-if="card"
            ><p class="text-base-content/65">
              {{
                [
                  card.tapped ? "Tapped" : "Untapped",
                  card.face_down && "Face down",
                  card.damage && `${card.damage} damage`,
                  ...Object.entries(card.counters || {}).map(
                    ([key, value]) => `${value} ${key}`,
                  ),
                ]
                  .filter(Boolean)
                  .join(" · ")
              }}
            </p>
            <p v-if="card.attached_to">
              Attached to
              {{
                state?.cards?.[card.attached_to]?.definition?.name ||
                card.attached_to
              }}
            </p>
            <p v-if="card.note" class="whitespace-pre-wrap">
              {{ card.note }}
            </p></template
          >
          <section class="space-y-3 border-t border-base-300 pt-4">
            <h3 class="font-semibold">Saved rulings</h3>
            <p v-if="!definition.rulings?.length" class="text-base-content/65">
              No rulings were saved for this card.
            </p>
            <p
              v-for="(ruling, i) in definition.rulings || []"
              :key="i"
              class="leading-relaxed"
            >
              {{
                typeof ruling === "string"
                  ? ruling
                  : [ruling.published_at, ruling.comment || ruling.text]
                      .filter(Boolean)
                      .join(" · ")
              }}
            </p>
          </section>
        </div>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button>Close card details</button>
    </form>
  </dialog>
</template>
