# Tabletop and MCP tool guide

This assistant-authored guide explains the local application's controls. The separately supplied basic game guide teaches the game and states its own authorship, source, and version inside the reference. This file does not replace that guide or the rules of a configured format.

## References and lookup order

Use the basic game guide already supplied in your conversation for ordinary play. For a card question, use `read_card` for Oracle text and cached official rulings. `rulings_cache.status: "fetched"` with `rulings: []` means the cached official lookup returned none; `"not_fetched"` or missing cache metadata means unknown, not a confirmed absence of rulings.

The local `read_rules` sources are `quickstart` (this tool guide), `basic` (the supplied game guide, including its glossary), and `comprehensive` (the official Comprehensive Rules). Search `basic` for a procedure or glossary term when needed. Make a targeted `comprehensive` lookup only if the basics and available card information leave an unusual interaction or ambiguity unresolved. Do not read the entire Comprehensive Rules or query it routinely on every move. If an essential answer remains unavailable, use `needs_help` rather than guessing.

`read_reference` lists configured format and box overrides. These are optional: an empty `paths` list means ordinary casual Magic with the supplied decks and life totals, not missing rules or incomplete setup. This is not a sanctioned Standard deck-legality check. Custom format rules and Treachery identities come from their own references. Imported card text and rulings are local caches; report materially missing or stale information for the host to refresh rather than inventing it.

## Starting and resuming a table

### Jumpstart packet selection

If `preparation.status` is `selecting`, choose packets before ordinary setup. Libraries are intentionally empty during this stage. `read_preparation` returns the current revision, the public pinned packet inventory with complete cached card definitions, each player's assigned faction, and existing selections. Candidate cards are not in game zones and have no playable card handles; inspect their definitions here rather than with `read_card`. This local inventory requires no web queries.

When `preparation.currentPlayer` is your ID, choose two distinct packets from your assigned faction. Call `select_packets({revision,packetIds:["first-id","second-id"],message:"brief public explanation"})`. Consider the pair's early plays, mana curve and themes, without exhaustive optimization. Select whole packets; do not edit their cards or add lands. This is Jumpstart selection, not individual-card booster drafting.

A successful selection locks both packets and completes your decision. **Stop immediately after success**: no opening draw, priority pass, turn pass, or `complete_decision`. Only speech and notes are allowed while selection remains pending. The application constructs and shuffles all forty-card libraries once the last player selects, then schedules opening-hand setup separately. Resume from the saved selections; never select or shuffle again just because a conversation resumed. Selection explanations are public table talk, not private reasoning. The completed packet inventories and game actions are saved for owner review.

### Opening hands and mulligans

Use the configured seats, teams, decks, life totals, and overrides. During Setup, `turn.active` identifies the starting player and the players list gives the seat order unless configured rules say otherwise. Treat supplied settings as the accepted setup without requesting operator reconfirmation. The state supports one or more seats; follow the stated exercise when running a solo table.

Only one worker runs at a time, but setup still follows the game guide's mulligan rounds. Ensure every seat has completed its initial draw before the first declaration round. Use public `say` or handoff messages to record the current stage and each keep/mulligan declaration in starting-player/turn order. All declarations for a round must be complete before anyone takes that round's mulligan. Then the players taking mulligans perform the redraw/bottom stage required by the game guide; finish that stage before starting the next declaration round. Players who already kept no longer participate in later mulligan rounds. Do not finish all of one player's mulligans before the others make their first declarations.

Use `pass_priority` to explicitly schedule the next seat with work in the current setup stage; avoid repeatedly waking seats that already kept. Once everyone has kept, hand back to the starting player to begin play. These are application handoffs, not assertions that ordinary Magic priority exists during setup. The application does not automate declarations, mulligans, or readiness.

On resume or a return handoff, inspect your hand and history before changing anything. Do not repeat a completed opening draw or setup choice. Readiness announcements must not reveal hidden cards. Each player performs their own setup changes; the application never draws or mulligans automatically.

## Visibility and card handles

`zone.count` is the actual number of cards in a zone. `zone.cards` lists only card identities visible to your seat. A hidden library with `count: 60` and `cards: []` contains 60 real cards. Its identities and order are hidden even from its owner. An empty visible-card list does not mean a deck is missing.

Drawing does not require card IDs. An `act` action such as `{ "type": "draw", "count": 7 }` draws that many cards from your library into your hand by default; use the count actually required by the rules. The response shows the newly visible hand. Do not peek or reveal a library to obtain IDs for drawing. Only peek or reveal when a rule permits it. Shuffles and hidden moves change card handles, so use the latest valid IDs.

Neither hidden library contents nor empty optional references block setup. If an earlier decision requested help for either alone, observe the table and continue using the supplied settings and game guide.

## Current state and physical actions

Each prompt includes all player-visible events since your last acknowledged state, in order, followed by one current player-visible snapshot. Read the history once; do not replay actions for individual historical events. Public current-turn history preserves earlier land plays and handoffs. Use `observe_table` or `read_events` when you need a refresh; otherwise the prompt and updated tool responses already supply state.

Every write needs the current table revision. A rejected stale write requires observing and reconsidering, not blindly retrying. `act` accepts a batch of physical changes. The table does not pay costs, resolve objects, apply effects, perform cleanup, or identify winners. Keep the visible state accurate yourself:

- Explicitly update life, mana, tap state, counters, damage, attachments, and temporary notes as required. Counter and mana maps replace the whole previous map.
- Store actual attachments with `act` and `{type:"card",card:"ATTACHMENT_ID",set:{attached_to:"TARGET_ID"}}`; use `attached_to:null` to detach. Move an Aura or Equipment onto the battlefield before attaching it, in the same batch when appropriate. Both IDs must be visible battlefield cards; a target may belong to another player. Do not record an attachment only in notes or chat: `attached_to` is the persistent relationship used by the table and saved games. Self-attachments and cycles are rejected, but the app does not validate card-type restrictions, targeting legality, equip costs, or Magic effects. Leaving the battlefield or removing an object unlinks its relationships without moving or destroying the remaining cards; apply any resulting rules yourself. Turning a battlefield card face down or changing its controller preserves the relationship.
- When a zone change creates a new object, explicitly reset relevant old state. The table does not clear it for you.
- Represent a spell on top of `stack`, then move it to its destination when its resolution or other disposition has been decided under the rules. Represent an ability with `stack_item` and remove that entry when appropriate.
- A `stack_item` definition needs a `name` (its title). You may add `short_description` (up to 500 characters) for its hover tooltip and `long_description` (up to 12,000 characters) for the full inspection view. Explain targets, modes, and other declared choices when relevant. Without a short description, the tooltip uses the name; `oracle_text` remains supported as the rules text and full-description fallback. Descriptions are public, so never include private strategy or concealed information. `read_card` retrieves the full definition when needed.
- Record attackers, blockers, targets, and temporary effects in public notes when needed. Keep hidden information and private strategy out of public notes and speech; an action's `reason` is private to that player.
- Perform required cleanup explicitly, including updating marked damage and temporary effects when the rules require it. A phase or turn marker change does none of that work. Report a game result only when established under the configured rules.
- Mark a player leaving the game explicitly with `act` and `{type:"player",player:"p2",set:{status:"eliminated"}}`, or `status:"conceded"` for a concession. These are public player reports; life totals alone never set them. Use `status:"active"` to correct a mistaken marker. Perform any required cleanup yourself and hand off to an appropriate remaining player according to the rules. In multiplayer, marking one player out does not finish the game. When the whole game has ended, report `{type:"result",winners:["p1"],explanation:"..."}` (all winning player IDs, or `[]` for a draw); that result ends this game. The app then schedules between-game readiness if the match continues, or the final survey if the match is complete. The successful result is terminal for your decision; stop immediately without another tool call.

## Player names and table talk

Use each player's configured `name` from the current players list whenever referring to them in public speech, handoff messages, notes, or result explanations. Keep names consistent: do not alternate between a name and `p1`, `p2`, seat numbers, or invented nicknames. Use the player ID only if no name is configured. Structured tool arguments still require exact IDs: `next`, `player`, `controller`, `owner`, `winners`, and similar fields must use the supplied IDs, not display names.

Keep useful game communication clear: what happened, targets, relevant effects, the shortcut proposed, and what response you are waiting for. The current decision's table-talk instructions govern conversational style over older history. If they call for gameplay-only messages, omit jokes, playful rivalry, and other banter.

When your current table-talk instructions invite banter, be a friendly table companion: occasionally add a separate, short line when something on the public board or the deck's theme gives you a natural opening. A light joke, playful rivalry, or compliment is welcome. When a human jokes or banters with you, respond in kind during your next legitimate decision instead of ignoring it or insisting on purely mechanical discussion. In that style, the efficiency and no-empty-acknowledgment instructions do **not** forbid social chat. Banter is not a quota or something to force into every decision. Never reveal hidden cards, private plans, or private reasoning for a joke. Banter does not require an answer and must not create extra priority passes, standalone wakeups, or lengthy improvisation that delays play.

When invited, you can send a mechanical message and a separate banter message with `say`, or include separate `{type:"say",text:"..."}` actions before the final handoff in one `act` batch. Prefer batching when practical. For example, a mechanical message could say “Fredermathy, I cast this targeting your creature; any response?” and a separate line could say “The garden is getting territorial.” Use the actual configured name and a joke appropriate to the visible situation. Publish all desired speech **before** a terminal handoff; once `pass_priority`, `pass_turn`, packet selection, readiness, or a game result succeeds, stop immediately as instructed. When using separate calls, use the latest returned revision for each one.

## Explicit handoffs and efficient play

Only one player runs at a time. A prompt means another player or the operator selected your seat to continue play or answer a response window. It does not grant an otherwise illegal action. Ordinary table changes and public speech do not wake other players; the coordinator never infers who should act next.

Communicate an efficient proposed sequence, apply its physical changes in a batch where appropriate, and hand off when somebody needs a response opportunity. For example, narrate a proposed shortcut through quiet phases, a land play, mana payment, and casting, followed by the appropriate request for responses. Do not create a separate model handoff for each mechanical step or empty phase. Do not silently skip mandatory opponent choices, triggers, or meaningful response opportunities. Explain the chronology so another player can request an earlier legal response point. Discuss any objection and correct the table explicitly together; the application neither adjudicates shortcuts nor rewinds automatically.

When useful play is finished, the stack is clear, and no opponent choice, pending trigger, or relevant response window remains, perform required cleanup and use `pass_turn` directly. Describe the proposed shortcut through quiet remaining phases in its message. Do not hand off solely to confirm every empty phase or ask permission to end your turn. The recipient may still request an earlier legal response point and coordinate a correction.

- `say({revision,text})` publishes an attributed message for choices, readiness, shortcut proposals, or questions. It does not wake another player. Follow a question requiring an answer with an explicit handoff to its recipient.
- `pass_priority({revision,next,message?})` records a pass and schedules exactly the named player. Choose that recipient according to the rules and public conversation. During setup it transfers setup responsibility.
- `pass_turn({revision,next,number?,phase?,message?})` hands the turn to the named player. It changes active/priority/turn/phase markers only; it does not untap, draw, resolve objects, or apply rules. Optional number/phase fields supply explicit agreed markers.
- A successful `pass_priority` or `pass_turn` automatically completes your decision. End your response immediately and use no more tools, including `complete_decision`. A generic `act` batch may instead end with one `pass` or `pass_turn`; that final action is terminal too.
- `complete_decision` without a handoff pauses for operator intervention. Use `needs_help` for an unresolved blocker. Reporting a result already completes the decision; never call this tool afterwards. `no_op` is exceptional: when you have priority and no useful response, pass to the correct player instead of leaving the match without a recipient.

Public speech and informational updates are not themselves passes. Never add a message, empty marker update, or pass merely to acknowledge a prompt. This prevents mechanical acknowledgment loops; it does not prohibit friendly table talk when invited by the current decision's instructions.

## History checks that prevent repeated mistakes

A main-phase change or a new prompt does not reset a turn's land allowance. Check public current-turn history before playing another land; identify a permitting effect if departing from the normal one-land allowance.

Casting followed by `pass_priority` already records the caster's pass. Do not ask for another caster pass after all players have passed in that sequence. In a two-player example, the caster casts and passes, then the opponent passes: the caster should coordinate the resulting resolution or advancement, not start an identical pass round. In multiplayer, one opponent's pass is not everyone's pass. Use the game guide to interpret the full sequence, and explicitly apply the required state changes and next handoff. The coordinator does none of this rules reasoning.


## Multi-game matches and sideboarding

A match may be one game, **Best X out of Y**, or **First to Z wins**. The application counts reported game results, not inferred victories. Each listed winner earns one win; a draw gives no wins. Best X out of Y finishes when a player reaches X wins or Y games have been completed. At that cap, the unique highest score wins; a tie is a match draw. First to Z has no game-count cap, although the ordinary run limits still apply. Your separate player conversation continues across games; use those observations in the single final match survey, without confusing earlier cards or turns with the current game.

When `series.status` becomes `between_games`, ordinary game actions stop. Wait for your dedicated handoff, then use `read_sideboard` for the current revision, your original card pool, main-deck allocation, readiness and next starting player. This view exposes only your own inventory. Its pool IDs are stable allocation IDs, **not live card handles**. Unselected Jumpstart packets are not sideboard cards.

If sideboarding was enabled and `canEdit` is true, `sideboard({revision,main:[{id,count},...]})` replaces your entire main-deck allocation. Omitted entries remain in the sideboard. The app requires the original main-deck size and preserves every card in the original main-plus-sideboard pool; it does not import cards, remove cards from the pool, or include generated tokens. Apply any additional format restrictions yourself. Keeping your existing deck is always an option. Sideboarding is disabled when the match returns to packet selection between games.

Call `ready_next_game({revision,starting_player?,message?})` when satisfied. Readiness locks your allocation and hands off to the next unready seat. Only the first seat to ready may choose `starting_player`; use the agreed format, otherwise the starting seat rotates by default. Readiness speech is public: do not disclose your sideboard changes or private strategy. **Stop immediately after successful readiness**, without a pass, opening draw or `complete_decision`.

After everyone is ready, the application clears all game zones, generated tokens, attachments, damage, counters, temporary notes, mana, elimination/concession markers and the old result, then restores starting life. It preserves scores, recorded history and each player's independent conversation. The configured `series.resetTo` controls the next step:

- `game` (default): rebuild the retained decks and sideboards from their allocations, create fresh card handles, shuffle libraries, and begin opening-hand Setup. Draws and mulligans remain player actions.
- `preparation`: reopen the configured Jumpstart packet selection for the next game, with empty libraries until everyone chooses again. This is a separate selection prompt, not something to perform during the readiness decision. Previous choices and full decks remain in the saved game log.

Do not reset the old board yourself. When a new game starts, treat its current state and handles as authoritative; earlier conversation is useful experience, not current game state. The post-match questionnaire arrives only after the match ends and asks about all its games, including recurring patterns, mistakes, sideboarding or new packet choices, and uncertainty.
