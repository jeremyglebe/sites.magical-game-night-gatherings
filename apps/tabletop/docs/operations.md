# Tabletop App operations

A local Node application with an optional browser table, independent Codex CLI players, and saved game logs. It is separate from the published catalogue. Players interpret Magic and the selected format rules; the table stores their physical actions, filters private information, and displays the public game.

The data model and coordinator accept any positive player count, subject to machine and account capacity. The viewer supports one through six players. Its six-seat team layout keeps three seats on each side, with the middle seats facing one another. Choosing that layout does not apply Emperor rules; supply the actual format reference when it exists.

This is for the catalogue's casual formats and prebuilt boxes. Box-specific exceptions must come from the chosen box's documented rules. There is no automated Magic legality, priority adjudication, effect resolution, trigger handling, cleanup, or winner detection. The separate Jumpstart preparation stage does validate its simple packet-selection procedure and assembles the selected decks.

## Start here

Use Node 24.5 or newer and an existing Codex ChatGPT login. All commands below run from the repository root; the root scripts preserve that working directory for saved games. `npm ci` installs the workspace dependencies and pinned project-local Codex CLI (0.163.0), leaving your global installation unchanged. From the repository root:

```bash
npm ci
npx --no-install codex login status
npm run playtest:rules
npm run playtest
```

`npm run playtest` builds the Vue client before launching the Node service. For separate build/start commands, use `npm run tabletop:build` and `npm run tabletop:start`. Open **http://127.0.0.1:5180/**. Add players, choose human or AI control, choose decks and AI model settings, then create the match. It starts paused with the first player ready for packet selection if configured, or opening-hand setup for a prebuilt deck. Start follows explicit player handoffs; Step runs one player decision; Pause and Stop cancel active work. Reopening the application restores the saved match paused. A final game or match result starts the questionnaires before the playtest is complete; intermediate game results enter the between-game stage. Completed playtests stay finished; older recordings without surveys retain their original completion status. Use **More → Run limits** to adjust decision count, decision timeout, and an optional output-token limit. Only one AI player runs at a time.

The proposed default is **gpt-6-luna, high reasoning, standard speed**. Every player can use a different model or reasoning setting. The app uses its pinned project-local CLI because the older global CLI tested here rejected current models. Model availability still depends on your account: an unavailable model pauses with an error, with no silent substitution. Choose a supported model when creating a match. `TABLETOP_CODEX_BIN` can select a different installed binary; it must support `--ignore-user-config` and `--ignore-rules`. No API key or desktop-app private endpoint is used.

Zombies vs Plants: Jumpstart v0.1 is the default test source. The original white/green test-deck presets are no longer offered. Import a setup JSON for custom lists, player counts beyond six, format references, or other starting state. Saved games live under ignored `.playtest/`, excluded from catalogue builds. The live table shows public information; inspect a card or a player's board for details. **Saved games** opens the owner's recording library, including full starting decks and replay.

## Running without the viewer

The same application runs without opening a browser:

```bash
npm run playtest:headless -- --setup apps/tabletop/examples/zombies-vs-plants-jumpstart.json --run
```

That example uses the default model, so choose explicit models in a copied setup if your CLI does not support it. Omit `--run` to load paused. Use `--directory .playtest/trial-02` to keep an independent run, and `--port 5181` when another app is using 5180. With no `--setup`, the most recent match in that directory resumes. Ctrl+C saves and closes the host.

A setup uses the Jumpstart `preparation` configuration below, or explicit full custom deck arrays. The retired `"white"` and `"green"` preset names are rejected; existing saved matches retain their decks. Each player accepts `model`, `reasoning`, and `ai` (default true). A human/manual seat uses `ai: false` and gets no CLI worker; use its browser controls, or a separately configured MCP host, when explicitly given control. `limits` accepts `maxDecisions` (2000), `decisionTimeoutMs` (120000), and optional `maxOutputTokens`. Legacy concurrency settings normalize to one when loading; live configuration cannot raise it. These are stopping thresholds; an already-running call can finish above a token threshold. Token counts are reported usage, not an estimate of your subscription percentage.

Open **Plan usage** from the top toolbar. Its panel reads real remaining allowance and reset times through the installed CLI's documented `account/rateLimits/read` method. It launches a short-lived `codex app-server` reader without creating a conversation or running a model. Only the windows the account actually reports are shown. Reads are cached, refreshed about once a minute while running, and available through the Refresh button. Saved baselines show changes in percentage points since tracking began; old matches cannot recover usage from before that baseline. These are account-wide observations and include other Codex activity, including while a match is paused. They are not an exact charge for this game. A reset starts a new comparison, and a failed read retains the dated last successful snapshot.

Raw token counters remain under technical details. Resumed CLI turns report cumulative session totals, so each player's latest total replaces the previous one. Old overcounted totals are marked unavailable until that player next completes a decision. Tokens are not converted to a plan percentage or API price. See [Codex app-server rate limits](https://learn.chatgpt.com/docs/app-server#6-rate-limits-chatgpt) and [usage guidance](https://learn.chatgpt.com/docs/pricing).

## Jumpstart preparation

For the first supported source, choose **Zombies vs Plants: Jumpstart v0.1** in new-table setup. There must be two players, one assigned to Plants and one to Zombies; each may be human or AI. The choices use complete, public twenty-card packets. A human chooses two packets and confirms the combined forty-card preview. The coordinator prompts AI players to make the same choice through MCP, in seat order.

For imported or headless setups, set `preparation: {"kind":"jumpstart","source":"zombies-vs-plants-v0.1"}` and each player's `faction` to `plants` or `zombies`. Supplied player deck definitions are ignored in this mode; the source provides them. See [the example setup](../examples/zombies-vs-plants-jumpstart.json). Full custom deck arrays keep their existing setup flow; the retired white/green preset names are not accepted.

`read_preparation` returns the current revision and the seat's candidate packets with locally cached card text. `select_packets` takes that revision, two different `packetIds` from the assigned faction, and optional public `message`. A successful selection locks both packets, records the choice and speech, and ends that worker decision. The coordinator wakes the next chooser. No explicit pass or `complete_decision` is needed after selection.

Before both players confirm, libraries remain empty by design and only speech, notes, or packet selection are accepted. After the last choice, the service assembles and shuffles both libraries exactly once, records the complete constructed decks, and wakes the first seat for opening setup. Players still handle draws, mulligans, starting-player choices, and Magic play. Interrupted selection resumes from saved choices; it never rerolls or repeats an accepted selection. Confirmed choices cannot be edited during that game. A multi-game match may retain those decks or explicitly reopen packet selection between games, as configured below.

The source inventory and definitions are pinned locally in the session. Public packet lists are separate from the hidden shuffled libraries; completed observations omit the large inventory. Saved logs include the selection events and full constructed lists. This first version does not yet implement individual-card drafting, booster passing, sealed deck construction, or a generic deck editor.

## Multi-game matches

New-table setup offers **Single game**, **Best X out of Y**, and **First to Z wins**. Single game is the default and keeps existing saved games unchanged. A setup JSON can specify:

```json
{
  "series": {
    "mode": "best_of",
    "winsRequired": 2,
    "maxGames": 3,
    "sideboarding": false,
    "resetTo": "game"
  }
}
```

Use `mode: "first_to"` with `winsRequired` for an uncapped race; omit `maxGames`. For best-of, `maxGames` must be at least `winsRequired`. Each reported game winner gets one win (including each winner of a shared victory); draws consume a game without awarding a win. The match ends when a player reaches the win target or the best-of cap is reached. At the cap, the unique highest score wins, otherwise the match is a draw. First-to can continue through draws indefinitely until a target is reached or ordinary run limits pause it. These are match procedures, not Magic outcome adjudication.

Each AI retains its own session throughout the match. There is one serial readiness handoff per player after a nonfinal game, followed by the next game. Eliminated and conceded players participate again. All players submit one independent questionnaire after the match finishes, based on its entire history.

For sideboard formats, enable `series.sideboarding` and supply each player's `sideboard` array using the same card-definition/count format as `deck`. Each player's starting main-plus-sideboard pool is pinned; between games they may change only the allocation, keeping the original main-deck size. Both library and sideboard are reconstructed from that pool, so tokens, opponent cards or temporary changes never become deck cards. Private pool IDs are separate from live card IDs. The Zombies vs Plants box has no sideboard by default; unselected packets never become one.

`read_sideboard` provides only the calling player's complete pool, allocations and readiness. `sideboard({revision,main:[{id,count},...]})` applies a complete main-deck allocation and leaves the remaining copies in the sideboard. A human selects their own seat to use the equivalent between-game panel. Allocation edits are allowed only for the current unready seat, and are locked by `ready_next_game`. The first seat to ready may set `starting_player` according to the agreed format; absent that choice, the starting seat rotates. A successful readiness ends the worker decision and prompts the next unready seat. Neither a sideboard edit nor public speech wakes extra players.

The last readiness clears all transient game state, restores starting life/status, advances the game number and preserves match score, original card inventory, saved history and AI sessions. `resetTo: "game"` then shuffles the retained deck allocations into fresh libraries and hands off opening-hand Setup. `resetTo: "preparation"` instead reopens the configured Jumpstart packet selection with empty libraries; new choices build the next game's decks. Preparation resets require a supported preparation configuration and cannot be combined with sideboarding. This is the extension point for later drafting procedures, not an implementation of booster drafting today.

Cards receive new handles; hands, battlefield, stack, graveyards, exile, command zones, custom zones, tokens, attachments, counters, damage, mana, temporary notes and elimination markers do not carry into the next game. The players still perform opening draws, mulligans and all Magic rules. A match resumes its saved game/preparation/readiness stage after restart, paused, without repeating accepted readiness or clearing conversation history. Existing single-game sessions are never retroactively converted into a series.

## How players are coordinated

Each seat has its own Codex conversation and working directory. Subsequent decisions resume that exact session ID. Player prompts contain only that seat's table projection and event history. Managed workers receive one fixed-identity tabletop MCP connection; shell, file inspection, browser, unrelated MCP servers, and cross-player tools are disabled. The launcher uses the existing CLI login while ignoring user configuration and project instructions for these workers.

Ordinary table changes and public speech do not prompt any other player. `pass_priority` prompts only its named recipient; `pass_turn` does the same and updates the active-player, turn-number and phase markers. At most one CLI worker runs across the entire match. A handoff ends the current player's decision immediately, and the recipient starts after that worker exits. A handoff must be the final action in an `act` batch. Other players remain idle with no polling or model calls. The recipient receives their current filtered state and all visible events since their last decision, including public conversation. A compact public history of the current turn is also included. Revision checks reject stale writes, and decision IDs reject writes from canceled or completed workers.

Players group physical actions that need no intervening response, explain their sequence through `say` or a handoff's `message`, and explicitly ask for responses when needed. They interpret the rules and agreed shortcuts, including when a quiet phase can be skipped. Mandatory choices, triggers and response opportunities remain their responsibility. A player with nothing to add can immediately return priority with a short message. One multiplayer pass does not mean everyone passed. The coordinator never resolves spells, advances phases on repeated passes, or decides that a response is illegal. During setup, players coordinate each mulligan round through explicit declarations and handoffs; once everyone keeps, control returns to the starting player.

`complete_decision` is available for help or an exceptional stop without a handoff. A successful result declaration is terminal for the current worker; it must stop without another tool call. A quiet `no_op` produces no table event or log entry, but it also does not select another player. Errors, timeouts and requests for help pause the run. When no recipient is pending, the operator can choose a player with **Give control**, then Start or Step. Recovery stays explicit; there are no automatic retry loops. Old broadcast queues migrate to a single pending player from the saved priority/active marker when a match is reopened, still paused.

Seventeen MCP tools are available: `read_preparation`, `select_packets`, `read_sideboard`, `sideboard`, `ready_next_game`, `observe_table`, `act`, `say`, `pass_priority`, `pass_turn`, `read_card`, `read_reference`, `read_events`, `read_rules`, `read_survey`, `submit_survey`, and `complete_decision`. Preparation workers receive selection, speech, reference, and help tools without ordinary gameplay actions. Between-game workers receive private pool reads, sideboarding, readiness, speech and reference/help tools, without ordinary gameplay actions. Survey workers receive only read tools, survey submission, and the help completion tool. The viewer shows chronological public actions and attributed player speech, with an expandable full history. Human browser controls use the same table actions and handoff checks. An automated game reviewer is not included.

The live workspace fits the viewport, with long table content and chat scrolling inside their own panes. On screens at least 1051px wide, the right-hand log uses chat bubbles, collapsible groups of table actions, and a live thinking indicator while an AI player is making a decision. Drag its divider to change the width. Below 1051px, the toolbar’s **Table / Chat** switch shows one pane at a time. **Plan usage** and post-game **Feedback** open bounded, internally scrolling dialogs from the top toolbar. Player portraits open **Players**, a compact vertical list of everyone’s model and status. Its header shows the coordinator’s run status and an icon-only **Run limits** button; recovery controls appear when needed. The **More** menu contains **Game log**, **Saved games**, **Run limits**, and **New table**. Toolbar icon buttons have hover labels and accessible names and share the score row beneath the title. Below chat, the turn and phase are centered above the portraits in the turn-tracking section; portraits remain in turn order, with the active player's portrait highlighted. The battlefield highlight indicates priority.

Ten generated robot fantasy portraits, including Plant and Zombie, identify players consistently on the boards and in chat. AI seats receive random portraits without repeats, saved with the match and retained after reopening it. Existing matches receive portraits on their next load. Manual seats and seats beyond the available portrait pack use numbered badges; this does not limit headless player counts. The image files and generation prompts are in [`server/avatars/`](../server/avatars/).

Click a player portrait on the battlefield, in live chat, expanded chat history, the thinking indicator, or the turn tracker to open the same full **Players** list. These portrait buttons also work with Enter or Space.

## Playing as a human

Choose human control for a seat when creating a table, or import a player with `ai: false`. Human and AI participants can share the same match. In the live table's human controls, choose your seat and explicitly open its private view. Hide that view before handing a shared screen to another person. While a seat is open, the boards and recent chat use that player's filtered view, including disclosures addressed to them. Hiding the hand restores the public spectator view. Neither that seat's concealed library order nor unseen cards in opponents' hands are revealed by opening it.

You can inspect your hand and visible cards while another participant acts. Table changes are enabled only when the coordinator has handed control to your human seat and any preceding AI worker has exited. This is the application's writing permission, not an automated ruling about what Magic allows. The selected recipient may prepare actions while the run is paused, but handing control to an AI does not start it until the run is resumed.

Each player has a clearly separated hand lane below their battlefield. Unseen cards appear as card backs; visible cards have inspectable art. Entering a human seat replaces its concealed lane with your playable hand. Drag directly from that hand into the battlefield above it, onto the shared stack, or into the deck, graveyard, exile, command, and sideboard zones on the board. Every drop queues a physical action and updates only your preview; Undo, Clear, Send, and the pass buttons work exactly as before. Your board appears nearest you in a two-player game. Other layouts retain their seating arrangement.

The board’s deck pile has explicit Top and Bottom destinations, plus Draw and Shuffle controls. Dropping on the deck itself returns a card to the top. Dropping on the stack puts the card on top. A named player’s battlefield sets that player as the controller when needed. Dragging a concealed library pile queues a draw without revealing a card until you send it. A library’s top and bottom are explicit targets so returning or bottoming cards is unambiguous. Temporary cards from pending draws or new objects cannot be dragged until sent. Out-of-turn, stale, and canceled drags do not queue moves.

Turn and phase tracking, player portraits in turn order, and human turn controls sit together below the chat. Upper battlefields face the center with hand, lands, then permanents; lower battlefields show permanents, lands, then hand. Cards stay upright. The center strip is reserved for the stack and shared zones; untap and life controls sit on your board. Marker edits are queued and do not automatically progress the game. The stack strip stays 80px tall whether empty, piled, or spread, with smaller 48px-wide cards and compact spacing. The stack starts as a daisyUI pile: click it to inspect the top item, or hover for one second to spread its items into a clickable row, next to resolve first. It folds back after twenty seconds away from all stack items. The item-count button also toggles the row; Right Arrow opens it and Escape closes it. Keyboard focus keeps the row available while navigating. Spells use card thumbnails; abilities use the same card-sized footprint with the shared card-back graphic. Hover an ability for its short description (or its name when omitted), and click for its full description, falling back to existing rules text. Human ability creation and MCP `stack_item` definitions support optional `short_description` (500 characters) and `long_description` (12,000 characters). These descriptions are public and are preserved in saved games. The unfolded stack keeps the same order without position labels. Explicit reveals add clickable card images to the chat and saved-game viewer, using snapshots from the moment of disclosure, even after the card moves or is shuffled away. Targeted disclosures remain limited to their recipients; older logs without snapshots keep their text entries.

The battlefield border and **Priority** badge identify the player who can respond. The larger portraits below chat stay in player turn order, with the active player's portrait highlighted. The current turn and phase appear above that row. Hover or keyboard-focus a portrait to see its player's name. Preparation, between-game setup, and completed games do not show an active-turn portrait highlight.

Turn duration is tracked by actual player turn starts. `turn.counts` stores each player's turns begun and `turn.totalTurns` stores their total; the table displays the active player's personal count. Leaving Setup for play starts the first turn, changing the active player during play starts theirs, and `pass_turn` explicitly starts the recipient's next turn (including an extra turn for the same player). Priority passes and ordinary phase or number-marker edits do not start turns. Use priority handoffs for opening-hand setup. Counts reset for each game of a match and are included in the saved-game review and logs. The editable `turn.number` remains a separate legacy marker. Older saves recover counts from recorded actions where possible; partial or unavailable histories are labeled accordingly, never estimated by dividing a marker by the number of players.

Battlefield attachments form visible card piles. Hold a dragged card over the center of another permanent until the attachment highlight appears, then release to queue the attachment. Dropping too quickly cancels that card-on-card action. Resolving an Aura from another zone can queue its battlefield move and attachment together. The target’s controller does not take control of the attachment. Click a pile to inspect its top card. Scroll the mouse wheel over it or Shift-click to cycle which card is on top; Shift+Enter also works from the keyboard. An attached card’s inspector includes a **Detach** button. Display order is saved locally and does not alter game state; attaching and detaching use the normal reversible action queue. To detach by dragging, put the attachment on top of its pile, then drag that card onto an empty part of the battlefield. AI players record these same relationships with `act` and `card.set.attached_to`, using a visible battlefield card ID or `null` to detach, rather than keeping the relationship only in a note.

Card inspection still offers explicit controls, and selecting a card’s destination through the keyboard/click controls is available when dragging is inconvenient. Use the remaining action controls to draw multiple cards, tap or untap, edit life and card state, and record phase markers. Cards and effects do not resolve themselves: playing a land means placing it on the battlefield, casting a spell means placing it on top of the stack, and resolving a spell means explicitly performing its effects and moving it to the appropriate destination. Zone changes do not automatically clear old counters, damage, tap state, or notes. Make those corrections explicitly when the rules require them.

The chat composer contains the pending action queue, message input, Send, Pass priority, and Pass turn. Queued actions preview immediately on your board and in your private controls; they are not saved or shown to other players until sent. Undo the last action, remove an individual action, or clear the queue before submitting. Draws and peeks preview counts and card backs, with newly revealed identities available only after the batch is sent. A token or ability created in the draft must be sent before it can be edited. Removing an action that a later action depends on flags the remaining draft for correction.

Group changes that need no intervening response, add a public explanation, and send them together. Pass priority to a named player when a response is needed, or pass the turn when play is ready to move on. Both pass buttons include any typed message and pending actions in the same batch. Enter sends; Shift+Enter adds a line. During setup, use the same handoffs to coordinate draws, keep/mulligan declarations, redraws, and bottoming cards with the other seats; the application does not choose or perform a mulligan for you.

You can also send a message while another player has control. It appears in the saved conversation immediately without taking priority or starting another AI. An active AI receives the new message at its next table-tool interaction; a move based on the preceding revision is rejected with the steering messages and a fresh, seat-filtered view so it can reconsider. This does not interrupt reasoning mid-response. An idle player's next handoff includes the conversation. Out-of-turn Send sends only the text and preserves any pending action draft.

If the table changes after actions were prepared, reconsider them against the new state. Rejected stale submissions are not replayed automatically. A concession/elimination marker is separate from declaring the whole game's result, especially in multiplayer. An intermediate game result opens between-game readiness and optional sideboarding. Only the final game or match result opens the participant questionnaire.

These are controls for the local owner application, with selectable human seats for shared-machine play. They are not separate remote player accounts. The owner's saved-game reviewer includes private cards and full decks, as described below.

## Post-game questionnaires

A single game's result, or the final result of a multi-game match, ends gameplay and starts a separate feedback phase. Intermediate game results do not collect surveys. Match questionnaires explicitly assess all the recorded games, including recurring patterns and the effects of sideboarding, new packet choices, or learning; the same AI conversations remain available to their own seats. Each participant—including eliminated or conceded players—answers once before the playtest is marked complete. AI players answer serially in their own existing conversations; human/manual seats open **Feedback** in the live table’s top toolbar and choose **Answer questionnaire**. Human responses can be submitted independently while AI feedback is running. Closing the form or refreshing the page preserves an unsubmitted draft in that browser session. The app never invents a response for a missing player.

The questionnaire is pinned in the recording with its version, questions, anchors, participant identities, and result revision. It asks for six ratings: relative deck strength (5 means comparable to the opposing field), matchup fairness, rules adherence, meaningful choices, enjoyment, and complexity. Complexity is descriptive, not a quality grade. AI enjoyment is explicitly an estimate of likely human enjoyment. Every rating allows insufficient evidence with an explanation. Written answers cover noteworthy play, factors shaping the result, and a useful next test or change. Rules reports include correction status, estimated impact, and an optional recorded revision. Players are asked to separate observed mistakes from uncertainty and deck/format issues from draws, seat order, or their decisions.

The coordinator only schedules the questionnaires. It does not evaluate the match or generate findings. Each player receives only their own survey status and their usual seat-filtered game information; other responses are never exposed through player MCP tools. Gameplay writes are disabled after the final result; between-game writes are limited to the preparation procedures described above. Responses are validated and saved to the authoritative session and the automatic JSON/Markdown exports without adding board actions or changing replay revisions.

**Saved games → Feedback** shows independent responses, rating counts and disagreement, rules reports linked to replay, and suggested next tests. No composite score or automatic deduplication turns subjective reports into verified findings. JSON and readable logs still support separate analysis in another chat. Legacy recordings show that no questionnaire was recorded.

Pauses, errors, timeouts, and existing run limits also apply during AI feedback collection. The game remains **feedback pending** until every response is saved. Reopening restores missing respondents paused, without repeating accepted answers or restarting gameplay. Resume or adjust Run limits to continue collection. Headless runs use the same phase and save the same responses.

## Saved logs

Each match folder contains `session.json`, coordinator/configuration in `match.json`, a pinned `BasicRules.txt`, pinned Comprehensive Rules when available, a `CardRulings.json` cache for older imported definitions, and per-player workspaces. Beside the session are:

- `session.json.game.md`: readable starting lists, selected format references, actual actions, attributed public speech, explanations, and reported result.
- `session.json.game.json`: starting state and concrete revision deltas, including random shuffle outcomes, for reconstructing the game.

These files are saved automatically after every accepted batch of actions, including during headless play. No export button is needed to preserve a game. The authoritative session also contains the recording, so a failed derived export can be repaired and does not discard the game history.

Open **More → Saved games** in the live table’s toolbar to browse previous completed and unfinished games, or **More → Game log** to review the current match. The library is also at **http://127.0.0.1:5180/games**. Each game has its recorded conversation with grouped actions, a replay table, player deck lists with quantities and cached card details, and a Feedback tab for saved questionnaires. Recordings preserve their original random outcomes. Replay steps through saved batches; it does not rerun player decisions, infer intermediate states inside a batch, or change the live match. For multi-game matches, the review preserves each game's main deck and sideboard, game boundaries, scores and every concrete reset; the game selector can revisit the earlier boards without changing the live match. Starting decks come from the recorded setup or, for Jumpstart, the frozen constructed lists after both packet choices. An unfinished selection shows that no deck has been built yet. Older recordings without a setup identify lists reconstructed from the first saved position.

To open recordings independently while an existing host continues running, use the read-only reviewer:

```bash
npm run playtest:review
# http://127.0.0.1:5181/games
```

`--directory` selects another playtest directory and `--port` changes the review port. The reviewer reads saved files without taking a game lock or launching AI players. The integrated library and standalone reviewer serve the same Vue application. Rebuild the client and restart the Node service after upgrading it.

JSON downloads remain available for taking a recording to a separate Codex chat for analysis. The app does not run an AI reviewer or generate findings. These are owner logs and include hidden cards; they are never supplied to opposing players. Quiet acknowledgments are omitted. Keep logs and session credentials out of the published website.

## Standalone MCP table

The lower-level table service remains available for externally managed players. A new session requires an explicit setup:

```bash
npm run playtest:serve -- --session .playtest/table.json --setup apps/tabletop/examples/zombies-vs-plants-jumpstart.json
```

It resumes an existing session rather than replacing it, and accepts `--port`. It does not launch Codex players; use the full application for automatic coordination. Both services bind to loopback. GitHub Pages hosts the catalogue and cannot run this local Node application.

## Card definitions and rulings

Jumpstart packets use the versioned local card snapshot under `boxed-sets/zombies-vs-plants/v0.1/`. Full custom imports provide their own card definitions. Use Scryfall MCP to verify names, Oracle text, printings and rulings, then save that data with the source.

`read_card` returns cached rulings and provenance when available; routine observations and event history omit them. `rulings_cache.status: "fetched"` with `rulings: []` distinguishes a checked-empty result from `"not_fetched"`. Missing rulings remain explicitly unknown. Existing matches can use their pinned local fallback by exact Scryfall ID without changing recorded actions or exposing concealed cards.

The browser fetches card images; a name placeholder appears if an image cannot load. The retired Game Night decks remain only in automated regression fixtures, not as selectable playtest sources.

## Connect externally managed players

Run the table server first. Each player gets **one** stdio MCP connection. For player one:

```bash
node apps/tabletop/server/mcp.mjs --seat p1 --session .playtest/table.json --url http://127.0.0.1:5180
```

Player two uses the same command with `--seat p2`. These are MCP server commands, so start them through an MCP-capable host rather than expecting an interactive terminal prompt.

A generic MCP host configuration for player one is:

```json
{
  "mcpServers": {
    "game-night-table": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/REPO/apps/tabletop/server/mcp.mjs",
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

> You are the player assigned to this MCP connection. Read the selected format and box references. If packet selection is pending, choose two distinct packets from your assigned faction with `select_packets`. Once selection is complete, play with your assembled deck, starting at 20 life. Player p1 starts. Use the current London mulligan; there is no multiplayer free mulligan in this two-player trial. Read the table before acting, draw your opening seven during setup, and coordinate completion of setup using public notes. Read exact card text when needed. The table does not enforce or resolve the rules. Apply costs, effects, triggers, state-based actions and cleanup yourself, using the normal timing and priority rules. Do not inspect hidden information without a rule that permits it. Stop for your opponent's decisions and response opportunities. Record attacks, blocks, targets and temporary effects in public card/table notes. Explain actions briefly. If a rule is uncertain, look it up or flag the uncertainty instead of silently inventing a ruling. Report a result only when the game's rules establish one.

For a custom format, replace the setup instructions with its exact complete ruleset and the box's documented overrides. Do not silently mix versions. A Hive/Horde controller can be another seat, and shared piles can be custom zones; the format still determines how they operate.

For a full custom-deck setup, omit `preparation`: each player has an `id`, `name`, `life`, and `deck` array. Each deck entry has a `count`, `name`, `type_line`, `oracle_text`, optional `mana_cost`, `power`/`toughness`, `scryfall_id`, and Scryfall `image_url`. Set `token: true` on physical token entries in a Horde library. Configure starting contents before creating the session; editing the setup file does not replace an existing saved table.

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
| `player` | `player` (default your seat), `set`: `life`, `counters`, `mana`, `note`, `status` (`active`, `eliminated`, or `conceded`). Status is an explicit player report; it does not apply rules or finish the match. Use `active` to correct a mistaken report. |
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
| `sideboard` | Between-game `main: [{id,count}]` allocation using private pool IDs; exact original main-deck size and pool conservation are checked. |
| `ready_next_game` | Lock readiness; optional `starting_player` for the first ready seat, and public `message`. Must end the batch. Last readiness resets to the configured next stage. |
| `result` | `winners` (player IDs, or `[]` for a draw), `explanation`. A terminal player report that scores this game; it must end the batch. |

Player outcome markers are public and saved in the action log. New and legacy unmarked players are active. Players should explicitly mark an elimination or concession when established under the rules, perform the required table cleanup, and hand off to an appropriate remaining player. Zero life alone never changes a status, and an eliminated player does not automatically end a multiplayer game. Use `result` once the overall outcome is established; final winner IDs are distinct from the individual status markers.

Top is index zero in every zone, including the stack. Cast a spell with `move` to `stack` and `position: "top"`. On resolution, explicitly move it to the appropriate zone. Add triggered and activated abilities with `stack_item`; they are not ordinary deck cards.

Moving between zones does not perform Magic's new-object resets. Leaving the battlefield clears incoming and outgoing attachment links, without moving or destroying the other cards. Explicitly clear damage, counters, tap state, face-down state and temporary notes as the rules require. Passing priority and changing the phase do not automatically resolve anything, untap permanents, empty mana pools, or remove damage. Counter/mana maps replace their entire previous maps. A counter is bookkeeping; it does not automatically modify a creature's displayed power or toughness.

For a mulligan, move all hand cards back to the library, shuffle, draw the starting hand size (normally seven), and bottom the required cards. Follow the basic guide for declaration rounds and any free multiplayer mulligan. There is deliberately no hard-coded mulligan policy. A hidden move or shuffle gives affected cards new IDs and clears temporary reveals, preventing a pilot from following old handles through a hidden library. Always use IDs from the latest view.

Face-down cards display as anonymous objects to other players and spectators. The `face` field is an annotation in this first version; automatic double-faced image switching and copy-characteristic displays are not implemented. Use explicit notes and exact card references for such cases, or choose simpler decks for initial trials.

Ability text, attachments and temporary notes can represent decisions without a full combat or continuous-effect engine. The spectator page displays the common zones; custom zones remain accessible through MCP, but do not yet get their own visual panel.

## Rules lookup

Format and box references are optional. Leaving them blank selects ordinary casual Magic with the supplied decks and starting state. Add repository-relative Markdown paths to the setup's `references` array when selecting a custom ruleset, for example:

```json
"references": ["formats/horde/variants/classic.md"]
```

`read_reference` lists configured paths, searches one with `query`, or returns exact text with `start`/`count` (up to 120 lines at a time). The catalogue’s shared Markdown includes are expanded first so turn procedures are present. Line numbers refer to this expanded reference. Large rulesets remain available in full through successive reads; they are not replaced by summaries.

The reference reader covers configured catalogue rules under `formats/`, `rules/` and `boxed-sets/`. Their expanded text is saved with the match so later source edits do not change its rules. The Jumpstart application setup automatically includes its boxed-set page and the two-packet base rules. For the standalone table service, include those reference paths explicitly in the setup file.

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

Tests cover private views and event history, hidden-handle changes, atomic failures, stale/revoked decisions, separate conversations, queues and limits, saved logs/reconstruction, rules references, real MCP round trips, restart recovery, and scripted card-action regression fixtures. The test suite uses fake model runners and makes no paid model calls. Bounded live CLI checks are a separate manual integration step; they do not establish playing competence or deck balance.

For our later model experiment, keep rules mistakes separate from strategic quality. Record model/settings, the two lists, starting seat, completed or abandoned games, corrections, and observed token usage/cost. Swap seats and repeat before drawing conclusions about the decks. A coherent casual opponent is useful even if it makes weak strategic choices; repeated illegal actions are a different problem. No model-performance or balance findings have been collected yet.
