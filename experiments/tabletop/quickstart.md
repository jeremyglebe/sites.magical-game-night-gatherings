# Tabletop and MCP tool guide

This assistant-authored guide explains the local application's controls. The separately supplied basic game guide teaches the game and states its own authorship, source, and version inside the reference. This file does not replace that guide or the rules of a configured format.

## References and lookup order

Use the basic game guide already supplied in your conversation for ordinary play. For a card question, use `read_card` for Oracle text and cached official rulings. `rulings_cache.status: "fetched"` with `rulings: []` means the cached official lookup returned none; `"not_fetched"` or missing cache metadata means unknown, not a confirmed absence of rulings.

The local `read_rules` sources are `quickstart` (this tool guide), `basic` (the supplied game guide, including its glossary), and `comprehensive` (the official Comprehensive Rules). Search `basic` for a procedure or glossary term when needed. Make a targeted `comprehensive` lookup only if the basics and available card information leave an unusual interaction or ambiguity unresolved. Do not read the entire Comprehensive Rules or query it routinely on every move. If an essential answer remains unavailable, use `needs_help` rather than guessing.

`read_reference` lists configured format and box overrides. These are optional: an empty `paths` list means ordinary casual Magic with the supplied decks and life totals, not missing rules or incomplete setup. This is not a sanctioned Standard deck-legality check. Custom format rules and Treachery identities come from their own references. Imported card text and rulings are local caches; report materially missing or stale information for the host to refresh rather than inventing it.

## Starting and resuming a table

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
- When a zone change creates a new object, explicitly reset relevant old state. The table does not clear it for you.
- Represent a spell on top of `stack`, then move it to its destination when its resolution or other disposition has been decided under the rules. Represent an ability with `stack_item` and remove that entry when appropriate.
- Record attackers, blockers, targets, and temporary effects in public notes when needed. Keep hidden information and private strategy out of public notes and speech; an action's `reason` is private to that player.
- Perform required cleanup explicitly, including updating marked damage and temporary effects when the rules require it. A phase or turn marker change does none of that work. Report a game result only when established under the configured rules.

## Explicit handoffs and efficient play

Only one player runs at a time. A prompt means another player or the operator selected your seat to continue play or answer a response window. It does not grant an otherwise illegal action. Ordinary table changes and public speech do not wake other players; the coordinator never infers who should act next.

Communicate an efficient proposed sequence, apply its physical changes in a batch where appropriate, and hand off when somebody needs a response opportunity. For example, narrate a proposed shortcut through quiet phases, a land play, mana payment, and casting, followed by the appropriate request for responses. Do not create a separate model handoff for each mechanical step or empty phase. Do not silently skip mandatory opponent choices, triggers, or meaningful response opportunities. Explain the chronology so another player can request an earlier legal response point. Discuss any objection and correct the table explicitly together; the application neither adjudicates shortcuts nor rewinds automatically.

When useful play is finished, the stack is clear, and no opponent choice, pending trigger, or relevant response window remains, perform required cleanup and use `pass_turn` directly. Describe the proposed shortcut through quiet remaining phases in its message. Do not hand off solely to confirm every empty phase or ask permission to end your turn. The recipient may still request an earlier legal response point and coordinate a correction.

- `say({revision,text})` publishes an attributed message for choices, readiness, shortcut proposals, or questions. It does not wake another player. Follow a question requiring an answer with an explicit handoff to its recipient.
- `pass_priority({revision,next,message?})` records a pass and schedules exactly the named player. Choose that recipient according to the rules and public conversation. During setup it transfers setup responsibility.
- `pass_turn({revision,next,number?,phase?,message?})` hands the turn to the named player. It changes active/priority/turn/phase markers only; it does not untap, draw, resolve objects, or apply rules. Optional number/phase fields supply explicit agreed markers.
- A successful `pass_priority` or `pass_turn` automatically completes your decision. End your response immediately and use no more tools, including `complete_decision`. A generic `act` batch may instead end with one `pass` or `pass_turn`; that final action is terminal too.
- `complete_decision` without a handoff pauses for operator intervention. Use `needs_help` for an unresolved blocker, or `acted` after reporting an established game result. `no_op` is exceptional: when you have priority and no useful response, pass to the correct player instead of leaving the match without a recipient.

Public speech and informational updates are not themselves passes. Never add a message, empty marker update, or pass merely to acknowledge a prompt.

## History checks that prevent repeated mistakes

A main-phase change or a new prompt does not reset a turn's land allowance. Check public current-turn history before playing another land; identify a permitting effect if departing from the normal one-land allowance.

Casting followed by `pass_priority` already records the caster's pass. Do not ask for another caster pass after all players have passed in that sequence. In a two-player example, p1 casts and passes, then p2 passes: p1 should coordinate the resulting resolution or advancement, not start an identical pass round. In multiplayer, one opponent's pass is not everyone's pass. Use the game guide to interpret the full sequence, and explicitly apply the required state changes and next handoff. The coordinator does none of this rules reasoning.
