# Tabletop experiment

A shared Magic table for AI players, with a small spectator page. Players interpret the rules and apply effects themselves. The table stores their actions, keeps private views, and displays the public battlefield.

This is an experiment for the catalogue's casual formats and prebuilt boxes. It does not assume that every box is humorous, relax deck-construction requirements, or prescribe box-specific rules. Custom exceptions must come from the chosen box's documented rules.

## Start here

Use Node 24.5 or newer, from the repository root:

```bash
npm ci
npm run playtest:demo
```

Open **http://127.0.0.1:5180/** in a browser on the machine running the server. This runs a short, reproducible demonstration through two separate MCP processes. It uses staged opening hands, displays casts and combat, and leaves the final position open. The demonstration is scripted; it does not use a model or establish anything about deck balance.

The console prints the saved session path. Press Ctrl+C to stop the server. To resume that position, pass its path:

```bash
npm run playtest:serve -- --session .playtest/demo-TIMESTAMP.json
```

To create a fresh, shuffled table for actual AI players:

```bash
npm run playtest:serve
```

That uses `precons.json` and saves `.playtest/table.json`. If the file exists, it resumes it instead of replacing it. Choose another session path for another game:

```bash
npm run playtest:serve -- --session .playtest/game-02.json --setup experiments/tabletop/precons.json
```

Both commands accept `--port 5181` if 5180 is occupied. The demo also accepts `--step-ms 1500` for slower playback, or `--step-ms 0 --once` for a quick check that exits. A demo always needs a new session filename.

The server runs separately from VitePress. GitHub Pages can host the catalogue but cannot run this Node process. In a cloud workspace, `127.0.0.1` refers to that workspace; viewing the live table from another machine needs the workspace's port-forwarding facility. No public deployment is included here.

## What is included

- Persistent shared table, one authenticated connection per player, and a spectator view with public information.
- Library, hand, battlefield, stack, graveyard, exile, command zone, sideboard, and custom zones. Libraries shuffle privately; hands show only to their owner unless revealed.
- Explicit card movement, draws, peeking/revealing, tap state, face-down state, counters, marked damage, attachments, controller changes, life, mana, turn and priority markers, tokens, and triggered/activated ability entries on the stack.
- Atomic action batches and revision checks. A stale action is rejected rather than overwriting another player's move.
- Four MCP tools: `observe_table`, `act`, `read_card`, and `read_reference`.
- A watch-only page with card images, two battlefield rows per player, counts, life, stack, and small public-zone lists. No human play controls.
- A saved move log with the acting seat's explanation. Rules corrections can be made through ordinary actions and explained in a public note.

There is no automated legality, effect resolution, turn progression, trigger handling, cleanup, loss detection, or AI opponent bundled into the server. It does not call a model API, schedule model turns, measure model costs, or run match batches. These tools are ready for separate model sessions or a future match driver to use.

## The two starting decks

The fixtures are the **white and green Game Night 2018 preconstructed decks**, 60 cards each. Their contents match [Wizards' published decklists](https://magic.wizards.com/en/news/announcements/introducing-magic-game-night-and-updated-gift-pack-2018-08-27). They are convenient starting fixtures, not a new proposed box and not an assertion of a balanced two-player matchup.

All 47 distinct names, Oracle text, types and image URLs were checked through the project's [Scryfall MCP](https://github.com/cryppadotta/scryfall-mcp), version 0.1.1, on 2026-10-19. Images use Game Night printings where available and other Scryfall printings otherwise. `precons.json` keeps the quantities and printing IDs. These official lists retain their original duplicates; that does not change the owner's preference for singleton custom builds.

Card text is cached in the fixture, so starting a game does not require Scryfall requests. The browser still fetches card images; a name placeholder appears if an image cannot load. For new deck imports, use Scryfall MCP to verify the names, text and printings.

## Connect two players

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

The host or match driver must alternate model work at priority/decision boundaries. The MCP server itself does not wake a model when priority changes. Give each model a separate conversation and preserve it between decisions. A useful starting instruction is:

> You are the player assigned to this MCP connection. Play ordinary two-player Magic with the supplied precon, starting at 20 life. Player p1 starts. Use the current London mulligan; there is no multiplayer free mulligan in this two-player trial. Read the table before acting, draw your opening seven during setup, and coordinate completion of setup using public notes. Read exact card text when needed. The table does not enforce or resolve the rules. Apply costs, effects, triggers, state-based actions and cleanup yourself, using the normal timing and priority rules. Do not inspect hidden information without a rule that permits it. Stop for your opponent's decisions and response opportunities. Record attacks, blocks, targets and temporary effects in public card/table notes. Explain actions briefly. If a rule is uncertain, look it up or flag the uncertainty instead of silently inventing a ruling. Report a result only when the game's rules establish one.

For a custom format, replace the setup instructions with its exact complete ruleset and the box's documented overrides. Do not silently mix versions. A Hive/Horde controller can be another seat, and shared piles can be custom zones; the format still determines how they operate.

Copy `precons.json` for another setup: each player has an `id`, `name`, `life`, and `deck` array. Each deck entry has a `count`, `name`, `type_line`, `oracle_text`, optional `mana_cost`, `power`/`toughness`, `scryfall_id`, and Scryfall `image_url`. Set `token: true` on physical token entries in a Horde library. Configure starting contents before creating the session; editing the setup file does not replace an existing saved table.

## Operations and conventions

`observe_table` returns the current revision, your hand, visible public objects, counts, markers and recent events. Image URLs are omitted from player observations to save context; the spectator receives them. `read_card` supplies the imported text for a visible card. It refuses concealed identities. Retain card text in the pilot's context rather than fetching unchanged text every move.

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

Add repository-relative Markdown paths to the setup's `references` array before creating the session, for example:

```json
"references": ["formats/horde/variants/classic.md"]
```

`read_reference` lists configured paths, searches one with `query`, or returns exact text with `start`/`count` (up to 120 lines at a time). VitePress's shared Markdown includes are expanded first so turn procedures are present. Line numbers refer to this expanded reference. Large rulesets remain available in full through successive reads; they are not replaced by summaries.

The current reader covers configured catalogue rules under `formats/`, `rules/` and `boxed-sets/`. It does not yet download or index the Comprehensive Rules. Use a rules source through the pilot's host when needed. The starting precon fixture has no custom format reference configured.

## Persistence and validation

Sessions, credentials and private logs live under ignored `.playtest/`; keep them out of the published site. The server binds to loopback. Each accepted batch is saved before the reply. A lock prevents two server processes from opening the same file. If a process was forcibly killed, remove its `.lock` only after confirming no server is using that session.

Run:

```bash
npm run playtest:test
```

Tests cover private views and card text, hidden-handle changes, atomic failures, stale revisions, manual markers, tokens/abilities, complete reference includes, deck contents, real MCP round trips, persistence/recovery, and the scripted precon demonstration. No paid model calls are made.

For our later model experiment, keep rules mistakes separate from strategic quality. Record model/settings, the two lists, starting seat, completed or abandoned games, corrections, and observed token usage/cost. Swap seats and repeat before drawing conclusions about the decks. A coherent casual opponent is useful even if it makes weak strategic choices; repeated illegal actions are a different problem. No model-performance or balance findings have been collected yet.
