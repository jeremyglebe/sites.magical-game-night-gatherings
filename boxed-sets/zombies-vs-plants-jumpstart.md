# Zombies vs Plants: Jumpstart

[All boxed sets](./) · [Jumpstart](../formats/jumpstart/) · [Browse card research](../research/zombies-vs-plants.md)

::: warning Draft v0.1 — first playtest lists
Eight complete packets are ready for initial testing. Their balance, mana, and partner compatibility are not yet established. The selection procedure below is this box's local draft rule, not an official Jumpstart product rule.
:::

## The box

Two players face off as **Plants versus Zombies**. Each player combines two different twenty-card packets from their faction into a forty-card deck. Each v0.1 packet contains **twelve nonland cards and eight lands**; a combined deck therefore has twenty-four nonlands and sixteen lands.

The Plant packets are Overgrowth (green Plants), Ancient Grove (white Treefolk and canopy allies), Spore Swarm (black living Fungi), and Wild Awakening (green animated lands). The Zombie packets are Restless Dead (black necromancy), Stitched Together (blue laboratory creations), Tomb Guard (white mummies), and The Turned (green Zombies, especially undead vegetation).

**Drafted October 21, 2026.** [Jump to the eight lists](#the-eight-packets) · [Packet lists and design notes (JSON)](./zombies-vs-plants/v0.1/packets.json) · [Card text snapshot (JSON)](./zombies-vs-plants/v0.1/cards.json) · [Whole-box inventory (TXT)](./zombies-vs-plants/v0.1/box-inventory.txt)

Each packet section has a plain-text list. To load a forty-card deck into a deck-list importer, combine the text of two legal packets. The whole-box inventory is for assembling all eight packets, **not** a playable deck. No physical price target has been set; these are gameplay drafts, not a purchasing recommendation.

**First playtest recorded:** Overgrowth + Spore Swarm played Restless Dead + The Turned. [See the interaction findings and proposed swaps](../research/zombies-vs-plants.md#first-playtest-more-chances-to-interact), or [browse the interaction candidates](../research/zombies-vs-plants.html?q=interaction%20study&sort=mana-asc). The lists below remain the v0.1 baseline; the proposed changes are not yet applied.

## Base rules and box changes

Use [Two-Packet Jumpstart](../formats/jumpstart/variants/two-packet.md) for the underlying game. This box adds **ZP1**, the same-faction restriction, and replaces the base rules' unrestricted packet deal with **ZP2**, the faction assignment and selection procedure below. Everything else uses ordinary Magic and the base rules, including spell timing, responses, combat, and victory conditions.

### ZP1. Both packets must belong to the same faction

Each packet has a fixed Plant or Zombie label. A player's two packets must have matching faction labels, but do not need matching colors, creature types, or strategies. Supporting spells belong to their packet's faction. Labels do not grant card types or abilities.

**Undead botanical creatures belong to Zombies.** Plant Zombies, Zombie Treefolk, Zombie Fungi, and botanical undead flavor picks belong on that side. Living Fungi and Saprolings belong to Plants; using sacrifice or graveyard mechanics does not itself make a card undead. Cards keep their actual Oracle types and colors.

### ZP2. Assign factions and select packets

1. Set out the four Plant packet dividers and four Zombie packet dividers, with each complete packet stored behind its matching divider.
2. Assign one player to Plants and one to Zombies by agreement. If there is no agreement, flip a coin: the winner chooses a faction and the other player receives the remaining faction. In the playtest application, set these assignments before opening packet selection.
3. Each player inspects the four packet lists in their assigned faction and **chooses two different packets**. Confirm those choices, take the matching packets, and set the other packets aside. In the application, players confirm in seat order; the coordinator opens ordinary game setup after both have confirmed.
4. Combine **all forty cards**, including all sixteen supplied lands. Do not cut cards, add lands, borrow cards from unused packets, or add outside upgrades. Dividers, tokens, and counters are not deck cards.
5. Randomly determine which player chooses who takes the first turn, independently of the faction-assignment coin flip. Set each player's life total to **20**. Shuffle each deck and offer the opponent a cut.
6. Draw seven cards each, then take mulligans as below. The starting player skips their first draw step.

**Controlled playtests:** the host may specify particular pairs before selection, so a weak pairing can receive repeated tests. For random variety instead, shuffle each faction’s four dividers face down and draw two without replacement. Record whether pairs were player-chosen, host-assigned, or randomly dealt. These options change only selection; each faction still supplies two different intact packets. The current application implements player choice, with host assignments communicated in the setup instructions or chat.

This draft is a two-player Plants-versus-Zombies game. Same-faction mirror matches, multiplayer, duplicate-packet decks, and three-packet decks are outside its current procedure. Mulligans never change packet selection.

### Mulligans, turns, and winning

Use the normal **London mulligan, with no free first mulligan**. In starting-player order, each player decides whether to keep or mulligan. A player who mulligans shuffles their hand into their library and draws seven again; when they keep, they put one card on the bottom of their library for each mulligan they took. Repeat for players still taking mulligans; a player who has kept does not rejoin. Stop at a kept hand of zero cards at the latest.

Play ordinary Magic: untap, upkeep, draw, first main phase, combat, second main phase, and ending phase. Use the normal one-land-per-turn limit unless a card changes it, normal costs, timing, priority, and combat. Each deck is the combined pair, not two separately played halves. Legendary creatures are ordinary deck cards, not commanders. Normal losses include having 0 or less life, ten poison counters, being unable to complete a required draw, a card effect, or conceding. When one player loses, the other wins; simultaneous losses produce a draw. An empty library alone is not a loss. Card effects and the base rules govern exceptions; the factions add no alternate victory condition.

The default session is one game. For another game, either keep the same pairs and repeat setup, or reset the packets and repeat selection. A best-of match is only used if agreed beforehand; use the base rules' match procedure for choosing the starting player in subsequent games.

<!-- BEGIN ZVP V0.1 PACKETS -->

## The eight packets

Every packet contains **12 nonland cards and 8 lands**. Combine two different packets from the same faction; all forty cards stay in the deck. Creature counts below count cards, not the tokens or animated lands they can produce.

| ID | Faction | Packet | Mana | Creatures / other spells / lands |
| --- | --- | --- | --- | --- |
| ZP-P1 | Plants | [Overgrowth](#overgrowth) | Green | 8 / 4 / 8 |
| ZP-P2 | Plants | [Ancient Grove](#ancient-grove) | White | 8 / 4 / 8 |
| ZP-P3 | Plants | [Spore Swarm](#spore-swarm) | Black | 8 / 4 / 8 |
| ZP-P4 | Plants | [Wild Awakening](#wild-awakening) | Green | 5 / 7 / 8 |
| ZP-Z1 | Zombies | [Restless Dead](#restless-dead) | Black | 8 / 4 / 8 |
| ZP-Z2 | Zombies | [Stitched Together](#stitched-together) | Blue | 8 / 4 / 8 |
| ZP-Z3 | Zombies | [Tomb Guard](#tomb-guard) | White | 8 / 4 / 8 |
| ZP-Z4 | Zombies | [The Turned](#the-turned) | Green | 6 / 6 / 8 |

The named printings identify the cards and their verified text; other printings are usable. **Mono-color means the packet can cast its spells with its stated mana color.** Hybrid cards keep their actual colors. Optional abilities may improve with a partner’s color, but the base card must work without that partner.

**Singleton exception:** The Turned contains two Slitherheads and two Sultai Devotees to provide enough inexpensive green-paid Zombies. All other nonbasic cards appear once across each faction’s four packets. Shared spells or lands on opposing factions do not create duplicates in a legal deck.

## Overgrowth

**ZP-P1 · Plants · Green · 20 cards** · [Plain-text list](./zombies-vs-plants/v0.1/overgrowth.txt)

Establish useful Plants, grow with land drops, and turn a large creature or spare Saproling into a trampling threat. Fixing and early blockers help whichever Plant packet joins it.

| Qty | Card | Mana cost | Role |
| ---: | --- | --- | --- |
| 1 | [Jaddi Offshoot](https://scryfall.com/card/tdc/260/jaddi-offshoot) | {G} | Early wall; landfall life gain |
| 1 | [Gatecreeper Vine](https://scryfall.com/card/ddm/48/gatecreeper-vine) | {1}{G} | Defensive Plant; finds a basic land in hand |
| 1 | [Ilysian Caryatid](https://scryfall.com/card/cmm/297/ilysian-caryatid) | {1}{G} | Any-color mana; improves with a large creature |
| 1 | [Vinelasher Kudzu](https://scryfall.com/card/ddm/50/vinelasher-kudzu) | {1}{G} | Threat that grows with land drops |
| 1 | [Blooming Stinger](https://scryfall.com/card/eoe/174/blooming-stinger) | {1}{G} | Deathtouch body and temporary deathtouch support |
| 1 | [Bayou Groff](https://scryfall.com/card/stx/121/bayou-groff) | {1}{G} | Large Plant Dog; sacrifice fodder or pay five total |
| 1 | [Living Totem](https://scryfall.com/card/m15/184/living-totem) | {3}{G} | Convoke body; a counter for another creature |
| 1 | [Creeperhulk](https://scryfall.com/card/cma/98/creeperhulk) | {3}{G}{G} | Trampling finisher; turns small allies into threats |
| 1 | [Fists of Ironwood](https://scryfall.com/card/rvr/139/fists-of-ironwood) | {1}{G} | Two Saprolings and trample for a creature |
| 1 | [Blossoming Defense](https://scryfall.com/card/ecl/167/blossoming-defense) | {G} | Protection and a combat boost |
| 1 | [Nature's Way](https://scryfall.com/card/jmp/412/natures-way) | {1}{G} | Creature-powered removal; vigilance and trample |
| 1 | [Abundant Growth](https://scryfall.com/card/ecc/97/abundant-growth) | {G} | Land fixing that replaces itself |
| 1 | [Thriving Grove](https://scryfall.com/card/msc/579/thriving-grove) | — | Green source; choose a second color as it enters |
| 7 | [Forest](https://scryfall.com/card/fdn/280/forest) | — | Basic green mana |

**Composition:** 8 creature cards, 4 other spells, 8 lands.

**Playing the packet**

- Bayou Groff costs two mana only if you also sacrifice a creature as a casting cost. Without that sacrifice it costs five mana total; its printed mana value stays two.
- Creeperhulk sets base power and toughness to 5/5 and grants trample for the turn. Counters and other bonuses still apply; defender stays, so Jaddi Offshoot and Gatecreeper Vine still cannot attack.
- Living Totem has convoke and can put its counter only on another creature. Creatures that just entered can help convoke, since convoke is not their tap ability.
- Fists of Ironwood needs a legal creature target to resolve and enter before producing its two Saprolings. The enchanted creature can be either player’s creature.
- Abundant Growth fixes color but does not add mana or change land types. Ilysian Caryatid must be able to use its tap ability; it produces two mana of one color if you control a creature with power at least four.
- Nature’s Way deals damage from your creature, so deathtouch and lifelink apply. Blossoming Defense protects one creature from opposing targeted effects, not from every kind of removal.

**First-test watch points**

- Creeperhulk can make birds or Saprolings into very efficient finishers. Measure whether this one card decides too many games.
- Two defenders and a mana creature make some opening hands passive. Bayou Groff is not a normal two-drop without fodder.
- This packet has no flying or reach and only one creature-removal spell. Its partner must help it race or interact with flying threats.

**Retained alternatives:** Wood Elemental / Woodvine Elemental — Retain the botanical theme leads; land sacrifice and multicolor/parley complexity do not suit the simple green first draft. Phytotitan — Another expensive recursive finisher would crowd the curve. Keep it as a replacement if Creeperhulk proves too strong.

## Ancient Grove

**ZP-P2 · Plants · White · 20 cards** · [Plain-text list](./zombies-vs-plants/v0.1/ancient-grove.txt)

Birds and a woodland Druid occupy the early turns while sturdy Treefolk arrive. Team buffs and flying Elementals help the entire forty-card deck finish; the Treefolk do not need a tribal-only partner.

| Qty | Card | Mana cost | Role |
| ---: | --- | --- | --- |
| 1 | [Healer's Hawk](https://scryfall.com/card/fdn/734/healers-hawk) | {W} | Early flying lifelinker |
| 1 | [Rustwing Falcon](https://scryfall.com/card/m19/36/rustwing-falcon) | {W} | Simple early 1/2 flyer |
| 1 | [Suntail Hawk](https://scryfall.com/card/m14/40/suntail-hawk) | {W} | Simple early flyer; singleton variety |
| 1 | [Juniper Order Rootweaver](https://scryfall.com/card/dmu/22/juniper-order-rootweaver) | {1}{W} | Early Druid; optional green kicker improves an ally |
| 1 | [Moonlit Lamenter](https://scryfall.com/card/ecl/26/moonlit-lamenter) | {2}{W} | Treefolk blocker with a paid card draw |
| 1 | [Indomitable Ancients](https://scryfall.com/card/tdc/121/indomitable-ancients) | {2}{W}{W} | Large defensive Treefolk |
| 1 | [Old Ghastbark](https://scryfall.com/card/shm/232/old-ghastbark) | {3}{G/W}{G/W} | Simple Treefolk body; white or green pays hybrid |
| 1 | [Sun-Dappled Celebrant](https://scryfall.com/card/ecl/37/sun-dappled-celebrant) | {4}{W}{W} | Convoke Treefolk finisher with vigilance |
| 1 | [Hoofprints of the Stag](https://scryfall.com/card/ecc/64/hoofprints-of-the-stag) | {1}{W} | Slow, repeatable flying Elemental production |
| 1 | [Flowering of the White Tree](https://scryfall.com/card/ltr/15/flowering-of-the-white-tree) | {W}{W} | Team-wide boost for either packet |
| 1 | [Pacifism](https://scryfall.com/card/m20/32/pacifism) | {1}{W} | Stops a creature attacking or blocking |
| 1 | [Rootborn Defenses](https://scryfall.com/card/plst/RVR-26/rootborn-defenses) | {2}{W} | Board protection and a copy of a creature token |
| 1 | [Thriving Heath](https://scryfall.com/card/msc/580/thriving-heath) | — | White source; choose the paired packet’s color |
| 7 | [Plains](https://scryfall.com/card/fdn/272/plains) | — | Basic white mana |

**Composition:** 8 creature cards, 4 other spells, 8 lands.

**Playing the packet**

- Healer’s Hawk, Rustwing Falcon, and Suntail Hawk are literal birds, not Bird people. Four Treefolk remain the central creature theme; the Druid is an explicit support choice.
- Moonlit Lamenter starts as a 1/4 because of its -1/-1 counter. Its 1W sorcery-speed ability removes a counter and draws a card; removing its initial counter restores the printed 2/5 body. If a creature has +1/+1 and -1/-1 counters, matching pairs are removed as a state-based action.
- Juniper Order Rootweaver is a two-mana 2/2 without green. Its optional G kicker works with either green partner; the white-black pair does not rely on it.
- Hoofprints of the Stag is an enchantment, not an early creature. Each card drawn can give it one hoofprint counter. Pay 2W and remove four counters to make a 4/4 white flying Elemental, only during your turn.
- Flowering of the White Tree gives the nonlegendary creatures in these lists +1/+1. Its separate legendary-creature bonus is not relevant to this version’s creatures. It is a static bonus, not counters.
- Rootborn Defenses copies one creature token you already control, then gives your creatures indestructible for the turn. It still protects your creatures if there is no token to copy; animated lands are not tokens.
- Old Ghastbark can be cast entirely with white mana; it remains both green and white. Convoke lets tapped-for-payment creatures pay generic mana or mana of their own color, including white birds paying Celebrant’s white symbols.

**First-test watch points**

- Flowering of the White Tree and Indomitable Ancients require WW. Do not count Flowering as a reliable turn-two play in a mixed-color deck; test white-black especially.
- Indomitable Ancients and Old Ghastbark provide toughness more than offensive power. Check whether board stalls outweigh the flying and buff finishers.
- Hoofprints requires several draws and another mana payment before providing a body. The birds and partner’s early creatures must cover that delay.
- White has several different counters, convoke, populate, and one optional kicker. Observe the actual explanation burden and simplify if it distracts from the game.

**Retained alternatives:** Alseid of Life’s Bounty / Angelic Wall / Mycologist / Kami of False Hope — Keep these nature-flavored low-cost alternatives in research. The first draft uses the three preferred birds and Rootweaver to preserve room for four Treefolk. Beza, the Bounding Spring / Scion of Vitu-Ghazi — Both remain thematic alternatives; multiple conditional rewards or token/populate effects would compete with the main Treefolk finishers. Juniper Order Advocate — Its green-creature-only support does not help a white-black pairing enough.

## Spore Swarm

**ZP-P3 · Plants · Black · 20 cards** · [Plain-text list](./zombies-vs-plants/v0.1/spore-swarm.txt)

Trade living Fungi in combat, keep the bodies they leave behind, and turn those spare creatures into cards, life, or a larger attacker. The packet functions on black mana; green Saproling tokens do not require green mana.

| Qty | Card | Mana cost | Role |
| ---: | --- | --- | --- |
| 1 | [Deathcap Marionette](https://scryfall.com/card/lci/100/deathcap-marionette) | {1}{B} | Early deathtouch blocker; optional graveyard setup |
| 1 | [Mold Folk](https://scryfall.com/card/clb/133/mold-folk) | {1}{B} | Lifelink threat; paid sacrifice outlet converts spare bodies into permanent growth |
| 1 | [Skullcap Snail](https://scryfall.com/card/lci/119/skullcap-snail) | {1}{B} | Early Fungus body and one-shot hand disruption |
| 1 | [Deathbloom Thallid](https://scryfall.com/card/m21/94/deathbloom-thallid) | {2}{B} | Trading body that leaves a Saproling |
| 1 | [Synapse Necromage](https://scryfall.com/card/lci/125/synapse-necromage) | {2}{B} | Trading body that leaves two attacking/sacrifice Fungus tokens |
| 1 | [Brackish Trudge](https://scryfall.com/card/stx/65/brackish-trudge) | {2}{B} | Efficient attacker; later recovery after life gain |
| 1 | [Thallid Soothsayer](https://scryfall.com/card/gnt/35/thallid-soothsayer) | {3}{B} | Paid sacrifice outlet for sustained card draw |
| 1 | [Thallid Omnivore](https://scryfall.com/card/dom/106/thallid-omnivore) | {3}{B} | Combat finisher using spare creatures; Saprolings add life gain |
| 1 | [Fungal Infection](https://scryfall.com/card/dom/94/fungal-infection) | {B} | Cheap interaction plus a Saproling |
| 1 | [Fungal Fortitude](https://scryfall.com/card/lci/106/fungal-fortitude) | {1}{B} | Flash power boost and one-shot death recovery |
| 1 | [Feed the Swarm](https://scryfall.com/card/tle/257/feed-the-swarm) | {1}{B} | Creature or enchantment removal at a life cost |
| 1 | [Recover](https://scryfall.com/card/rix/84/recover) | {2}{B} | Creature recovery plus a card |
| 1 | [Thriving Moor](https://scryfall.com/card/msc/582/thriving-moor) | — | Black source with the paired packet's second color |
| 7 | [Swamp](https://scryfall.com/card/fdn/276/swamp) | — | Basic black mana |

**Composition:** 8 creature cards, 4 other spells, 8 lands.

**Playing the packet**

- Eight creature cards, four noncreature spells, eight lands; all nonbasic cards singleton.
- The three reusable sacrifice outlets are intentionally paid outlets (Mold Folk, Soothsayer, Omnivore), so they compete for mana rather than enabling an unrestricted free-sacrifice engine. Choose one outlet for the resource you actually need.
- Mold Folk's lifelink and Thallid Omnivore's Saproling sacrifice can enable Brackish Trudge's return ability. Without life gain it remains a three-mana 4/2 that enters tapped.
- Fungal Fortitude can save a nontoken creature through a death and retrigger an entry/death ability. The Aura does not return attached; tokens do not return after dying.
- Deathcap Marionette's mill is optional; Recover or Fungal Fortitude can provide value without mandatory self-mill.
- Thriving Moor chooses the paired packet's other color when entering; all spells remain castable using black.

**First-test watch points**

- Only two sources here produce Saprolings (Fungal Infection and Deathbloom Thallid); Synapse Necromage produces black Fungus tokens that cannot block. Do not treat the tokens as interchangeable.
- Mold Folk, Soothsayer, and Omnivore can compete for fodder. Test whether eight creatures and three token-producing cards leave enough board presence.
- Feed the Swarm costs life, and the packet has no flying creature or reach. Test aggressive opponents and life-gain reliability without adding targeted Zombie hate.

**Retained alternatives:** Deathspore Thallid — Zombie identity assigns it to the Zombie faction. Broodrage Mycoid — Descend bookkeeping and repeated Fungus token engine deferred for simpler first draft. Blightreaper Thallid — Transforming-card rules and additional repeatable token machinery deferred. Boneyard Mycodrax — Graveyard-based size and scavenge add another graveyard accounting system. Mold Demon — Seven mana plus sacrificing two Swamps is unsuitable for the intended curve. Village Rites / Bone Splinters — Useful alternates retained, but more sacrifice costs could overtax the same fodder already wanted by three creature outlets.

## Wild Awakening

**ZP-P4 · Plants · Green · 20 cards** · [Plain-text list](./zombies-vs-plants/v0.1/wild-awakening.txt)

Develop and fix the mana base, establish an early defensive body, then let individual lands join combat as temporary or persistent creatures. Reuse land drops with Embodiment of Insight and recover a lost creature or land with Pulse of Murasa.

| Qty | Card | Mana cost | Role |
| ---: | --- | --- | --- |
| 1 | [Leafkin Druid](https://scryfall.com/card/ncc/299/leafkin-druid) | {1}{G} | Early botanical blocker and green mana acceleration |
| 1 | [Dawntreader Elk](https://scryfall.com/card/jmp/387/dawntreader-elk) | {1}{G} | Early woodland body; trades itself for a basic land |
| 1 | [Fertilid](https://scryfall.com/card/moc/296/fertilid) | {2}{G} | Elemental body whose counters can become basic lands and color fixing |
| 1 | [Awakener Druid](https://scryfall.com/card/jmp/379/awakener-druid) | {2}{G} | Turns an established Forest into a substantial Treefolk while it remains in play |
| 1 | [Embodiment of Insight](https://scryfall.com/card/znc/64/embodiment-of-insight) | {4}{G} | Vigilant finisher and recurring temporary land animation |
| 1 | [Genju of the Cedars](https://scryfall.com/card/gvl/13/genju-of-the-cedars) | {G} | Repeatable Forest animation into a 4/4 Spirit |
| 1 | [Nissa's Zendikon](https://scryfall.com/card/znr/197/nissas-zendikon) | {3}{G} | Persistent 4/4 land creature with reach and haste; recovers its land on death |
| 1 | [Rampaging Growth](https://scryfall.com/card/j22/43/rampaging-growth) | {3}{G} | Instant basic-land ramp with a temporary 4/3 blocker or attacker |
| 1 | [Cultivate](https://scryfall.com/card/msc/172/cultivate) | {2}{G} | Land development and partner-color access |
| 1 | [Ram Through](https://scryfall.com/card/cmm/314/ram-through) | {1}{G} | Creature-powered removal using a body or an animated land |
| 1 | [Return to Nature](https://scryfall.com/card/moc/309/return-to-nature) | {1}{G} | Artifact/enchantment interaction or selective graveyard interaction |
| 1 | [Pulse of Murasa](https://scryfall.com/card/c21/202/pulse-of-murasa) | {2}{G} | Recover a spent creature or destroyed land, plus life |
| 1 | [Ash Barrens](https://scryfall.com/card/tmc/60/ash-barrens) | — | Colorless source or basic landcycling for either packet's mana |
| 7 | [Forest](https://scryfall.com/card/fdn/280/forest) | — | Basic green mana and Forest-animation targets |

**Composition:** 5 creature cards, 7 other spells, 8 lands.

**Playing the packet**

- Five creature cards, seven noncreature spells, eight lands. Five cards animate lands when counting Awakener Druid and Embodiment of Insight, so creature-card count understates its eventual board presence.
- Leafkin Druid, Dawntreader Elk, and Fertilid provide early presence without an Elf package. Dawntreader Elk is a deliberate woodland-animal support choice rather than a literal botanical creature.
- Land animation usually does not untap the land. Pay for spells or abilities with other sources when you want the animated land to attack or block.
- A land that became a creature this turn may attack or use a tap ability if you have controlled it continuously since your turn began; becoming a creature does not by itself reset that history. Newly played lands need haste while they are creatures.
- Awakener Druid and Genju do not grant haste. Nissa's Zendikon, Rampaging Growth, and Embodiment of Insight do. Awakener's Forest stops being a creature when the Druid leaves; Genju and Embodiment animations end at end of turn.
- Nissa's Zendikon returns the enchanted land card to hand when that land dies; the Aura goes to the graveyard. Genju can recover its Aura when the enchanted Forest goes to a graveyard, not the Forest itself.
- Rampaging Growth puts a basic land onto the battlefield untapped unless something else changes that. It has reach and haste as a 4/3 Insect until end of turn, and remains a land afterward.
- Ash Barrens supplies colorless if played; for fixing, pay one generic mana to discard it with basic landcycling and find a basic land in hand. That is not an extra land play.
- Cultivate, Elk, and Fertilid can find a partner's basic Plains or Swamp, whereas Genju and Awakener specifically require an actual Forest.

**First-test watch points**

- Land creatures expose the mana base to ordinary creature removal. Five actual creature cards should be checked against each partner for hands containing support but no useful attacker.
- Several animation durations and sizes require clear markers; the rules notes should be near the list. Avoid stacking multiple animation effects on one land unless necessary.
- Ram Through needs a creature with useful power. Do not spend all available mana animating a land and leave no mana to cast it.
- Ramp density may flood a combined deck or run out of basic lands to find; adjust one ramp spell or a land after playtesting rather than assuming eight lands is final.

**Retained alternatives:** Animate Land — Replaced by Fertilid to improve actual creature count and early development. Living Lands / Natural Affinity / Kormus Bell — Affect opposing lands and create excessive risk and board bookkeeping. Life and Limb — Global type interactions and possible compulsory token loops are too complex for this first draft. Awakening of Vitu-Ghazi — A nine-counter 9/9 is a much larger power spike than the chosen threats. Woodcaller Automaton — Prototype adds another casting/size system; retain as a future alternative. Sylvan Advocate / Llanowar Loamspeaker — Useful efficient options, but non-Elf alternatives preserve the owner's theme preference. Planeswalkers — Additional card-type rules and powerful engines are unnecessary for the simple prototype.

## Restless Dead

**ZP-Z1 · Zombies · Black · 20 cards** · [Plain-text list](./zombies-vs-plants/v0.1/restless-dead.txt)

Trade cheap Zombies, turn their deaths and self-mill into resources, then reuse creatures or raise a large creature from either graveyard. A vanilla two-drop and five-drop keep the necromancy effects from filling every slot with engine text.

| Qty | Card | Mana cost | Role |
| ---: | --- | --- | --- |
| 1 | [Diregraf Ghoul](https://scryfall.com/card/fdn/171/diregraf-ghoul) | {B} | Early Zombie attacker; enters tapped. |
| 1 | [Shambling Ghast](https://scryfall.com/card/afr/119/shambling-ghast) | {B} | Early body; death weakens a creature or makes a Treasure. |
| 1 | [Walking Corpse](https://scryfall.com/card/m21/128/walking-corpse) | {1}{B} | Simple two-mana Zombie body. |
| 1 | [Undead Butler](https://scryfall.com/card/vow/133/undead-butler) | {1}{B} | Stocks the graveyard and can recover a creature when it dies. |
| 1 | [Crow of Dark Tidings](https://scryfall.com/card/fdn/519/crow-of-dark-tidings) | {2}{B} | Flying attacker and limited self-mill. |
| 1 | [Liliana's Elite](https://scryfall.com/card/2x2/82/lilianas-elite) | {2}{B} | Ground threat that grows with creatures in your graveyard. |
| 1 | [Gravedigger](https://scryfall.com/card/m20/103/gravedigger) | {3}{B} | Body plus creature recovery to hand. |
| 1 | [Zombie Goliath](https://scryfall.com/card/cns/135/zombie-goliath) | {4}{B} | Simple larger Zombie finisher. |
| 1 | [Dead Weight](https://scryfall.com/card/lci/99/dead-weight) | {B} | Cheap removal for small creatures. |
| 1 | [Cemetery Recruitment](https://scryfall.com/card/fdn/517/cemetery-recruitment) | {1}{B} | Return a creature to hand; draw if it is a Zombie. |
| 1 | [Eviscerate](https://scryfall.com/card/dom/91/eviscerate) | {3}{B} | Simple unconditional creature removal at sorcery speed. |
| 1 | [Rise from the Grave](https://scryfall.com/card/znc/53/rise-from-the-grave) | {4}{B} | Reanimate a creature from either graveyard as an additional black Zombie. |
| 1 | [Thriving Moor](https://scryfall.com/card/msc/582/thriving-moor) | — | Enters-tapped fixing; choose the partner's color. |
| 7 | [Swamp](https://scryfall.com/card/fdn/276/swamp) | — | Basic black mana. |

**Composition:** 8 creature cards, 4 other spells, 8 lands.

**Playing the packet**

- All spells have a single black pip; Thriving Moor plus seven Swamps avoids early BB demands.
- Rise from the Grave may take an opposing creature. It remains that opponent's physical card and must return to its original packet during reset; track your control and its added black/Zombie characteristics.
- Undead Butler must exile itself as its death trigger resolves to recover a creature. That copy cannot then be reanimated.
- Crow of Dark Tidings mills two both on entry and on death. Milling is not drawing.
- Liliana's Elite counts creature cards currently in your graveyard; recovering or exiling one reduces its size.
- No nonbasic duplicates; one copy of each nonland card. No new Zombie token mechanic is introduced in this packet.

**First-test watch points**

- Crow plus Butler can mill seven cards in a normal enter-and-die cycle; repeated reanimation accelerates that. Watch library size in forty-card games, especially with blue or Sludge Titan.
- Recovery shrinks Liliana's Elite and can reduce Ghoultree's discount when paired with The Turned. This is a real sequencing choice, not a hidden synergy.
- Zombie Goliath is intentionally modest; if the packet cannot close games, revisit the finisher before adding an overwhelming global Zombie lord.
- Rise from the Grave can create large swings against expensive Treefolk. Track whether it dominates late games.

**Retained alternatives:** Lord of the Accursed — Global boost and team menace can over-reward the shared Zombie type versus the more diverse Plant faction. Undead Augur — BB plus mandatory repeated draw/life-loss adds pressure and a snowballing engine. Lazotep Reaver — Avoid adding the distinct Zombie Army/amass token subsystem in v0.1. Ghoulraiser — Gravedigger has an easier single-black cost and chosen recovery rather than random selection. Murder — Prefer Eviscerate's single black mana requirement for easy partner casting, accepting sorcery speed and an extra mana. Butcher Ghoul — Undying and +1/+1-counter tracking remain a useful later alternative, but Walking Corpse is simpler.

## Stitched Together

**ZP-Z2 · Zombies · Blue · 20 cards** · [Plain-text list](./zombies-vs-plants/v0.1/stitched-together.txt)

Build a board of stitched bodies, filter spare creatures into the graveyard, and use bounce, tapping, and a single counterspell to let attacks through. Headless Skaab uses one spare corpse; Stitchwing Skaab and Think Twice give this packet its own ways to use the graveyard with any partner.

| Qty | Card | Mana cost | Role |
| ---: | --- | --- | --- |
| 1 | [Seagraf Skaab](https://scryfall.com/card/soi/84/seagraf-skaab) | {1}{U} | Simple two-mana defensive stitched body. |
| 1 | [Screeching Skaab](https://scryfall.com/card/ema/69/screeching-skaab) | {1}{U} | Early attacker that mills two cards. |
| 1 | [Selhoff Entomber](https://scryfall.com/card/vow/76/selhoff-entomber) | {1}{U} | Early blocker; discard a creature to draw and seed the graveyard. |
| 1 | [Headless Skaab](https://scryfall.com/card/dka/40/headless-skaab) | {2}{U} | Large stitched blocker; assembling it consumes one creature card from the graveyard. |
| 1 | [Stitched Assistant](https://scryfall.com/card/vow/81/stitched-assistant) | {2}{U} | Three-mana attacker with optional exploit for selection and a card. |
| 1 | [Stitched Mangler](https://scryfall.com/card/inr/87/stitched-mangler) | {2}{U} | Temporarily freezes an opposing creature; enters tapped. |
| 1 | [Organ Hoarder](https://scryfall.com/card/mid/66/organ-hoarder) | {3}{U} | Body plus card selection and graveyard setup. |
| 1 | [Stitchwing Skaab](https://scryfall.com/card/soi/90/stitchwing-skaab) | {3}{U} | Flying finisher with costly graveyard return. |
| 1 | [Compelling Deterrence](https://scryfall.com/card/inr/57/compelling-deterrence) | {1}{U} | Bounce a nonland permanent; its owner discards if you control a Zombie. |
| 1 | [Think Twice](https://scryfall.com/card/msc/787/think-twice) | {1}{U} | Modest draw, usable again through flashback. |
| 1 | [Sleep Paralysis](https://scryfall.com/card/m20/75/sleep-paralysis) | {3}{U} | Single-blue sustained creature lockdown. |
| 1 | [Essence Scatter](https://scryfall.com/card/sos/47/essence-scatter) | {1}{U} | Simple answer to a creature spell before it resolves. |
| 1 | [Thriving Isle](https://scryfall.com/card/msc/581/thriving-isle) | — | Enters-tapped fixing; choose the partner's color. |
| 7 | [Island](https://scryfall.com/card/fdn/274/island) | — | Basic blue mana. |

**Composition:** 8 creature cards, 4 other spells, 8 lands.

**Playing the packet**

- All main spell costs and repeat-use costs require only one blue pip.
- Headless Skaab cannot be cast unless a creature card can be exiled from your graveyard as its additional cost, and it enters tapped. Screeching Skaab, Selhoff Entomber, Organ Hoarder, and normal creature trades supply material.
- Selhoff Entomber can discard only a creature card. It cannot discard a spare land or spell for its tap ability.
- Exploit on Stitched Assistant is optional. If using it, the sacrificed creature may be the Assistant itself; sacrifice only when the card and scry are worth the lost body.
- Stitchwing Skaab returns tapped from the graveyard for 1U plus discarding two cards; this is an activated ability, not casting it again.
- Think Twice's flashback is another spell casting and exiles the spell afterward; it can be used after ordinary casting or after being milled.
- Compelling Deterrence can target your own permanent, but if you control a Zombie its owner then discards too. Normally use it on the opponent.
- Essence Scatter answers a creature spell on the stack, not a creature already on the battlefield.
- Sleep Paralysis keeps its target from untapping during its controller's untap step while the Aura remains attached; it is not destruction.
- No tokens or +1/+1 counters required by the blue packet itself. No nonbasic duplicates.

**First-test watch points**

- There is no one-drop, so all three two-drop bodies matter for early play. Check blue+green and blue+white starts rather than relying solely on black's one-drops.
- Headless Skaab can be stranded in hand without a creature in the graveyard. If this happens too often, replace it with a standalone creature instead of adding more mill solely to force it.
- One exile cost and a recurring flyer are deliberately the limit; don't add Skaab Ruinator or multiple corpse-consuming creatures before checking graveyard availability.
- Blue+black is likely to have the most recursion/card advantage. Blue+white must still work through its normal bodies, tempo, and its own graveyard payoffs.
- Discarding two cards to return Stitchwing Skaab is expensive and shouldn't be treated as free card advantage.

**Retained alternatives:** Armored Skaab — A second heavier mandatory self-mill source is unnecessary; Seagraf Skaab supplies a simpler defensive body. Geralf, Visionary Stitcher — Global Zombie flying and scalable sacrifice tokens are too strong/complex for the first fair comparison. Hordewing Skaab — Global Zombie flying can erase the intended contrast with the Plant faction's grounded big creatures. Cleaver Skaab — Copy-token engines and repeated entry triggers are a later balancing experiment. Falcon Abomination — Useful flyer, but decayed introduces another token rule; Stitchwing supplies evasive pressure without that subsystem. Rooftop Nuisance — Casualty creates spell copies and sacrifice sequencing; Sleep Paralysis is simpler sustained interaction. Forbidden Alchemy — Its flashback requires a black partner; Think Twice works fully with every pairing. Skaab Ruinator — Exiling three creature cards and repeated graveyard casting demands too much dedicated support.

## Tomb Guard

**ZP-Z3 · Zombies · White · 20 cards** · [Plain-text list](./zombies-vs-plants/v0.1/tomb-guard.txt)

Develop small mummies, use Zombie-entry triggers to clear blockers or grow attackers, and finish with a team boost or a temporarily flying threat. The partner contributes additional Zombies and threats.

| Qty | Card | Mana cost | Role |
| ---: | --- | --- | --- |
| 1 | [Fan Bearer](https://scryfall.com/card/gnt/12/fan-bearer) | {W} | One-mana Zombie; later taps attackers or blockers. |
| 1 | [Sacred Cat](https://scryfall.com/card/akh/27/sacred-cat) | {W} | One-mana lifelink body; later embalm returns it as a Zombie Cat token. |
| 1 | [Binding Mummy](https://scryfall.com/card/akh/6/binding-mummy) | {1}{W} | Zombie entries tap blockers and support the whole combined Zombie deck. |
| 1 | [Mummy Paramount](https://scryfall.com/card/hou/16/mummy-paramount) | {1}{W} | Two-mana Zombie that attacks harder after more Zombies enter. |
| 1 | [Those Who Serve](https://scryfall.com/card/akh/32/those-who-serve) | {2}{W} | Simple three-mana 2/4 Zombie body. |
| 1 | [Disposal Mummy](https://scryfall.com/card/hou/9/disposal-mummy) | {2}{W} | Three-mana Zombie; removes a card from the opponent's graveyard. |
| 1 | [Sparring Mummy](https://scryfall.com/card/bbd/108/sparring-mummy) | {3}{W} | Four-mana 3/3 Zombie; untaps a creature or readies a used Fan Bearer. |
| 1 | [Dutiful Servants](https://scryfall.com/card/hou/12/dutiful-servants) | {3}{W} | Simple four-mana 2/5 Zombie that stabilizes combat. |
| 1 | [Time to Reflect](https://scryfall.com/card/akh/33/time-to-reflect) | {W} | Cheap conditional exile removal tied to Zombie combat. |
| 1 | [In Oketra's Name](https://scryfall.com/card/akh/19/in-oketras-name) | {1}{W} | Team combat boost, with the larger bonus applying to partner Zombies too. |
| 1 | [Unconventional Tactics](https://scryfall.com/card/hou/27/unconventional-tactics) | {2}{W} | Temporary flying and size for a creature; Zombie entries can recover it. |
| 1 | [Cast Out](https://scryfall.com/card/dsc/98/cast-out) | {3}{W} | Broad answer to a nonland permanent; cycling is available when needed. |
| 1 | [Thriving Heath](https://scryfall.com/card/msc/580/thriving-heath) | — | Enters tapped; choose the other packet's color for optional fixing. |
| 7 | [Plains](https://scryfall.com/card/fdn/272/plains) | — | Basic white mana. |

**Composition:** 8 creature cards, 4 other spells, 8 lands.

**Playing the packet**

- Sacred Cat begins as a living Cat, not a Zombie. It is the packet's one deliberately chosen living creature: its embalm turns it into an ancient-tomb mummy, giving a simple introduction to the theme's return-from-death mechanic.
- Embalm costs W, is activated only at sorcery speed from the graveyard, and exiles the original Sacred Cat card. Create a white 1/1 Zombie Cat token with lifelink and no mana cost; it is not the original card returned. Its entry triggers Binding Mummy and Mummy Paramount.
- Fan Bearer must be able to tap and costs2 mana to activate. To prevent a creature attacking, tap it before attackers are declared; tapping an already-attacking creature does not remove it from combat.
- Time to Reflect requires its target to have blocked or been blocked by a Zombie during the current turn. Casting it after blockers are declared but before damage can save a creature; it cannot exile an unrelated creature.
- Mummy Paramount's bonus is temporary, not a +1/+1 counter. Binding Mummy triggers for another Zombie, not itself.
- Unconventional Tactics is a sorcery. A Zombie entering can return it from the graveyard only after its controller pays W; its +3/+3 and flying last for the turn.
- Cast Out's exile ends when the enchantment leaves. It can be cast with flash, and its cycling option costs W and discarding the card.
- Thriving Heath is not a Plains. It enters tapped and chooses a nonwhite color as it enters; ordinarily choose the partner's mana color.

**First-test watch points**

- Only modest base power on its creatures; wins may depend too heavily on a partner's large threat or In Oketra's Name. Adjust after tests rather than prematurely adding a powerful lord.
- Cast Out and Time to Reflect are the main creature answers; flyers can otherwise evade the ground mummies.
- Sacred Cat's lifelink and double body add resilience, while the rare absence of a Zombie in early hands can delay tribal payoffs.

**Retained alternatives:** God-Eternal Oketra — Too much repeating4/4 token power and return-to-library complexity for the baseline. Priest of the Crossing — Death-triggered counters across the entire board can snowball sharply. Pride of the Road — Adds the speed subsystem. Embalmer's Tools — An extra engine and repeated-mill decisions are unnecessary with only one embalm card. Anointed Procession — Narrow without token production and potentially excessive alongside a token-heavy partner.

## The Turned

**ZP-Z4 · Zombies · Green · 20 cards** · [Plain-text list](./zombies-vs-plants/v0.1/the-turned.txt)

Use expendable Plant Zombies and deathtouch creatures to contest early turns, fill the graveyard through trades and a small amount of self-mill, then cast an affordable Ghoultree or Sludge Titan. Recovery spells and Rancor keep threats useful.

| Qty | Card | Mana cost | Role |
| ---: | --- | --- | --- |
| 2 | [Slitherhead](https://scryfall.com/card/rvr/226/slitherhead) | {B/G} | Actual Plant Zombies; cheap bodies that can later scavenge a counter. |
| 2 | [Sultai Devotee](https://scryfall.com/card/tdm/160/sultai-devotee) | {1}{G} | Two-mana deathtouch Zombies; optional mana filtering helps either partner. |
| 1 | [Ghoultree](https://scryfall.com/card/inr/198/ghoultree) | {7}{G} | Zombie Treefolk finisher discounted by creature cards in the graveyard. |
| 1 | [Sludge Titan](https://scryfall.com/card/clu/43/sludge-titan) | {4}{B/G}{B/G} | Large trampling Zombie; fills the graveyard and can recover a milled creature/land. |
| 1 | [Mulch](https://scryfall.com/card/dsc/189/mulch) | {1}{G} | Finds lands while putting nonlands in the graveyard. |
| 1 | [Grapple with the Past](https://scryfall.com/card/tdc/257/grapple-with-the-past) | {1}{G} | Limited self-mill and optional creature/land recovery. |
| 1 | [Regrowth](https://scryfall.com/card/mh1/175/regrowth) | {1}{G} | Recovers any card that was milled or used. |
| 1 | [Ram Through](https://scryfall.com/card/cmm/314/ram-through) | {1}{G} | Creature-based removal; especially relevant with deathtouch or a large trampler. |
| 1 | [Rancor](https://scryfall.com/card/2x2/156/rancor) | {G} | Repeatable trample and power boost, letting Ghoultree or small Zombies attack through blockers. |
| 1 | [Return to Nature](https://scryfall.com/card/moc/309/return-to-nature) | {1}{G} | Answer to artifacts, enchantments, or a key graveyard card. |
| 1 | [Thriving Grove](https://scryfall.com/card/msc/579/thriving-grove) | — | Enters tapped; choose the other packet's color for optional fixing. |
| 7 | [Forest](https://scryfall.com/card/fdn/280/forest) | — | Basic green mana. |

**Composition:** 6 creature cards, 6 other spells, 8 lands.

**Playing the packet**

- Every spell is castable using green mana. Slitherhead and Sludge Titan are black-green cards with hybrid mana costs, but their symbols can all be paid with green. Their actual colors remain black and green.
- The two repeated nonbasic cards are intentional: two Slitherheads and two Sultai Devotees preserve an actual-Zombie early curve without adding radiation, foretell, or obligate off-color cards. All other nonbasic cards are singleton within the Zombie faction.
- Slitherhead's scavenge costs 0, exiles that card from the graveyard, and is activated only at sorcery speed. The resulting counter can help any creature. Removing the card means it no longer discounts a Ghoultree that has not been cast.
- Sultai Devotee is a 2/1 with deathtouch. Its once-per-turn ability pays 1 to produce B, G, or U: this is filtering, not extra mana or a tap ability. Its body functions without using that ability.
- Ghoultree costs one generic mana less for each creature card in its controller's graveyard, down to a minimum of G. It has no trample by itself; Rancor supplies that role.
- Sludge Titan's mill 5 is mandatory whenever it enters or attacks. Recovery of a creature and/or land among those five cards is optional. Choosing not to attack can avoid another mill trigger. It does not recover arbitrary older graveyard cards.
- Mulch reveals four and puts lands into hand, other cards into the graveyard; it does not put lands directly onto the battlefield. Grapple's recovery can choose any creature or land card already in the graveyard, not just its newly milled cards.
- Ram Through deals damage from the chosen friendly creature, not from the spell itself. Deathtouch is therefore relevant; damage to the opposing player only arises from its trample clause.
- Rancor returns only when it goes from the battlefield to a graveyard; an Aura spell that never entered does not trigger that return.
- Thriving Grove is not a Forest. It enters tapped and chooses a nongreen color as it enters; ordinarily choose the partner's mana color.

**First-test watch points**

- This half has six creatures and no natural three- or four-mana creature. Every other Zombie half must contribute enough middle-curve bodies; assess the combined deck, not this half alone.
- Sludge Titan repeatedly mills five cards in a forty-card deck. This is the main deliberate test risk, especially paired with blue. Track remaining library and do not attack automatically. If games are frequently lost to self-mill, replace Titan first rather than quietly changing its rules.
- Scavenge, Regrowth, Grapple, and a partner's recursion/exile costs all remove resources that may be needed for Ghoultree's discount.
- Rancor plus deathtouch/trample or Ram Through can be potent. Test its power against the largely ground-based Plant faction and do not assume low mana cost implies low impact.
- Rancor and Ram Through need a creature; creature-light opening hands can leave support inactive. This is another reason for the two approved duplicate exceptions.

**Retained alternatives:** Dreg Mangler; Shambling Shell; Skullbriar; Molderhulk; The Necrobloom — Retained in research, but these need off-color mana and cannot assume a specific partner. God-Eternal Rhonas — Power-doubling, vigilance, deathtouch, and unusual library return make a high-impact and busy baseline finisher. The Foretold Soldier — Forced-blocking, damage/exile, foretell, and recasting loop add unnecessary complexity. Glowing One; Tato Farmer — Radiation adds an unrelated subsystem. Moldervine Cloak — Dredge adds another draw-replacement/mill decision; Rancor fills the boost/evasion role with a simpler recurring Aura. A second Ghoultree — Adds another slow opening-hand card rather than improving the early curve.

<!-- END ZVP V0.1 PACKETS -->

## Physical inventory and reset

The box contains **160 deck cards: 96 nonlands and 64 lands**, stored as eight separately identified twenty-card packets, plus eight matching dividers. Supply the tokens and counters listed with the packets, two life trackers, and a coin or die. Tokens and other play aids remain outside the 160-card inventory.

Use the [packet preparation guide](../formats/jumpstart/building-packets.md) to mark every card, **including basic lands**, with its packet identifier. Use matching opaque outer sleeves throughout the box so that packet membership cannot be distinguished from card backs. Keep a versioned inventory with each packet.

After a game, collect cards from every zone, including any borrowed by the other player. Remove tokens and counters, then sort cards by packet identifier. Restore every packet to its exact listed twenty cards, including its lands, and return its divider. Check counts and resolve missing or misplaced cards before returning the packets to the pool. Restore any double-faced cards to their front faces before storage.

### Tokens and markers

Supply several copies or clearly labeled substitutes for repeatable tokens; the number of supplied token cards never limits how many the game can create.

| Token | Produced by | Reminder |
| --- | --- | --- |
| Green 1/1 Saproling | Fists of Ironwood, Deathbloom Thallid, Fungal Infection | Can attack and block normally; these are the tokens Thallid Omnivore specifically rewards. |
| Black 1/1 Fungus | Synapse Necromage | **Cannot block.** Distinguish these from Saprolings. |
| White 4/4 Elemental with flying | Hoofprints of the Stag | Rootborn Defenses can copy it; it remains an Elemental rather than a Treefolk. |
| Colorless Treasure artifact | Shambling Ghast | Tap and sacrifice it to add one mana of any color. Reanimating the Ghast can make more. |
| White 1/1 Zombie Cat with lifelink | Sacred Cat's embalm | No mana cost; keep the original exiled card available for reset. |

Supply **+1/+1 counters**, a distinct **-1/-1 counter** for Moonlit Lamenter, and **hoofprint counters**. Temporary +1/+1 bonuses, Flowering's bonus, and base-size changes are not counters. Use notes for temporary effects and for a creature changed by Rise from the Grave.

Wild Awakening also needs **land-animation reminders**, not creature tokens. Keep the actual land on the battlefield and record its temporary or ongoing creature form:

| Source | Land's creature form | Duration / other reminders |
| --- | --- | --- |
| Awakener Druid | Green 4/5 Treefolk | While that Druid remains; no haste granted. Must target a Forest. |
| Genju of the Cedars | Green 4/4 Spirit | Until end of turn after paying 2; no haste granted. Enchants a Forest. |
| Nissa's Zendikon | Green 4/4 Elemental, reach and haste | While enchanted; the Aura can return the land card to hand when the land dies. |
| Rampaging Growth | 4/3 Insect, reach and haste | Until end of turn; the fetched basic remains a land afterward. This effect does not give it a color. |
| Embodiment of Insight | 3/3 Elemental, haste | Until end of turn; this effect does not give it a color. The Embodiment separately gives your land creatures vigilance while present. |

Animation keeps the land's land types and abilities unless the card says otherwise. It does not untap the land. Distinguish lands played this turn from lands controlled since the turn began when checking whether a creature-land without haste can attack or use a tap ability.

## Design boundaries

The first draft favors familiar combat, useful early creatures, and a small number of mechanics. Each packet is **half a deck** and should contribute a useful plan with each of its three same-faction partners. Ancient Grove's Treefolk supply larger threats; its literal birds and supporting Druid help it participate early. Humanoid Bird people are not part of that canopy-support theme. Botanical Elementals, Dryads, and suitable noncreatures can support the Plant identities without changing their printed types.

Packets are built to function with one mana color. A hybrid card is acceptable when that color can pay its costs; this does not change the card's actual colors and does not invoke Commander color identity. Prefer singleton nonbasic cards across packets that can be combined. Any deliberate repeat should have a recorded thematic or functional reason; repeating expensive creatures does not repair an early curve.

All unused candidates remain in the [shared research](../research/zombies-vs-plants.md) for rebalancing and the future cube. Multicolor packets, three-packet sixty-card decks, and optional spotlight cards remain separate ideas. This version has **no upgrade pool, substitutions, special mana rule, or free casting**. The Necrobloom and other appealing multicolor undead stay on the Zombie-side research wishlist until a separate construction and mana plan supports them. A future spotlight upgrade would need an eligible pair, exact card-and-land substitutions, a fair selection rule, and a reset inventory; none is enabled in v0.1. The ordinary-animal invasion of New York remains a [separate future Horde box](new-york-animal-invasion.md).

## Pairing checks

These are design expectations to test, not results. Each packet has three legal partners; all six pairings in each faction are supported by the inventory.

| Faction | Pair | Expected link and main question |
| --- | --- | --- |
| Plants | Overgrowth + Ancient Grove | Plants fix white mana and build a ground board; birds carry buffs. Does Creeperhulk make the flying finish too strong? |
| Plants | Overgrowth + Spore Swarm | Saprolings feed sacrifice effects or become large attackers. Does the combined deck produce enough fodder without sacrificing its entire board? |
| Plants | Overgrowth + Wild Awakening | One-color mana, landfall, and animation reinforce each other. Does ramp crowd out pressure or interaction? |
| Plants | Ancient Grove + Spore Swarm | Fungi provide bodies and card draw, helping convoke and Hoofprints. Can white's WW cards arrive reliably without green fixing? |
| Plants | Ancient Grove + Wild Awakening | Basic-land search fixes white; birds help convoke large Treefolk. Are too many draws devoted to mana and slow setup? |
| Plants | Spore Swarm + Wild Awakening | Recovery and life gain support Trudge; Fungi buy time for animated lands. Do players sacrifice tokens instead of accidentally exhausting their mana base? |
| Zombies | Restless Dead + Stitched Together | Self-mill feeds recursion and Skaab costs. Does it produce enjoyable value without overloading the graveyard decisions? |
| Zombies | Restless Dead + Tomb Guard | Ordinary Zombies trigger mummy payoffs; black supplies recursion and removal. Are tribal bonuses consistent without becoming overwhelming? |
| Zombies | Restless Dead + The Turned | Cheap Zombies fill the curve and graveyard for the large green threats. Are recursion and scavenge competing too much for the same cards? |
| Zombies | Stitched Together + Tomb Guard | Blue supplies draw and interaction; mummies reward continued Zombie entries. Can it close a game without green's large bodies? |
| Zombies | Stitched Together + The Turned | Mill supports Ghoultree and recovery. **Watch Sludge Titan closely:** repeated mill-five can exhaust a forty-card deck. |
| Zombies | Tomb Guard + The Turned | Mummy bonuses help the green Zombies; deathtouch and trample give combat choices. Can the deck bridge green's missing middle curve without blue/black draw? |

**Mana:** a Thriving land enters tapped and chooses its second color **as it enters**. Normally choose the other packet's color; in green-green, choose any permitted nongreen color and use the land for green. Thriving lands have no basic land type. Wild Awakening uses Ash Barrens plus basic-land searches instead; basic landcycling puts a land in hand, not onto the battlefield. No spell assumes another packet supplies a missing casting color.

**Curve:** the JSON includes printed mana-value counts, which do not capture Groff's extra cost, Ghoultree's discount, convoke, or the later payments needed for Hoofprints and land animation. Count usable early plays when reviewing hands, not just printed numbers.

## Test and revise

Record **box version, both packet pairs, starting player, result, and game log**. Note mana problems, missed early plays, rules mistakes, stalled boards, memorable interactions, and cards that felt ineffective or overwhelming. Evaluate each packet with all three of its partners, including whether Ancient Grove gets enough early support and whether black Fungi functions without green.

Four packets yield six distinct pairs per faction, or **36 opposing pairings**. Start with representative games, then repeat questionable pairings and swap which side starts. Distinguish a rules mistake or unusual draw from a repeated deck problem before changing cards. The aim is useful, approachable games rather than proving balance from a single result.

Keep v0.1 lists intact in the record. For each revision, record the changed card quantities and the reason, assign a new version, and update the packet inventories. Retain cut cards in research. Compare results against the exact versions played rather than combining different lists under one packet name.

## References

- [Two-Packet Jumpstart](../formats/jumpstart/variants/two-packet.md): this box's full base rules and original format sources.
- [Custom packet preparation](../formats/jumpstart/building-packets.md): this catalogue's construction, labeling, and storage conventions.
- [Zombies vs Plants card research](../research/zombies-vs-plants.md): Scryfall card evidence, thematic candidates, alternatives, and future cube notes.
- [Wizards' Jumpstart introduction](https://magic.wizards.com/en/news/announcements/introducing-jumpstart-new-way-play-magic-2020-02-20) and [original packet lists](https://magic.wizards.com/en/news/feature/jumpstart-decklists-2020-06-18): the two-packet product concept and examples.
- [Official Magic rules](https://magic.wizards.com/en/rules): the underlying game rules; use current Oracle wording linked in the card lists for individual cards.

The faction concept, same-faction restriction, theme assignments, and singleton preference come from the owner's design. The exact v0.1 lists and ZP2 selection procedure are local draft choices for this box, not Wizards rules.
