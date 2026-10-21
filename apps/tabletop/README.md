# Tabletop App

The local Magic playtesting application: a Vue interface, a Node service, independent Codex players, and saved games. It shares this repository with the **Catalogue Site**, but it has its own client build and runtime. The catalogue has its own Vue + daisyUI workspace in `apps/catalogue/`, sourced from the repository's `formats/`, `boxed-sets/`, `rules/`, and other Markdown content. The tabletop reads selected catalogue rules as references; it does not build or publish the catalogue.

The app records and displays physical game actions. Players interpret the rules themselves. The coordinator delivers explicit handoffs without making game decisions. The browser is optional: the same Node service supports watched games, human participation, and headless AI playtests.

## Run it

Run these commands **from the repository root**, using Node 24.5 or newer:

```bash
npm ci
npm run tabletop:build
npm run tabletop:start
# http://127.0.0.1:5180/
```

For AI players, verify an existing Codex login with `npx --no-install codex login status`. `npm run playtest:rules` explicitly refreshes the local Comprehensive Rules copy. The application also includes its basic rules guide and table-control guide. No API key or connection to a desktop app's private endpoint is required.

`npm run playtest` remains the build-and-start shortcut. Existing `playtest:*` commands remain available for scripts and familiar workflows.

| Root command | Purpose |
| --- | --- |
| `npm run tabletop:build` | Compile Vue and daisyUI into the app's ignored `dist/` directory. |
| `npm run tabletop:start` | Run the Node host on `127.0.0.1:5180`, serving the compiled client and API. |
| `npm run tabletop:dev` | Run Vite with hot reload on `127.0.0.1:5183`; proxy API and avatar requests to the Node host. |
| `npm run tabletop:review` | Run the read-only recording viewer on `127.0.0.1:5181/games`. |
| `npm run tabletop:test` | Run tabletop tests using fake model workers. |
| `npm run playtest` | Build the client and start the local app. |

For client development, run `tabletop:start` in one terminal and `tabletop:dev` in another. To use another backend, set `TABLETOP_API_URL`, for example:

```bash
TABLETOP_API_URL=http://127.0.0.1:5190 npm run tabletop:dev
```

The Vite proxy handles the local API's origin checks. It does not create a second game coordinator. Run an independent Node host with a different `--directory` and `--port` when testing changes that should not affect an existing game.

## Where code belongs

```text
apps/tabletop/
├── client/
│   ├── index.html                 # Small Vite entry document
│   └── src/
│       ├── App.vue                # Shared app shell and navigation
│       ├── main.js                # Vue/router entry
│       ├── theme.css              # Tailwind + daisyUI theme
│       ├── pages/                 # Route composition
│       ├── components/            # Focused, feature-specific Vue UI
│       │   ├── table/             # Boards, hands, zones, card inspector, actions
│       │   ├── chat/              # Conversation, thinking state, draft composer
│       │   ├── setup/             # Match and player setup
│       │   └── review/            # Saved decks, conversation, feedback, inspection
│       ├── composables/           # Reactive client state and request lifecycle
│       └── lib/                   # Client API and small shared helpers
├── server/                        # Node host, table service, coordinator, CLI/MCP
├── shared/                        # Browser-safe projection, replay, and schema code
├── docs/operations.md             # Complete gameplay/hosting/MCP reference
├── vite.config.mjs                # Independent client build and development proxy
├── package.json                   # Tabletop workspace dependencies and commands
└── dist/                         # Generated client output; ignored by Git
```

The routes are:

- `/`: live table, match setup, human controls, chat, and run status.
- `/games`: saved-game library with player/title search and completion filters.
- `/games/:id`: recorded table and conversation, full starting decks, and player feedback.

`pages/` composes screens. Keep reusable UI and interaction details in components; keep network ownership, subscriptions, cleanup, and reactive state in composables. Vue owns the rendered DOM. The pointer-drag helper may manage its pointer session, but it does not render a second UI inside Vue.

Standard controls use daisyUI classes: buttons, inputs, selects, chat bubbles, badges, tabs, and native dialog modals. `theme.css` defines the shared palette. Game-specific board geometry, card rotation, drag feedback, and resizable layout can use focused custom styles where needed. Keep those styles with the component that owns the behavior instead of adding a second global theme or broad reset.

## Boundaries to preserve

- **Node owns the game.** `server/table.mjs` validates and applies atomic action batches. Client previews are drafts, never the authoritative state. Submitting uses the observed revision and the existing stale-write checks.
- **Private views stay private.** Human clients use the entered seat's filtered view; spectator clients use public state. Closing or switching a seat clears its private data and inspectors. The owner recording viewer is deliberately separate and includes private cards.
- **Coordination is ordinary code.** `server/coordinator.mjs` schedules one independent player conversation at a time. Only explicit priority/turn handoffs wake the next player. It does not interpret Magic rules or invent actions.
- **Shared modules stay portable.** `shared/` contains pure preview/move helpers, replay reconstruction, reveal snapshot handling, the survey schema, and the browser pointer helper. Avoid Node-only imports in modules consumed by the client. Backend wrappers may re-export a shared implementation to preserve internal imports.
- **Saved data does not move with the source.** Root commands keep `.playtest/` at the repository root. It contains private sessions, player workspaces, rules copies, and automatic recordings. It is ignored by Git and excluded from catalogue publishing. Do not migrate, reset, or seed an existing game as part of a UI change.
- **The catalogue has its own build.** `tabletop:build` writes only `apps/tabletop/dist/`. The Vue catalogue and GitHub Pages commands retain their separate workflow. Do not publish tabletop assets or private game recordings through the catalogue.

## Verify a change

Run the focused tests for changed behavior while implementing, then the tabletop test suite and build:

```bash
npm run tabletop:test
npm run tabletop:build
```

Check the affected route in the browser. For changes to human actions, use an isolated test match and verify queue/undo/send, stale-state behavior, and private views. For recording changes, verify replay and the original saved decks without running model players. A UI refactor should not need paid model calls.

For catalogue changes, use the catalogue's build and source rules in the root `AGENTS.md`. Rebuilding the tabletop does not validate catalogue publishing.

See [operations](docs/operations.md) for complete setup, headless play, model configuration, human controls, saved recordings, surveys, rules sources, MCP connection examples, action semantics, and persistence details.
