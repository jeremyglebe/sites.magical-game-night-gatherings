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

Open **http://127.0.0.1:5180/**. Add players, choose decks and model settings, then create the match. It starts paused with the starting player ready to prepare their hand. Start follows explicit player handoffs; Step runs one player decision; Pause and Stop cancel active work. Reopening the application restores the saved match paused. Reported finished matches stay finished. Use Run limits to adjust decision count, decision timeout, and an optional output-token limit. Only one AI player runs at a time.

The proposed default is **gpt-6-luna, high reasoning, standard speed**. Every player can use a different model or reasoning setting. The app uses its pinned project-local CLI because the older global CLI tested here rejected current models. Model availability still depends on your account: an unavailable model pauses with an error, with no silent substitution. Choose a supported model when creating a match. `TABLETOP_CODEX_BIN` can select a different installed binary; it must support `--ignore-user-config` and `--ignore-rules`. No API key or desktop-app private endpoint is used.

The two built-in decks are fixtures for getting started. Import a setup JSON for custom lists, player counts beyond six, format references, or other starting state. Saved games live under ignored `.playtest/`, excluded from catalogue builds. The browser only shows public information; inspect a card or a player's board for details.

## Running without the viewer

The same application runs without opening a browser:

```bash
npm run playtest:headless -- --setup experiments/tabletop/precons.json --run
```

That example uses the default model, so choose explicit models in a copied setup if your CLI does not support it. Omit `--run` to load paused. Use `--directory .playtest/trial-02` to keep an independent run, and `--port 5181` when another app is using 5180. With no `--setup`, the most recent match in that directory resumes. Ctrl+C saves and closes the host.

A setup may use `deck: "white"` or `"green"`, or the full deck definitions described below. Each player accepts `model`, `reasoning`, and `ai` (default true). A manual seat gets no CLI worker; it can be controlled by a separately configured MCP host when explicitly given control. `limits` accepts `maxDecisions` (2000), `decisionTimeoutMs` (120000), and optional `maxOutputTokens`. Legacy concurrency settings normalize to one when loading; live configuration cannot raise it. These are stopping thresholds; an already-running call can finish above a token threshold. Token counts are reported usage, not an estimate of your subscription percentage.

The **Plan usage** panel reads real remaining allowance and reset times through the installed CLI's documented `account/rateLimits/read` method. It launches a short-lived `codex app-server` reader without creating a conversation or running a model. Only the windows the account actually reports are shown. Reads are cached, refreshed about once a minute while running, and available through the Refresh button. Saved baselines show changes in percentage points since tracking began; old matches cannot recover usage from before that baseline. These are account-wide observations and include other Codex activity, including while a match is paused. They are not an exact charge for this game. A reset starts a new comparison, and a failed read retains the dated last successful snapshot.

Raw token counters remain under technical details. Resumed CLI turns report cumulative session totals, so each player's latest total replaces the previous one. Old overcounted totals are marked unavailable until that player next completes a decision. Tokens are not converted to a plan percentage or API price. See [Codex app-server rate limits](https://learn.chatgpt.com/docs/app-server#6-rate-limits-chatgpt) and [usage guidance](https://learn.chatgpt.com/docs/pricing).

## How players are coordinated

Each seat has its own Codex conversation and working directory. Subsequent decisions resume that exact session ID. Player prompts contain only that seat's table projection and event history. Managed workers receive one fixed-identity tabletop MCP connection; shell, file inspection, browser, unrelated MCP servers, and cross-player tools are disabled. The launcher uses the existing CLI login while ignoring user configuration and project instructions for these workers.

Ordinary table changes and public speech do not prompt any other player. `pass_priority` prompts only its named recipient; `pass_turn` does the same and updates the active-player, turn-number and phase markers. At most one CLI worker runs across the entire match. A handoff ends the current player's decision immediately, and the recipient starts after that worker exits. A handoff must be the final action in an `act` batch. Other players remain idle with no polling or model calls. The recipient receives their current filtered state and all visible events since their last decision, including public conversation. A compact public history of the current turn is also included. Revision checks reject stale writes, and decision IDs reject writes from canceled or completed workers.

Players group physical actions that need no intervening response, explain their sequence through `say` or a handoff's `message`, and explicitly ask for responses when needed. They interpret the rules and agreed shortcuts, including when a quiet phase can be skipped. Mandatory choices, triggers and response opportunities remain their responsibility. A player with nothing to add can immediately return priority with a short message. One multiplayer pass does not mean everyone passed. The coordinator never resolves spells, advances phases on repeated passes, or decides that a response is illegal. During setup, players coordinate each mulligan round through explicit declarations and handoffs; once everyone keeps, control returns to the starting player.

`complete_decision` is available for help, a finished game, or an exceptional stop without a handoff. A quiet `no_op` produces no table event or log entry, but it also does not select another player. Errors, timeouts and requests for help pause the run. When no recipient is pending, the operator can choose a player with **Give control**, then Start or Step. Recovery stays explicit; there are no automatic retry loops. Old broadcast queues migrate to a single pending player from the saved priority/active marker when a match is reopened, still paused.

Ten MCP tools are available: `observe_table`, `act`, `say`, `pass_priority`, `pass_turn`, `read_card`, `read_reference`, `read_events`, `read_rules`, and `complete_decision`. The viewer shows chronological public actions and attributed player speech, with an expandable full history. Human board editing and an automated game reviewer are not included.

## Saved logs

Each match folder contains `session.json`, coordinator/configuration in `match.json`, a pinned `BasicRules.txt`, pinned Comprehensive Rules when available, a `CardRulings.json` cache for older imported definitions, and per-player workspaces. Beside the session are:

- `session.json.game.md`: readable starting lists, selected format references, actual actions, attributed public speech, explanations, and reported result.
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

Card text and official card rulings are cached in the fixture, so playing does not require Scryfall requests. The 47 cards' rulings were checked through Scryfall MCP on 2026-10-20: 34 official rulings across 18 cards; 29 cards had no official rulings. `rulings_cache.status: "fetched"` with `rulings: []` distinguishes a checked-empty result from `"not_fetched"`. `read_card` returns these dated rulings and provenance when requested; routine observations and event history omit them. Existing matches can use a pinned local fallback by exact Scryfall ID without changing their recorded actions or exposing concealed cards. Custom imports without cached rulings remain explicitly unknown. For new imports or refreshes, use Scryfall MCP to verify names, Oracle text, printings and rulings, then save that data with the deck.

The browser still fetches card images; a name placeholder appears if an image cannot load.

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
| `say` | Public `text` attributed to the acting player. Does not wake other players. Also available as `say({revision,text})`. |
| `pass` | `next`: player ID; optional public `message`. Hand off priority and complete this decision without automatically resolving anything. Also available as `pass_priority({revision,next,message})`. Must be last in a batch. |
| `pass_turn` | `next`: player ID; optional public `message`, `number` (default current + 1), `phase` (default Untap). Update turn/priority markers and hand off. Also available as `pass_turn({revision,next,message,number,phase})`. Must be last in a batch. |
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

For a mulligan, move all hand cards back to the library, shuffle, draw the starting hand size (normally seven), and bottom the required cards. Follow the basic guide for declaration rounds and any free multiplayer mulligan. There is deliberately no hard-coded mulligan policy. A hidden move or shuffle gives affected cards new IDs and clears temporary reveals, preventing a pilot from following old handles through a hidden library. Always use IDs from the latest view.

Face-down cards display as anonymous objects to other players and spectators. The `face` field is an annotation in this first version; automatic double-faced image switching and copy-characteristic displays are not implemented. Use explicit notes and exact card references for such cases, or choose simpler decks for initial trials.

Ability text, attachments and temporary notes can represent decisions without a full combat or continuous-effect engine. The spectator page displays the common zones; custom zones remain accessible through MCP, but do not yet get their own visual panel.

## Rules lookup

Format and box references are optional. Leaving them blank selects ordinary casual Magic with the supplied decks and starting state. Add repository-relative Markdown paths to the setup's `references` array when selecting a custom ruleset, for example:

```json
"references": ["formats/horde/variants/classic.md"]
```

`read_reference` lists configured paths, searches one with `query`, or returns exact text with `start`/`count` (up to 120 lines at a time). VitePress's shared Markdown includes are expanded first so turn procedures are present. Line numbers refer to this expanded reference. Large rulesets remain available in full through successive reads; they are not replaced by summaries.

The reference reader covers configured catalogue rules under `formats/`, `rules/` and `boxed-sets/`. Their expanded text is saved with the match so later source edits do not change its rules. The starting precon fixture has no custom format reference configured.

Three separate local references serve different purposes:

- `basic-rules.txt`: the actual game guide, covering casting, instants, responses, the stack, abilities, combat, turns, setup and common terms. It is an application-authored plain-text adaptation of [Wizards' 2013 Basic Rulebook](https://media.wizards.com/images/magic/resources/rules/EN_MTGM14_PrintedRulebook_LR.pdf), checked against the September 25, 2026 Comprehensive Rules. Source and change notes identify updated procedures; it is not presented as a new official Wizards publication.
- `quickstart.md`: table/MCP controls, public communication, batching, handoffs and manual state bookkeeping.
- `ComprehensiveRules.txt`: the full official reference for targeted questions that the basics and card-specific information do not answer.

The complete basic guide is supplied once to each separate player conversation, including older sessions that have not received it. Each seat stores the delivered session ID and content hash; normal resumes do not resend it. Failed calls do not mark delivery complete. The table guide is included on the initial prompt, with essential handoff instructions repeated on resumes. Players are instructed to use their supplied basic guide for routine play, consult `read_card` for exact Oracle text and cached rulings, and use a targeted Comprehensive Rules search only when uncertainty remains.

`read_rules` sources are `basic`, `quickstart`, and `comprehensive`. All support case-insensitive keyword search and numbered, paginated passages; `comprehensive` also supports rule-number lookup. These tools read local plaintext and make no web requests. The application pins its basic guide and full rules per match, so source updates apply to new games rather than changing a game in progress.

`npm run playtest:rules` explicitly downloads the official TXT linked from [Wizards' rules page](https://magic.wizards.com/en/rules) into `.playtest/rules/ComprehensiveRules.txt`. The adjacent `.txt.json` records the source URL, download time, effective date, byte count and SHA-256. The application pins a copy in each match folder. A later explicit refresh affects new matches; it does not change a running game's rules. Alternatively supply `--comprehensive-rules /absolute/path/to/ComprehensiveRules.txt` or `TABLETOP_COMPREHENSIVE_RULES`. When the full source is unavailable, the tool reports that instead of inventing a ruling. Card Oracle text comes from the imported Scryfall-verified definitions via `read_card`.

## Persistence and validation

Sessions, credentials and private logs live under ignored `.playtest/`; keep them out of the published site. The server binds to loopback. Each accepted batch is saved before the reply. A lock prevents two server processes from opening the same file. If a process was forcibly killed, remove its `.lock` only after confirming no server is using that session.

Run:

```bash
npm run playtest:test
```

Tests cover private views and event history, hidden-handle changes, atomic failures, stale/revoked decisions, separate conversations, queues and limits, saved logs/reconstruction, rules references, real MCP round trips, restart recovery, and the scripted precon demonstration. The test suite uses fake model runners and makes no paid model calls. Bounded live CLI checks are a separate manual integration step; they do not establish playing competence or deck balance.

For our later model experiment, keep rules mistakes separate from strategic quality. Record model/settings, the two lists, starting seat, completed or abandoned games, corrections, and observed token usage/cost. Swap seats and repeat before drawing conclusions about the decks. A coherent casual opponent is useful even if it makes weak strategic choices; repeated illegal actions are a different problem. No model-performance or balance findings have been collected yet.
