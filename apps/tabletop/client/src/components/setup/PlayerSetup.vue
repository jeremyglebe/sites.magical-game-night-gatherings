<script setup>
import { Trash2 } from "@lucide/vue";
defineProps({
  player: { type: Object, required: true },
  index: Number,
  layout: String,
  removable: Boolean,
  disabled: Boolean,
  jumpstart: Boolean,
  sideboarding: Boolean,
});
defineEmits(["remove", "faction"]);
</script>

<template>
  <fieldset
    class="fieldset min-w-0 gap-3 rounded-box border border-base-300 bg-base-200 p-4"
    :disabled="disabled"
  >
    <legend class="fieldset-legend text-sm">
      {{
        layout === "emperor"
          ? `${index < 3 ? "Team A" : "Team B"}${index % 3 === 1 ? " · Emperor" : " · General"}`
          : `Player ${index + 1}`
      }}
    </legend>
    <div class="grid gap-3 sm:grid-cols-2">
      <label class="grid gap-1"
        ><span class="label">Player name</span
        ><input
          v-model="player.name"
          class="input input-sm w-full"
          maxlength="100"
          required
      /></label>
      <label class="grid gap-1"
        ><span class="label">Controlled by</span
        ><select v-model="player.ai" class="select select-sm w-full">
          <option :value="true">AI · Codex</option>
          <option :value="false">Human · this browser</option>
        </select></label
      >
      <label v-if="jumpstart" class="grid gap-1">
        <span class="label">Faction</span>
        <select :value="player.faction" class="select select-sm w-full" @change="$emit('faction', $event.target.value)">
          <option value="plants">Plants</option>
          <option value="zombies">Zombies</option>
        </select>
      </label>
      <label class="grid gap-1"
        ><span class="label">Starting life</span
        ><input
          v-model.number="player.life"
          type="number"
          step="1"
          min="-100000"
          max="100000"
          class="input input-sm w-full"
          required
          :disabled="jumpstart"
      /></label>
    </div>
    <label v-if="!jumpstart" class="grid gap-1"
      ><span class="label">Card list JSON</span
      ><textarea
        v-model="player.deckJSON"
        rows="5"
        spellcheck="false"
        class="textarea textarea-sm w-full font-mono"
        placeholder='[{"name":"Plains","count":24}, …]'
        required
      /><span class="text-xs text-base-content/60"
        >An array of card definitions, including card counts and saved Oracle
        text.</span
      ></label
    >
    <label v-if="!jumpstart && sideboarding" class="grid gap-1">
      <span class="label">Sideboard JSON (optional)</span>
      <textarea v-model="player.sideboardJSON" rows="4" spellcheck="false" class="textarea textarea-sm w-full font-mono" placeholder='[{"name":"Naturalize","count":2}, …]' />
      <span class="text-xs text-base-content/60">Extra cards available between games. Leave empty for no sideboard.</span>
    </label>
    <details v-if="player.ai" class="collapse collapse-arrow rounded-none">
      <summary class="collapse-title min-h-0 py-2 pl-0 pr-6 text-xs">
        Model and reasoning
      </summary>
      <div class="collapse-content grid gap-3 px-0 sm:grid-cols-2">
        <label class="grid gap-1"
          ><span class="label">Model</span
          ><input
            v-model="player.model"
            spellcheck="false"
            class="input input-sm w-full"
            required
        /></label>
        <label class="grid gap-1"
          ><span class="label">Reasoning</span
          ><select
            aria-label="Reasoning"
            v-model="player.reasoning"
            class="select select-sm w-full"
          >
            <option
              v-for="level in ['low', 'medium', 'high', 'xhigh', 'max']"
              :key="level"
              :value="level"
            >
              {{ level }}
            </option>
          </select></label
        >
      </div>
    </details>
    <button
      v-if="!jumpstart"
      type="button"
      class="btn btn-sm btn-ghost justify-self-end"
      :disabled="!removable || disabled"
      @click="$emit('remove')"
    >
      <Trash2 class="size-3.5" /> Remove player
    </button>
  </fieldset>
</template>
