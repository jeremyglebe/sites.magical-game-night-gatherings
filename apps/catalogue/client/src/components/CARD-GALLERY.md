# Card gallery components

`CardGallery.vue` renders any array of saved Scryfall card objects as image-only tiles. Card names, costs, notes, badges, and other metadata stay in the optional details modal rather than appearing below each image. It makes no card API requests; image URLs are loaded by the browser. No research dataset or faction rules are imported by the component.

```vue
<CardGallery :cards="cards" />
<CardGallery :cards="cards" :searchable="false" :filterable="false"
  :sortable="false" :show-details="false" :page-size="0" />
<CardGallery v-model:filters="filters" v-model:page="page"
  :cards="cards" :groups="groups" :factions="factions" :metadata="describeCard" />
```

- `searchable`, `filterable`, `sortable`, `showDetails`: independent flags, default `true`. Hidden search/filter controls **do not apply stale filters**. `showDetails=false` renders noninteractive cards and omits the dialog.
- `pageSize`: defaults to 24; zero disables pagination. `v-model:page` is optional. Out-of-range page numbers are clamped for display.
- `v-model:filters`: optional `{query, faction, group, color, kind, mana, featured, sort}`. Defaults are exported as `DEFAULT_FILTERS` from `card-gallery.mjs`. User changes reset the page; URL/history persistence belongs to the consuming page.
- `groups`: optional `[{id, label, faction?}]`; `factions`: optional `[{id, label, icon?}]`. `groupLabel`/`allGroupsLabel` customize labels.
- `metadata(card)`: optional adapter returning `{groups:[], factions:[], featured, badge, note, roles:[], manaNote, caution}`. Defaults to `card.gallery`, then `card.research`, then `{}`. A nonempty `factions` array explicitly assigns faction membership and takes precedence over group-derived factions. Without an explicit assignment, group membership implies its configured faction. This lets research tags describe a card without overriding its editorial alignment. No faction or crossover rules are built in.
- `showFeatured`: defaults to false; enables a featured filter and sort. `featuredLabel`, `featuredSortLabel`, and `defaultSort` customize them. Sorts: `name`, `mana-asc`, `mana-desc`, `featured` (when enabled).
- `resultDescription`: optional text above results.
- `card-caption` is an optional scoped slot receiving `{card, metadata}` **outside** the image button. It renders nothing by default; use it only when a consuming page explicitly needs content under cards. `details` receives the same values and replaces only the modal notes section, preserving Oracle and saved-card details.
- `select` emits the selected card when the built-in details dialog opens.

`CardDetailsModal.vue` also works independently with `v-model:open`, `card`, optional `metadata`, `groups`, and `rulings`. All Oracle faces, available images, printing fields, saved legalities, and complete supplied JSON are available. Saved rulings may be `card.rulings`, an array passed through `rulings`, or `{data:[]}`. Missing rulings are identified as missing; nothing is fetched or inferred. Richer Scryfall snapshots automatically expose more details without changing the gallery.

`CardGalleryItem.vue` contains the image interaction. A fine mouse pointer tilts and slightly lifts the card with the pointer position; the stationary wrapper keeps its hit area stable. Touch keeps a static card that opens on tap when interactive, and reduced-motion preferences disable transforms/transitions. Interactive cards are native buttons with card-name labels and visible keyboard focus. With `showDetails=false`, tiles have no click action or keyboard tab stop. Pointer tilt does not change card data or trigger requests. Continuous pointer tracking and its scoped interaction CSS live together in this small component; the pointer handler only updates two rotation custom properties.

`CardImage.vue` provides a lazy image with accessible name/type fallback when the remote image fails. The components use the catalogue's existing daisyUI light/dark themes.
