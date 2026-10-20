# Local Magic playtester

A local Node application with an optional browser table, independent Codex CLI players, and saved game logs. It is separate from the published catalogue. Players interpret Magic and the selected format rules; the table stores their physical actions, filters private information, and displays the public game.

The data model and coordinator accept any positive player count, subject to machine and account capacity. The viewer supports one through six players. Its six-seat team layout keeps three seats on each side, with the middle seats facing one another. Choosing that layout does not apply Emperor rules; supply the actual format reference when it exists.

This is for the catalogue's casual formats and prebuilt boxes. Box-specific exceptions must come from the chosen box's documented rules. There is no automated legality, priority adjudication, effect resolution, trigger handling, cleanup, or winner detection.

## Start here

Use Node 24.5 or newer and an existing Codex ChatGPT login. `npm ci` installs the pinned project-local Codex CLI (0.163.0), leaving your global installation unchanged. From the repository root:

```bash
npm ci
npx --no-install codex login status
npm run playtest:rules
npm run playtest
```

Open **http://127.0.0.1:5180/**. Add players, choose decks and model settings, then create the match. It starts paused. Start runs queued decisions; Step runs one player decision; Pause and Stop cancel active work. Reopening the application restores the saved match paused. Reported finished matches stay finished. Use Run limits to adjust concurrency, decision count, decision timeout, and an optional output-token limit.

The proposed default is **gpt-6-luna, high reasoning, standard speed**. Every player can use a different model or reasoning setting. The app uses its pinned project-local CLI because the older global CLI tested here rejected current models. Model availability still depends on your account: an unavailable model pauses with an error, with no silent substitution. Choose a supported model when creating a match. `TABLETOP_CODEX_BIN` can select a different installed binary; it must support `--ignore-user-config` and `--ignore-rules`. No API key or desktop-app private endpoint is used.

The two built-in decks are fixtures for getting started. Import a setup JSON for custom lists, player counts beyond six, format references, or other starting state. Saved games live under ignored `.playtest/`, excluded from catalogue builds. The browser only shows public information; inspect a card or a player's board for details.

## Running without the viewer

The same application runs without opening a browser:

```bash
npm run playtest:headless -- --setup experiments/tabletop/precons.json --run
```

That example uses the default model, so choose explicit models in a copied setup if your CLI does not support it. Omit `--run` to load paused. Use `--directory .playtest/trial-02` to keep an independent run, and `--port 5181` when another app is using 5180. With no `--setup`, the most recent match in that directory resumes. Ctrl+C saves and closes the host.

A setup may use `deck: "white"` or `"green"`, or the full deck definitions described below. Each player accepts `model`, `reasoning`, and `ai` (default true). A manual seat gets no CLI worker; it can be controlled by a separately configured MCP host. `limits` accepts `maxConcurrent` (default 4), `maxDecisions` (2000), `decisionTimeoutMs` (120000), and optional `maxOutputTokens`. These are stopping thresholds; an already-running call can finish above a token threshold. Token counts are reported usage, not an estimate of your subscription percentage.

## How players are coordinated

Each seat has its own Codex conversation and working directory. Subsequent decisions resume that exact session ID. Player prompts contain only that seat's table projection and event history. Managed workers receive one fixed-identity tabletop MCP connection; shell, file inspection, browser, unrelated MCP servers, and cross-player tools are disabled. The launcher uses the existing CLI login while ignoring user configuration and project instructions for these workers.

Every accepted table revision queues an update for each AI seat, processed in order with at most one active call per seat. Idle seats make no model calls and perform no polling. Updates describe historical events and include the current visible table; a player must re-observe before writing. Revision checks reject stale writes, and decision IDs reject writes from canceled or completed workers.

A notification is not permission or an obligation to act. `complete_decision` with `no_op` acknowledges it quietly and produces no table event or game-log entry. An actual `pass` action changes the priority marker, records the handoff, and wakes players even if no cards moved. Players determine when passing or responding is legal. They also control how physical actions are batched so opponents get response opportunities. If everyone becomes idle, the coordinator reports that instead of inventing moves. Errors, timeouts, and requests for help pause the run. After resolving a help request, Start or Step explicitly asks that player to reconsider the latest state in the same conversation, even if no game action has occurred. The coordinator never retries help requests on its own.

Seven MCP tools are available: `observe_table`, `act`, `read_card`, `read_reference`, `read_events`, `read_rules`, and `complete_decision`. Human board editing and an automated game reviewer are not included.

## Saved logs

Each match folder contains `session.json`, coordinator/configuration in `match.json`, pinned Comprehensive Rules when available, and per-player workspaces. Beside the session are:

- `session.json.game.md`: readable starting lists, selected format references, actual actions, explanations, and reported result.
- `session.json.game.json`: starting state and concrete revision deltas, including random shuffle outcomes, for reconstructing the game.

Use the viewer's download buttons, or take these files directly to a separate Codex chat for analysis. The app does not run a reviewer or generate findings. These are owner logs and include hidden cards; they are never supplied to opposing players. Quiet acknowledgments are omitted. Keep logs and session credentials out of the published website.

## Scripted demonstration and standalone MCP table

For a demonstration with no model calls:

```bash
npm run playtest:demo
```

It uses staged opening hands and two separate MCP processes, displays scripted casts/combat, and leaves the final position open. It demonstrates plumbing, not deck balance or model competence. The console prints the session path. `--step-ms 1500` slows playback; `--step-ms 0 --once` runs and exits. A demo requires a new session filename.

The lower-level table service remains available for externally managed players:

```bash
npm run playtest:serve -- --session .playtest/table.json --setup experiments/tabletop/precons.json
```

It resumes an existing session rather than replacing it, and accepts `--port`. It does not launch Codex players. Both services bind to loopback. GitHub Pages hosts the catalogue and cannot run this local Node application.

## The two starting decks

The fixtures are the **white and green Game Night 2018 preconstructed decks**, 60 cards each. Their contents match [Wizards' published decklists](https://magic.wizards.com/en/news/announcements/introducing-magic-game-night-and-updated-gift-pack-2018-08-27). They are convenient starting fixtures, not a new proposed box and not an assertion of a balanced two-player matchup.

All 47 distinct names, Oracle text, types and image URLs were checked through the project's [Scryfall MCP](https://github.com/cryppadotta/scryfall-mcp), version 0.1.1, on 2026-10-19. Images use Game Night printings where available and other Scryfall printings otherwise. `precons.json` keeps the quantities and printing IDs. These official lists retain their original duplicates; that does not change the owner's preference for singleton custom builds.

Card text is cached in the fixture, so starting a game does not require Scryfall requests. The browser still fetches card images; a name placeholder appears if an image cannot load. For new deck imports, use Scryfall MCP to verify the names, text and printings.

## Connect externally managed players

Run the table server first. Each player gets **one** stdio MCP connection. For player one:

```bash
node experiments/tabletop/mcp.mjs --seat p1 --session .playtest/table.json --url http://127.0.0.1:5180
```

Player two uses the same command with `--seat p2`. These are MCP server commands, so start them through an MCP-capable host rather than expecting an interactive terminal prompt.

A generic MCP host configuration for player one is:

```json
{
  "mcpServers": {
    "game-night-table": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/REPO/experiments/tabletop/mcp.mjs",
        "--seat", "p1",
        "--session", "/ABSOLUTE/PATH/TO/REPO/.playtest/table.json",
        "--url", "http://127.0.0.1:5180"
      ]
    }
  }
}
```

Use a separate host/model context for player two, changing only `p1` to `p2`. Configuration syntax varies by host; the executable and arguments are the same. Both player connections point to the same running table, and each connection's seat stays fixed. Do not give one pilot both player connections when testing hidden-information play.

For a blind experiment, expose only that seat's tools and the chosen rules/card references to its model. The session file contains the complete table and connection tokens; it is administrator data, not model input. A model with unrestricted shell access to this workspace could read it. This local prototype assumes cooperative players, just as a physical table does: explicit `peek` operations are available for card effects, and the players must justify using them.

For the lower-level `playtest:serve` service, the external host must arrange model work at decision boundaries. The full `playtest` application provides this coordination. In either case, give each player a separate conversation. A useful external-player starting instruction is:

> You are the player assigned to this MCP connection. Play ordinary two-player Magic with the supplied precon, starting at 20 life. Player p1 starts. Use the current London mulligan; there is no multiplayer free mulligan in this two-player trial. Read the table before acting, draw your opening seven during setup, and coordinate completion of setup using public notes. Read exact card text when needed. The table does not enforce or resolve the rules. Apply costs, effects, triggers, state-based actions and cleanup yourself, using the normal timing and priority rules. Do not inspect hidden information without a rule that permits it. Stop for your opponent's decisions and response opportunities. Record attacks, blocks, targets and temporary effects in public card/table notes. Explain actions briefly. If a rule is uncertain, look it up or flag the uncertainty instead of silently inventing a ruling. Report a result only when the game's rules establish one.

For a custom format, replace the setup instructions with its exact complete ruleset and the box's documented overrides. Do not silently mix versions. A Hive/Horde controller can be another seat, and shared piles can be custom zones; the format still determines how they operate.

Copy `precons.json` for another setup: each player has an `id`, `name`, `life`, and `deck` array. Each deck entry has a `count`, `name`, `type_line`, `oracle_text`, optional `mana_cost`, `power`/`toughness`, `scryfall_id`, and Scryfall `image_url`. Set `token: true` on physical token entries in a Horde library. Configure starting contents before creating the session; editing the setup file does not replace an existing saved table.

## Operations and conventions

`observe_table` returns the current revision, your hand, visible public objects, counts, markers and recent events. A zone’s `count` is its actual number of cards; `cards` lists only visible objects and `hidden_count` counts the omitted objects. A 60-card library with `cards: []` is a loaded, concealed deck. Draw actions do not require card IDs or inspecting its contents first. Image URLs are omitted from player observations to save context; the spectator receives them. `read_card` supplies the imported text for a visible card. It refuses concealed identities. Retain card text in the pilot's context rather than fetching unchanged text every move.

`act` takes the revision you just observed, a short reason, and 1–30 actions. A failed batch changes nothing. When another connection has acted, read the new state and reconsider the move. Do not blindly retry an old decision.

```json
{
  "revision": 0,
  "reason": "Draw my opening hand.",
  "actions": [{ "type": "draw", "count": 7 }]
}
```

| Action | Main fields and meaning |
| --- | --- |
| `draw` | `count`; optional `from`/`to` zones; defaults to your library and hand. Moves at most the cards available; players handle failed-draw consequences. |
| `move` | Visible `card` ID, destination `to`, `position: "top"` or `"bottom"` (default bottom). |
| `shuffle` | `zone`, default your library. |
| `peek` | `zone`, `count`; exposes the top cards only to your seat. Use only when the rules allow it. |
| `reveal` | `card`; omit `to` for a public reveal, or give a list of player IDs for a restricted reveal. |
| `card` | `card`, `set`: `tapped`, `face_down`, `face`, `damage`, `counters`, `controller`, `attached_to`, `note`. |
| `player` | `player` (default your seat), `set`: `life`, `counters`, `mana`, `note`. |
| `pass` | `next`: player ID. Record an explicit priority handoff without automatically resolving anything. |
| `turn` | `set`: `number`, `active`, `priority` (seat or null), `phase`. These are markers only. |
| `token` | `definition`, optional `count`, `owner`, `to`; creates a physical token representation. |
| `remove_token` | `card`; removes a token when players apply the appropriate rule. |
| `stack_item` | `definition` with a name and rules text; puts an ability at the top of the stack. Targets/source can be recorded in its text or note. |
| `remove_stack_item` | `card`; removes an ability after manual resolution or countering. |
| `zone` | New `id`, `visibility` (`public`, `owner`, `hidden`), optional `owner`. |
| `note` | Public `text`, for agreements, declared choices or corrections. |
| `result` | `winners` (player IDs, or `[]` for a draw), `explanation`. The viewer labels it as a player report. |

Top is index zero in every zone, including the stack. Cast a spell with `move` to `stack` and `position: "top"`. On resolution, explicitly move it to the appropriate zone. Add triggered and activated abilities with `stack_item`; they are not ordinary deck cards.

Moving between zones does not perform Magic's new-object resets. Explicitly clear damage, counters, tap state, attachments, face-down state and temporary notes as the rules require. Passing priority and changing the phase do not automatically resolve anything, untap permanents, empty mana pools, or remove damage. Counter/mana maps replace their entire previous maps. A counter is bookkeeping; it does not automatically modify a creature's displayed power or toughness.

For mulligans, move all hand cards back to the library, shuffle, draw seven, and bottom the required cards when keeping. There is deliberately no hard-coded mulligan policy. A hidden move or shuffle gives affected cards new IDs and clears temporary reveals, preventing a pilot from following old handles through a hidden library. Always use IDs from the latest view.

Face-down cards display as anonymous objects to other players and spectators. The `face` field is an annotation in this first version; automatic double-faced image switching and copy-characteristic displays are not implemented. Use explicit notes and exact card references for such cases, or choose simpler decks for initial trials.

Ability text, attachments and temporary notes can represent decisions without a full combat or continuous-effect engine. The spectator page displays the common zones; custom zones remain accessible through MCP, but do not yet get their own visual panel.

## Rules lookup

Format and box references are optional. Leaving them blank selects ordinary casual Magic with the supplied decks and starting state. Add repository-relative Markdown paths to the setup's `references` array when selecting a custom ruleset, for example:

```json
"references": ["formats/horde/variants/classic.md"]
```

`read_reference` lists configured paths, searches one with `query`, or returns exact text with `start`/`count` (up to 120 lines at a time). VitePress's shared Markdown includes are expanded first so turn procedures are present. Line numbers refer to this expanded reference. Large rulesets remain available in full through successive reads; they are not replaced by summaries.

The reference reader covers configured catalogue rules under `formats/`, `rules/` and `boxed-sets/`. Their expanded text is saved with the match so later source edits do not change its rules. The starting precon fixture has no custom format reference configured.

The first player prompt includes `quickstart.md`, with ordinary play and tool conventions. `read_rules` searches or reads the full official Comprehensive Rules by line range, keyword, or rule number. `npm run playtest:rules` explicitly downloads the current official TXT from Wizards; it is not refreshed during a game. The application pins a copy in each match folder. A later refresh affects new matches. Alternatively supply `--comprehensive-rules /absolute/path/to/ComprehensiveRules.txt` or `TABLETOP_COMPREHENSIVE_RULES`. When the full source is unavailable, the tool reports that instead of inventing a ruling. Card Oracle text comes from the imported Scryfall-verified definitions via `read_card`.

## Persistence and validation

Sessions, credentials and private logs live under ignored `.playtest/`; keep them out of the published site. The server binds to loopback. Each accepted batch is saved before the reply. A lock prevents two server processes from opening the same file. If a process was forcibly killed, remove its `.lock` only after confirming no server is using that session.

Run:

```bash
npm run playtest:test
```

Tests cover private views and event history, hidden-handle changes, atomic failures, stale/revoked decisions, separate conversations, queues and limits, saved logs/reconstruction, rules references, real MCP round trips, restart recovery, and the scripted precon demonstration. The test suite uses fake model runners and makes no paid model calls. Bounded live CLI checks are a separate manual integration step; they do not establish playing competence or deck balance.

For our later model experiment, keep rules mistakes separate from strategic quality. Record model/settings, the two lists, starting seat, completed or abandoned games, corrections, and observed token usage/cost. Swap seats and repeat before drawing conclusions about the decks. A coherent casual opponent is useful even if it makes weak strategic choices; repeated illegal actions are a different problem. No model-performance or balance findings have been collected yet.
