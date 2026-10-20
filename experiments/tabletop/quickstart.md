# Table protocol and ordinary Magic grounding

This reference starts a supervised game; it is not the complete Magic rules or a replacement for a chosen format. Read the configured format and box references through `read_reference`, and exact imported Oracle text through `read_card`. Use `read_rules` for the installed official Comprehensive Rules when a timing, keyword, or interaction needs checking. If that source is unavailable and the answer matters, complete the decision with `needs_help` instead of guessing.

## Before the first move

Confirm the chosen ruleset, player and team assignments, starting player, turn order, decks, life totals, and any custom overrides. The table can represent one or more seats, but a solo exercise needs its own stated setup; that is not automatically an ordinary Magic game. The white/green fixture is an ordinary two-player trial unless the run instructions say otherwise.

For ordinary two-player constructed Magic, use decks of at least 60 cards, normally at most four copies per name except basic lands and card-specific exceptions. Start at 20 life, shuffle, and draw seven. Under the London mulligan, shuffle the hand back, draw seven again, and when keeping put one card on the library's bottom for each mulligan taken. There is no free mulligan in this ordinary two-player trial. The starting player skips their first draw step. Different formats can change these requirements.

Do not draw a second opening hand on a resumed session. Inspect the table and history first. Public setup notes may record ready/keep decisions without revealing a hand.

## Work from updates, not assumptions

Every notification is information, not permission to act. Read `observe_table` before making changes and use its current revision. Use `read_events(since)` to read all unseen events in order; an older notification may already be superseded. Keep the returned revision as the history cursor. Only use current card IDs from the latest table.

Determine whether the rules require your seat to act, pass, or make a choice. Being the active player is different from having priority; a blocking choice or choice during resolution may belong to another player. Respect response opportunities.

- To take a game action, use `act` with a short explanation and only the changes that need no intervening opponent choice.
- To pass priority, submit `{ "type": "pass", "next": "p2" }` with the correct next seat. A pass is a real event even when no card changes.
- When no action is appropriate, call `complete_decision` with `no_op`. This does not pass priority, mutate the table, or notify everyone again.
- After acting or passing, finish with `complete_decision` status `acted`. For a dispute or missing rule, use `needs_help` and a concise note.

Never create a public note, an empty turn update, or a pass merely to acknowledge receipt. A rejected stale revision requires reading and reconsidering the new state; never retry the same decision blindly.

## Turn and timing reminders

The ordinary turn proceeds through untap, upkeep, draw, first main, beginning of combat, declare attackers, declare blockers, combat damage, end of combat, second main, end step, and cleanup. First/double strike can create an additional combat-damage step. Nobody normally receives priority during untap; cleanup can require exceptions.

With priority, instants and most activated abilities can be used. Ordinary sorcery timing requires your main phase and an empty stack. Playing a land is a special action with that timing, normally once per turn. Pay costs and choose required modes and targets when casting or activating. Mana abilities usually do not use the stack.

Priority passes in turn order. After all players pass consecutively without intervening action, resolve the top stack object, or advance the step/phase if the stack is empty. After resolution the active player normally receives priority, after state-based actions and waiting triggers are handled. The table never performs this sequence for you.

## Combat, effects, and the end of the game

Declare legal attackers, then legal blockers, and leave the appropriate response windows. Attacking normally taps the creature; blocking does not. A creature normally cannot attack or use its own tap/untap-symbol ability unless controlled continuously since the start of its controller's most recent turn, unless haste applies. Trample, evasion, first strike, and other abilities require exact card/rule text.

Apply damage and its consequences, including lifelink, lethal damage and deathtouch where applicable. Check state-based actions and put waiting triggers on the stack when appropriate. In cleanup, discard to the applicable maximum hand size, remove marked damage and end applicable temporary effects. Ordinary losses include zero life, ten poison counters, or attempting to draw from an empty library; card text and formats can alter outcomes. Report only an outcome established by the chosen rules, with a short explanation.

## The table is manual

Moves do not automatically pay costs, resolve spells, clear old object state, apply continuous effects, or find winners. Explicitly update life, mana, tap state, counters, damage, attachments, and temporary notes as required. Counter and mana maps replace the whole previous map. When a zone change creates a new object, reset relevant old state explicitly.

Move spells to the top of `stack`, then to their destination upon resolution. Use `stack_item` for triggered/activated abilities and remove the entry after resolution or countering. Mark attackers, blockers, targets, and temporary effects in public notes where needed. A public note is visible to everyone; keep private decision explanations in the action's `reason`.

Only peek or reveal when a rule permits it. Shuffles and hidden moves change card handles. Imported card text is a cache; use the project's Scryfall MCP for updated official Oracle text and rulings when available. Custom format rules and Treachery identities come from their own references.

## Sources and lookup guide

The grounding above follows [Wizards' introduction](https://magic.wizards.com/en/how-to-play) and the [official rules reference](https://magic.wizards.com/en/rules). It is an operational reminder, not a substitute for the full procedures in your selected format. Useful Comprehensive Rules sections include 103 (setup), 117 (priority), 500–514 (turns), 601–608 (casting, triggers, resolution), 704 (state-based actions), and 800 onward (multiplayer). The installed TXT reports its effective date; consult the rules page when an update is needed.
