---
title: Zombies vs Plants — Card Research
description: Shared Zombies vs Plants card research for Jumpstart and a future cube, including botanical creatures, undead themes, support spells, and mana fixing.
researchBrowser: zombies-vs-plants
---

# Zombies vs Plants — Card Research

[Box concept and pairing rule](../boxed-sets/zombies-vs-plants-jumpstart.md) · [All research](./) · **Researched October 21, 2026**

Explore cards and ideas for **eight Jumpstart packets: four Plants and four Zombies**, and a future cube. This gallery remains a **research pool, not a decklist**. The [boxed-set page contains all eight v0.1 twenty-card lists](../boxed-sets/zombies-vs-plants-jumpstart.md), including lands, roles, setup, and test notes. The first game has now been played; its interaction findings and candidates are below. Unused candidates stay here for rebalancing. The pictures and Oracle text are sourced from Scryfall; the role, fit, mana, and caution notes are our design judgments.

## First playtest: more chances to interact

[Browse the interaction shortlist](./zombies-vs-plants.html?q=interaction%20study&sort=mana-asc) with card images, Oracle text, and individual tradeoffs. **These are proposed changes, not replacements already applied to v0.1.**

The October 21 game (`e7dd2877-c60d-4b18-b5a1-7730d6216636`) paired **Overgrowth + Spore Swarm** against **Restless Dead + The Turned**. Plants won. Zombies reported sparse interaction and repeated unanswered attacks, rating meaningful choices 4/10; Plants rated its choices 7/10 and highlighted its removal and sacrifice decisions. That difference suggests investigating how readily each side can answer threats, without treating one game as proof of a faction-wide imbalance.

The saved actions and final deck state make the problem more specific:

- Plants used **Fungal Infection**, **Feed the Swarm**, and **Nature's Way** to remove successive Zombie blockers. These were already thematic interaction in the original lists.
- Zombies' **Dead Weight** and **Ram Through** remained undrawn. **Eviscerate** was milled at revision 61; **Return to Nature** also remained in the library. The list contained answers, but this game did not put them into hand in time.
- **Ram Through needs a surviving creature.** More spells with that same dependency will not help when every blocker has been removed. A cheap answer usable from an empty battlefield is the first role to test.
- Zombies repeatedly spent mana recovering creatures. Recursion can be valuable, but it competes with rebuilding and answering the opponent; adding still more recovery is not the first experiment.

**Check feedback claims against card text.** Plants' survey says Nature's Way prevented Bayou Groff's combat damage. The supplied card snapshot and [current Oracle text](https://scryfall.com/card/jmp/412/natures-way) give vigilance, trample, and damage to an opposing creature; there is no damage-prevention effect. Its claimed prevention-based invalidation of lethal is unsupported. That does not certify the entire game as error-free. Preserve the original survey as the player's report rather than silently rewriting it into a verified rules finding.

### Best candidates for the next revision

| Packet | Candidate | What it adds | Proposed comparison |
| --- | --- | --- | --- |
| Restless Dead | **[Infernal Grasp](https://scryfall.com/card/soc/216/infernal-grasp)** · {1}{B} instant | Broad death magic: destroy a creature and lose 2 life. Works with no creature of your own and only one black mana symbol. | **First test: replace Rise from the Grave.** Keep Eviscerate, Dead Weight, all eight creatures, and the cheaper recovery cards. |
| Restless Dead | **[Tragic Slip](https://scryfall.com/card/inr/134/tragic-slip)** · {B} instant | A death turns -1/-1 into -13/-13. Zombie deaths, combat trades, and sacrifices can enable a dramatic answer. | A flavorful alternative experiment, not an unconditional substitute for Eviscerate. Without a death it cannot kill a large threat. |
| Stitched Together | **[Chill of the Grave](https://scryfall.com/card/vow/51/chill-of-the-grave)** · {2}{U} instant, discounted to {1}{U} with a Zombie | Grave-cold taps a creature, keeps it tapped through its next untap, and draws a card. | Compare with **Think Twice**: exchange later flashback value for immediate interaction. Blue already has several answers, so this is a later refinement. |
| Tomb Guard | **[Desert's Hold](https://scryfall.com/card/hou/8/deserts-hold)** · {2}{W} Aura | Tomb/desert restraint stops attacks, blocks, and activated abilities, including a sacrifice engine. | Compare with **Unconventional Tactics**. The current pack has no Desert, so its conditional life gain is unavailable; the restraint still works. |
| Overgrowth | **[Lignify](https://scryfall.com/card/gvl/16/lignify)** · {1}{G} Aura | Turn a creature into an abilityless base 0/4 Treefolk. Botanical interaction that needs no friendly creature. | Compare with **Nature's Way**, changing the kind of answer rather than simply giving the winning pair more removal. The opponent keeps a blocker; counters and other modifying effects can still matter. |
| Ancient Grove | **[Sundering Growth](https://scryfall.com/card/c19/203/sundering-growth)** · {G/W}{G/W} instant | Vegetation destroys an artifact or enchantment, then copies one of your creature tokens if you have one. | Compare with **Rootborn Defenses** when problematic Auras or engines justify it. Payable with white alone, but two white pips matter with the black partner; it is not a general creature answer. |

**Start with the one Restless Dead swap**, then repeat the same pairing with starting seats reversed. That preserves the creature count and isolates a cheaper, independent answer. Record whether it was drawn, castable when needed, actually used, and enough to create a meaningful choice. A card remaining in the library cannot establish that its rules or mana cost failed. Test the other pairings before applying every suggestion at once.

### Reserves and limits

- **The Turned:** [Bite Down](https://scryfall.com/card/fdn/212/bite-down) gives the Zombies another literal bite and could replace Regrowth, but duplicates Ram Through's reliance on a friendly creature. Keep this as a reserve rather than the first fix for an empty board.
- **Spore Swarm:** retain Fungal Infection and Feed the Swarm for the next comparison; they supplied meaningful interaction in this game. [Eaten Alive](https://scryfall.com/card/inr/106/eaten-alive) can turn expendable fodder into exile removal, but its sacrifice requirement makes it a conditional alternative. Without a sacrifice, its total cost is **{3}{B}{B}**, not four mana.
- **Wild Awakening:** [Insidious Fungus](https://scryfall.com/card/dsk/186/insidious-fungus) is a small botanical body with an artifact/enchantment answer or a draw-and-land option. It could replace Return to Nature for a different mix of flexibility and timing, but loses graveyard exile and requires {2} plus sacrificing it to activate. The pack already has Ram Through for creatures.
- **Ancient Grove:** [Martyred Rusalka](https://scryfall.com/card/gpt/12/martyred-rusalka) is a cheap tree-associated Spirit that can sacrifice a creature to prevent an enemy creature attacking that turn. Act **before attackers are declared**; it does not remove an existing attacker from combat. [Utopia Vow](https://scryfall.com/card/tsr/245/utopia-vow) is a green botanical alternative for Overgrowth: restraint in exchange for giving the enchanted creature a mana ability. Neither needs to displace the grove's preferred ordinary birds.
- **Bone Splinters** has excellent undead flavor, but paying a creature as an additional cost can make the lack-of-blockers problem worse. **Protection**, **recursion**, **combat tricks**, **temporary tapping**, and **removal** each supply different decisions; do not count all of them as interchangeable answers to an established threat.

The broader research remains available for the cube. These tests keep the Jumpstart packets monocolor, twenty cards each, and focused on familiar effects.

## Shared research for Jumpstart and a future cube

**Retain this entire research pool for Jumpstart rebalancing and a future Zombies vs Plants cube, regardless of the first draft's selections.** Leaving a candidate out of a draft is not a reason to remove it from the research. Preserve its role, selection concerns, saved Oracle data, images, rulings where available, source queries, theme tags, and mana needs so later revisions can reconsider it. Cards that are too demanding, complex, powerful, or unsuitable for a twenty-card packet remain useful comparisons and possible cube choices. The Necrobloom and other multicolor candidates remain here even if they do not enter the first Jumpstart lists.

Versioned Jumpstart packet lists and a future cube inventory will be separate selections from this shared research. Each Jumpstart revision should record its replacements and reasons without shrinking the candidate pool. No cube size, draft procedure, color distribution, singleton policy, or final card list has been chosen. The Jumpstart same-faction pairing restriction applies to that box; cube drafting and faction restrictions need their own design decision.

## Eight-pack shortlist

The packet themes and mana colors are confirmed; names and contents remain provisional. The four Plant themes are Plants, Treefolk, Fungi, and Lands, with suitable Elementals and other creature types mixed in. The Zombie themes are ordinary black necromancy, experiments, ancient tombs, and The Turned. The first Jumpstart box targets **simple, easy-to-play mono-color packets**. Broader color combinations remain research for the future cube.

| Faction | Working pack name | Confirmed mana color | Brief identity |
| --- | --- | --- | --- |
| Plants | **Overgrowth** | Green | Hungry Plants, roots, and vines. Grow and protect a few increasingly dangerous creatures. |
| Plants | **Ancient Grove** | White | Stompy Treefolk and botanical support supply the combined deck's larger threats. |
| Plants | **Spore Swarm** | Black | Early Fungi, death value, and token production recycle the fallen without requiring green mana. |
| Plants | **Wild Awakening** | Green | The landscape joins the fight: animated forests, botanical Elementals, and vegetation brought to life. |
| Zombies | **Restless Dead** | Black | Classic necromancy: raise the dead, reuse fallen creatures, and make sacrifice worthwhile. |
| Zombies | **Stitched Together** | Blue | Laboratory Zombies assembled from spare parts. Stock the graveyard and build stitched monstrosities. |
| Zombies | **Tomb Guard** | White | Mummies and disturbed tomb guardians. Coordinated attacks, protective magic, and carefully chosen embalming effects. |
| Zombies | **The Turned** | Green | Zombified plants lead the theme, backed by other green Zombie menaces where useful. |

The owner confirmed **green Plants, white Treefolk, black Fungi, and green Lands**. The Zombie colors remain **black, blue, white, and green**. The Turned includes botanical undead where practical and other green Zombies where needed. Off-color discoveries remain in the shared research for the cube; they do not change the first Jumpstart box's confirmed directions.

A theme permits creature-type mixing and support spells. **White Treefolk is deliberately the stompy half of a combined forty-card deck**: it contributes larger threats and support, while the other three Plant packets should provide useful early plays. White can also include cheap botanical helpers and interaction. Test Ancient Grove with Plants, Fungi, and Lands separately; it need not be an independently balanced twenty-card deck. The v0.1 quantities are recorded separately on the boxed-set page; the research pool remains broader than those selections.

**Singleton nonbasic variety remains preferred across compatible packets.** The owner allows deliberate repeats when a theme has too few suitable cards. Record that reason and test the result. Repeating expensive Treefolk increases their density; it does not create early plays or fix the combined deck's curve.

The gallery's filters are broader research categories, not eight completed packet lists. Plants, Treefolk, Fungi, and Living lands feed the four Plant proposals; Botanical allies supplies case-by-case candidates across them. Supporting spells and appropriately themed Dryads or Elementals can fit without changing their actual creature types.

### Faction decision: undead identity takes precedence

**Zombified botanical creatures belong to the Zombie faction.** A Plant Zombie is an enemy of the living garden, not automatically a candidate for both sides. The same applies to Zombie Treefolk, Zombie Fungi, and botanical Zombie Elementals such as Skullbriar. The Necrobloom is assigned to the Zombie side by its undead theme even though its actual type is Plant.

The browser preserves their botanical research tags so the discoveries remain easy to find, but its faction filter assigns these cards only to Zombies. The featured overlap marker records a botanical/undead combination; it does not indicate dual alignment. Ordinary living Fungi and Saprolings remain eligible for Plants: decomposition or a graveyard mechanic alone does not make a creature undead.

Only packets from the same faction can combine under the box's agreed rule. Faction labels do not grant card types or abilities.

## Searching beyond creature types

The research includes **creatures, token makers, tribal boosts, and supporting spells**. A card does not need Plant, Treefolk, Fungus, or Zombie in its own type line to belong. Look at what it creates, what it helps, and its botanical or undead theme. The card-kind filter can isolate noncreatures; searching the rules text or notes can find token makers and other support.

For botanical discoveries, use these as research directions rather than a new rules classification:

| Direction | How we use it |
| --- | --- |
| Plant, Treefolk, Fungus, Dryad | Strong places to begin creature research. Preserve the actual Oracle types; botanical flavor does not make a Dryad a Plant. |
| Saproling and Splinter | Include the cards that create or support these tokens. Token objects are not separate cards to put into a packet. Splintering Wind is one such lead, with significant upkeep and damage drawbacks. |
| Elemental, Spirit, Nymph, Avatar, Wall | Inspect individual cards for trees, vines, flowers, gardens, or vegetation spirits. Woodvine Elemental and Kodama of the North Tree illustrate why a type-only search misses possibilities. |
| Golem, Construct, Scarecrow | Consider wooden, wicker, or other botanical materials case by case. Crop guardians are a looser thematic extension, not an adopted packet identity. |
| Horror, Ooze, Beast, Wurm, Phyrexian, Zombie, and other broad types | Search for specifically botanical members rather than including the whole type. Corrupted growth or reanimated vegetation can be especially useful for this matchup. |
| Elf, Druid, and other practitioners | A plant-magic support card can fit even when its creature is not botanical. Forest association alone is not enough to include every member. |

The [Plant wiki](https://mtg.fandom.com/wiki/Plant) and related [Spuzzem entry](https://mtg.fandom.com/wiki/Spuzzem) are useful discovery leads, particularly for old names and type changes. Floral Spuzzem, Singing Tree, and Wall of Kelp are recorded with their current Scryfall types and rules, regardless of wording on an old printing. Wiki trivia and visual interpretation guide discovery; Scryfall supplies the card facts.

Some supplied leads needed correction: **Nessian Wanderer is a Satyr Scout**, not a Nymph or Dryad. An exact Scryfall lookup found no card named **Timber Golem**. These checks are retained in the search provenance rather than turning an unverified example into a candidate.

### Living forests and swamps

Animated forests and swamps are automatic **investigation** candidates for the Plant faction, regardless of the creature type they gain. The **Living lands** filter covers land creatures, cards that animate lands, and support that specifically improves land creatures. It now supplies the proposed **Wild Awakening** packet; the filter remains a broad investigation pool, not its selected contents.

The notes distinguish actual Forest or Swamp subtypes from woodland or marsh flavor. **Living Lands** animates Forests; **Kormus Bell** animates Swamps; both affect opponents too. **Llanowar Loamspeaker** and **Sylvan Awakening** can animate either kind of land. **Hissing Quagmire** is a living mire but is not typed as a Swamp, while **Treetop Village** becomes an Ape and is not typed as a Forest. Those differences matter for card interactions, not for whether we investigate the theme.

Animation can expose the mana base to creature removal, and some effects create complicated interactions. **Life and Limb**, for example, turns Saprolings into Forest lands as well as animating Forests. Combined with **Sporemound**, this can repeatedly trigger mandatory token creation. Such cards remain visible with cautions so we can investigate them without silently treating them as suitable starter cards.

Prefer enablers that preserve this identity instead of turning it into an Elf deck. **Awakener Druid** is a Human Druid that animates a Forest, while **Animate Land**, **Awakening of Vitu-Ghazi**, and **Brave the Wilds** provide spell-based alternatives. **Ambush Commander** stays in the research as a comparison, but its Elf identity and its conversion of Forests into Elves make it a lower-priority fit. An enabling Druid does not need to be called a plant to justify its support role.

## Priority botanical undead

The owner requested all actual **Zombie Plants, Zombie Treefolk, and Zombie Fungi** as thematic priorities. Every card returned by the explicit creature-type intersection query is included in this snapshot. The browser highlights them and offers a botanical-undead filter. They are priorities for finding a home somewhere in the box, not a requirement to cram every card into every packet.

| Actual overlapping types | Cards found |
| --- | --- |
| Plant Zombie | Creakwood Ghoul; Dreg Mangler; Shambling Shell; Slitherhead; Vulturous Zombie; Woodwraith Strangler. |
| Zombie Treefolk | Black Oak of Odunos; Ghoultree. |
| Zombie Fungus / Fungus Zombie | Deathspore Thallid; Molderhulk; Rhizome Lurcher. |

**Slitherhead** is especially flexible: its single black/green hybrid cost can be paid with either color. **Dreg Mangler**, in contrast, needs both black and green. A shared creature type does not remove a colored mana requirement. The overlap marker records botanical and undead identity, while its research tags preserve the Plant, Treefolk, or Fungus connection. Its eventual Zombie packet placement remains open.

These undead candidates are reserved for the Zombie side. The same-alignment pairing rule and preference for varied nonbasic cards across compatible packets still apply.

### Special mention: The Necrobloom

[The Necrobloom](https://scryfall.com/card/mh3/194/the-necrobloom) is a particularly strong **flavor crossover**: its actual type is **Legendary Creature — Plant**, and its landfall ability creates Plants or, once you control seven lands with different names, Zombies instead. It also gives land cards in your graveyard dredge 2. That is a compelling bridge between growth and necromancy without a Zombie type line.

It appears under the Zombie faction with a **Botanical undead · flavor** marker, separate from the eleven explicit creature-type overlaps above. Its three-color cost and seven-different-land-names condition deserve attention before any packet assignment: seven basic lands with repeated names will not unlock its Zombie tokens. It is a research priority, not yet a commitment to a particular mana base or packet.

### Botanical Zombies beyond Plant, Treefolk, and Fungus

[Skullbriar, the Walking Grave](https://scryfall.com/card/2x2/277/skullbriar-the-walking-grave) is another priority **flavor crossover**. Its roots and overgrowth belong in the botanical investigation even though its actual type is **Zombie Elemental**. It belongs to the Zombie faction while retaining its Botanical allies research tag. Its black-green cost needs deliberate fixing, and its unusual retention of counters through zone changes is documented with saved rulings in the card details.

The separate Zombie Elemental search also returned **Invasion of Azgol // Ashen Reaper**. That result was not selected as botanical: a Zombie Elemental type line alone does not establish plant flavor. Keep looking at individual creatures and art rather than restricting this investigation to the three core botanical types.

### Proposed Zombie theme: The Turned

The owner proposed **The Turned** as a green-led Zombie packet identity, particularly for plant-like creatures that have become undead. It is one of the eight shortlisted packet identities; its first green-paid twenty-card list is now recorded on the boxed-set page, while the broader pool remains under investigation. It gives the botanical crossovers a possible home on the Zombie side without displacing the existing black necromancy, blue stitched-creature, or white mummy ideas.

Initial leads include Slitherhead, Dreg Mangler, Shambling Shell, Vulturous Zombie, Woodwraith Strangler, Ghoultree, Molderhulk, Rhizome Lurcher, and Skullbriar. Several of these wider research leads need black as well as green and therefore do not fit the current mono-green Jumpstart target. Slitherhead can be cast entirely with green through its hybrid cost; Ghoultree needs only green. Other green Zombies can fill out the theme. The browser's **The Turned** research filter groups these leads for investigation without assigning final quantities or a mana base.

**The Necrobloom** is also a proposed candidate through its flavor and its Plant/Zombie token production, despite not having the Zombie type itself. Its cost is **{1}{W}{B}{G}**, so a packet containing it must intentionally support white, black, and green. It cannot assume that a white mummy packet will always be its partner. Its seven-differently-named-lands condition remains a separate construction challenge, not something solved merely by adding three colors.

### The Necrobloom and optional multicolor upgrades

The Necrobloom stays on the **Zombie research wishlist** while we build a coherent base box. Casting it needs white, black, and green; a pair of ordinary mono-color packets does not by itself supply all three. Flexible mana sources can supply a third color without changing the game rules, but those sources must actually be included and drawn. Its Zombie-token condition separately requires **seven lands with different names**, not simply seven lands or three colors. It still makes Plants below that threshold, but that misses much of the desired undead payoff.

A possible later module is a **prepared spotlight upgrade** selected after the packet pair: one exciting multicolor card accompanied by a fixed list of card and land substitutions, preserving the forty-card deck and recording how to restore both packets. A black-green pair such as Restless Dead + The Turned could be the starting point for a Necrobloom upgrade with white access and an appropriate land package. This is a design direction, **not an adopted or playable module**: the full replacements, allowed pairs, selection fairness, mana reliability, and power level must be designed and tested first. There is no free casting, command zone, or change to the printed cost proposed here.

A simpler optional pool for two-color cards could work with matching pairs, but a color match alone does not guarantee enough sources or a balanced upgrade. Adding a three-color card alone is not a solution. The base box currently keeps all twenty cards from each packet; any future substitution module must explicitly replace that setup instruction.

## Earlier construction alternatives — retained for later

The first prototype now uses simple mono-color packets with the two-packet, forty-card base rules. These earlier alternatives remain recorded for future experiments; they are not active changes to the first box:

- **Mixed mono-color and two-color packets:** choose colors around each theme and include enough fixing for every allowed partner.
- **All two-color packets:** allow two- to four-color combined decks, with greater demands on fixing and early colored costs.
- **Optional cards after pairing:** a possible extra pool of multicolor cards, requiring a complete selection, replacement, mana, and reset procedure.
- **Three twenty-card packets:** sixty-card preassembled decks; larger decks do not by themselves solve color access. With four distinct packets per faction, choosing three creates four combinations per faction, compared with six when choosing two.
- **Future cube:** retain the broader card pool for a separate draftable design; Jumpstart can remain the simpler way to play with the same themes.

## Functional checks for simple mono-color packets

These October 21, 2026 checks use current Scryfall Oracle text. They assess what the cards require and how each packet contributes to a combined deck; the subsequent v0.1 lists are now drafted, but have not been playtested. A card should not silently require missing colors or an unsupported mechanic, but each packet need not be a balanced standalone deck. Card quantities in a search are discovery evidence, not proof that all results are suitable.

### White Treefolk: confirmed stompy and support role

A Treefolk core supplies the larger threats, backed by botanical creatures, removal, and protection. The other three Plant packets are expected to supply early plays. Cheap white helpers can improve those pairings without changing the packet into a generic small-creature deck or requiring every creature to be a Treefolk.

- [Indomitable Ancients](https://scryfall.com/card/tdc/121/indomitable-ancients) is a **2/10 for {2}{W}{W} with no abilities**. It functions independently but contributes little offensive power.
- [Old Ghastbark](https://scryfall.com/card/shm/232/old-ghastbark) is a **3/6 with no abilities**, costing {3}{G/W}{G/W}. It is both green and white as a card, but **white mana alone casts it**.
- [Sun-Dappled Celebrant](https://scryfall.com/card/ecl/37/sun-dappled-celebrant) is a **5/6 for {4}{W}{W} with convoke and vigilance**. Its payoff is self-contained and it offers a credible attacker; convoke adds a casting decision.
- [Moonlit Lamenter](https://scryfall.com/card/ecl/26/moonlit-lamenter) supplies its own -1/-1 counter and can remove it for a card. It does not require a separate counter engine, but adds bookkeeping, especially alongside +1/+1 counters.
- [Oaken Brawler](https://scryfall.com/card/lrw/33/oaken-brawler) and [Sentry Oak](https://scryfall.com/card/lrw/38/sentry-oak) introduce clash. Sentry Oak repeats that process to attack, making it a lower priority for the simple version.
- [Flowering of the White Tree](https://scryfall.com/card/ltr/15/flowering-of-the-white-tree) is a useful whole-deck buff: its nonlegendary-creature bonus works on Plants, Fungi, animated lands, and tokens as well as Treefolk. Its additional legendary-creature text and two-white cost deserve review.

White has botanical support beyond creatures. [Rootborn Defenses](https://scryfall.com/card/plst/RVR-26/rootborn-defenses) protects the board even without a token to populate, but its extra keyword is a complexity cost. [Seed Spark](https://scryfall.com/card/rav/30/seed-spark) needs green mana spent to make its Saprolings, so that token mode must not be assumed in a self-contained white packet. White land-animation spells such as [Encircling Fissure](https://scryfall.com/card/bfz/23/encircling-fissure) exist, but awaken adds more rules than basic protection.

#### Birds of the canopy

The owner explicitly supports **actual birds as inexpensive allies of Treefolk**: hawks, falcons, eagles, ravens, and rocs living among the trees. **Bird people, avian warriors, and similar humanoids are outside this direction.** Ancient Grove keeps its Treefolk identity while birds contribute early bodies, aerial defense, and ways to attack over a crowded ground battlefield. The v0.1 packet now uses one copy of each of the three preferred birds; the other candidates remain available.

**Preferred early-bird candidates: Healer's Hawk, Rustwing Falcon, and Suntail Hawk.** The owner particularly likes the first two and endorses Suntail as a classic, simple option that allows more distinct cards and fewer duplicates. Its lower stats than Rustwing are an accepted tradeoff for singleton variety. The v0.1 Ancient Grove list includes one of each; further changes will depend on testing the full packet and its pairings.

The owner's white Bird search, bounded to paper/non-funny cards released by October 21, 2026, returned 40 cards at mana value two or less. That includes unsuitable creature identities and mechanics; the saved shortlist is curated rather than an automatic inclusion of every match. Every Bird selected here has the actual type **Creature — Bird**.

| Early bird | Role and limitation |
| --- | --- |
| [Healer's Hawk](https://scryfall.com/card/fdn/734/healers-hawk) | **{W}, 1/1, flying and lifelink.** Early pressure and life gain with every partner. General power boosts improve both its damage and life gain. |
| [Rustwing Falcon](https://scryfall.com/card/m19/36/rustwing-falcon) | **{W}, 1/2, flying.** A particularly simple early body with a little more toughness. |
| [Battlefield Raptor](https://scryfall.com/card/khm/3/battlefield-raptor) | **{W}, 1/2, flying and first strike.** Another actual bird; stronger combat options, but first strike adds a damage-step rule and may be potent with buffs. |
| [Suntail Hawk](https://scryfall.com/card/m14/40/suntail-hawk) | **{W}, 1/1, flying.** A preferred classic option for singleton variety. Rustwing has one more toughness, but including distinct birds can avoid repeats while keeping the early plays simple. |
| [Courier Hawk](https://scryfall.com/card/cns/68/courier-hawk) | **{1}{W}, 1/2, flying and vigilance.** Can attack while remaining available to block, with no partner dependency or additional subsystem. |
| [Territorial Roc](https://scryfall.com/card/dtk/43/territorial-roc) | **{1}{W}, 1/3, flying.** Simple early defense while larger Treefolk develop; only modest offensive power. |
| [Beacon Hawk](https://scryfall.com/card/dis/3/beacon-hawk) | **{1}{W}, 1/1, flying.** Combat damage to a player can untap a creature, including an attacking Treefolk; {W} buys +0/+1 for the turn. More text, and the untap requires connecting rather than working like unconditional vigilance. |

Three-mana birds offer more direct support, while remaining above the main early-curve gap:

- [Keen-Eyed Raven](https://scryfall.com/card/acr/279/keen-eyed-raven): **{2}{W}, 2/2, flying**; puts a +1/+1 counter on another creature you control when it enters. Works with a Treefolk or any partner's creature, but cannot put the counter on itself.
- [Roc Charger](https://scryfall.com/card/clu/70/roc-charger): **{2}{W}, 1/3, flying**; when it attacks, another attacking creature without flying gains flying for the turn. It can help a large Treefolk get past ground blockers. Both must attack, so it does not enable a creature with defender to attack.
- [Scouting Hawk](https://scryfall.com/card/clb/41/scouting-hawk): **{2}{W}, 1/1, flying**; can find a basic Plains onto the battlefield tapped on entry if an opponent controls more lands. This is conditional catch-up ramp, not reliable access to a partner's Forest or Swamp, and adds searching and shuffling.
- [Eagle of the Watch](https://scryfall.com/card/ori/275/eagle-of-the-watch): **{2}{W}, 2/1, flying and vigilance**. A simple literal eagle alternative; it costs more than the early hawks and remains fragile.

The existing [Scion of Vitu-Ghazi](https://scryfall.com/card/dgm/7/scion-of-vitu-ghazi) lead also makes Bird tokens, giving its botanical Elemental another connection to this canopy theme. Flowering of the White Tree can strengthen both birds and Treefolk. Test flying pressure against each Zombie pairing and retain enough large Treefolk for the packet's identity to remain clear.

Some cheap Birds carry unsuitable dependencies: **Glint Hawk** needs an artifact to return; **War Falcon** needs a Knight or Soldier to attack; **Squadron Hawk** needs deliberate extra copies to use its search ability. **Ranger's Hawk** adds dungeon rules, and **Duskrider Falcon's** protection from black is unusually targeted at this opposing faction. None is a default early-body inclusion merely because its cost is low.

#### Cheap botanical helpers to compare

These are candidates, not selected additions or a reason to fill the packet with unrelated white creatures.

The owner explicitly includes **Nymphs and Dryads as nature-spirit allies of the grove**, with suitable Druids and individual Spirits alongside them. The theme can connect small forest guardians to large Treefolk without requiring every creature to share a type. Artwork and flavor can establish a fit even for a Wall; preserve actual Oracle types and distinguish a meaningful grove connection from incidental trees in a background.

| Candidate | Early role and limitation |
| --- | --- |
| [Juniper Order Rootweaver](https://scryfall.com/card/dmu/22/juniper-order-rootweaver) | A **2/2 Human Druid for {1}{W}**, the clearest new early practitioner lead. Its optional {G} kicker adds a +1/+1 counter to an allied creature; the basic body works without green, so that bonus is useful with a green partner rather than required. |
| [Alseid of Life's Bounty](https://scryfall.com/card/thb/1/alseid-of-lifes-bounty) | A **1/1 Nymph for {W}** with lifelink, explicitly endorsed for the nature-spirit theme. Pay {1} and sacrifice it to protect an allied creature or enchantment from a chosen color. Useful with every partner; protection has targeting and Aura consequences. |
| [Dryad Militant](https://scryfall.com/card/fdn/656/dryad-militant) | A **2/1 Dryad Soldier** payable with {W} alone. It gives an immediate body, but its global instant/sorcery exile can interfere with either player's spell recursion or flashback. |
| [Mycologist](https://scryfall.com/card/tsr/29/mycologist) | A **0/2 Human Druid for {1}{W}** that cultivates Saprolings and sacrifices them for life. It starts as a small blocker; natural token production takes three upkeeps and introduces spore counters. |
| [Scarecrow Guide](https://scryfall.com/card/woe/250/scarecrow-guide) | A **2/1 colorless Scarecrow for {2}** with reach. Once each turn it can convert one generic mana into a mana of any color; this is filtering, not ramp. A crop guardian is a looser thematic helper, not a plant creature. |
| [Kami of False Hope](https://scryfall.com/card/bok/10/kami-of-false-hope) | A **1/1 Spirit for {W}**, nominated for its tree-like spiritual imagery. Sacrifice it without a mana payment to prevent **all combat damage** that turn, including your own. An inexpensive way to buy time for larger creatures or token engines. |
| [Angelic Wall](https://scryfall.com/card/p02/10/angelic-wall) | A **0/4 Wall for {1}{W}** with flying and defender. The owner's forest-and-spiritual-wings interpretation makes it a grove guardian candidate despite its type. A substantial early blocker with no partner dependence; it cannot attack. |
| [Martyred Rusalka](https://scryfall.com/card/gpt/12/martyred-rusalka) | A **1/1 Spirit for {W}**, whose flavor explicitly connects its ghost to the Tree of Weeping. Pay {W} and sacrifice a creature to stop a target creature attacking that turn. Can use fungal fodder; activate before attackers are declared, since it does not remove an already-attacking creature. |
| [Candlegrove Witch](https://scryfall.com/card/mid/8/candlegrove-witch) | A **2/2 Human Warlock for {1}{W}**, a grove-practitioner lead. Coven can grant it flying at the beginning of combat if three creatures have different powers. The base body works with every partner; the bonus adds a power-counting check. |

**Juniper Order Rootweaver remains functional with black Fungi:** {1}{W} buys its 2/2 body; only the optional kicker needs green. The owner's other Juniper link points to [Juniper Order Advocate](https://scryfall.com/card/me2/20/juniper-order-advocate), although its visible label names [Juniper Order Druid](https://scryfall.com/card/ice/251/juniper-order-druid). Advocate is a white **1/2 for {2}{W}** that boosts green creatures while it is untapped. It is more partner-dependent: black Fungi can produce green Saprolings for it to boost, but white Treefolk and black Fungus bodies receive no bonus. The actual Druid is a separate green **1/1 for {2}{G}** that taps to untap a land, not a white candidate.

Mycologist also connects the themes without requiring green mana: black cards can produce green Saprolings for its life-gain ability, and its own Saprolings can feed the black packet's general sacrifice effects. That makes it worth investigating at low power, while its slow output remains a real limitation.

The owner's **tree-art** and **forest-art** searches are complementary discovery tools. With paper, non-funny, and October 21, 2026 cutoff filters, they returned 64 and 22 cards respectively, with 76 distinct cards combined. Only selected thematic leads enter this research; a tree in the background is not an automatic inclusion. Art searches also depend on printing: the forest search returned the [Portal Second Age Angelic Wall by Rebecca Guay](https://scryfall.com/card/p02/10/angelic-wall), while the tree search returned the [Tenth Edition version by John Avon](https://scryfall.com/card/10e/5/angelic-wall). Both discoveries are recorded; the gallery uses the forest-search printing, without assuming which illustration the owner meant.

#### Three-mana nature spirits

These broaden the grove's support choices but do not fill the one- and two-mana gap:

- [Harvestguard Alseids](https://scryfall.com/card/jou/13/harvestguard-alseids) is a **2/3 Nymph for {2}{W}**. Its constellation ability triggers on **its own arrival** as well as other enchantments: play it before combat to prevent damage to an existing attacker that turn. It does not need flash for that use. Hoofprints, Flowering, and other enchantments can trigger it again, but it prevents damage rather than every kind of removal.
- [Observant Alseid](https://scryfall.com/card/ths/24/observant-alseid) is a **2/2 Nymph with vigilance for {2}{W}**. Its optional **{4}{W} bestow** can strengthen a creature from either packet without requiring an enchantment-focused deck. The costs and creature/Aura rules make it a lower priority for the simple prototype.
- [Beckoning Will-o'-Wisp](https://scryfall.com/card/clb/10/beckoning-will-o-wisp) is a **1/3 flying Spirit for {2}{W}**. The owner's proposed flavor is a wisp luring enemies into the Treefolk's grove. Choosing an opponent at the beginning of combat gives creatures attacking that player +1/+0, supporting either large Treefolk or a wider partner board. In multiplayer, the bonus is not restricted to your creatures.

Starfield Mystic is a lower-priority practitioner because its payoff needs enough enchantments and its type alone does not establish botanical flavor. Prepared-card mechanics on Emergency Phytomedic are also outside the simplest early-helper direction.

White does have a literal Fungus: [Pallid Mycoderm](https://scryfall.com/card/tsr/31/pallid-mycoderm), a **2/4 for {3}{W}**. Its spore-counter and Saproling-sacrifice abilities are relevant research, but it is not an inexpensive answer to the early curve. This does not change the confirmed black Fungus packet.

#### User-nominated botanical support and Elemental leads

These nominations broaden the theme beyond literal Treefolk. They are research candidates; no illustration details or packet slots are assumed.

- [Hoofprints of the Stag](https://scryfall.com/card/ecc/64/hoofprints-of-the-stag) costs **{1}{W}** and is an owner-endorsed **repeatable token engine** for the white grove. It works with every partner and can benefit from extra card draw, including black Fungi's draw effects. As a kindred enchantment, it is something to cast early but not an immediate blocker: each activation needs four hoofprint counters accumulated from draws and **{2}{W}**, during its controller's turn.
- [Beza, the Bounding Spring](https://scryfall.com/card/blb/2/beza-the-bounding-spring) is a **4/5 for {2}{W}{W}**. Its four catch-up checks are independent, covering opposing lands, life, creatures, and cards in hand. More than one benefit can occur; the comparisons and potential token types add complexity rather than guaranteeing one fixed entry effect.
- [Scion of Vitu-Ghazi](https://scryfall.com/card/dgm/7/scion-of-vitu-ghazi) is a **4/4 for {3}{W}{W}**. When cast from hand, its entry ability makes a flying Bird and then populates. It supplies its own token to copy, or can copy an existing creature token from the partner packet; it does not require that partner to make its first token. The cast-from-hand condition matters for reanimation.

These larger cards are possible threats and support for a combined deck. They do not resolve the early curve by themselves, and repeating them would not change that.

### Black Fungi: self-contained without green

Black can create its own fungal bodies and sacrifice fodder. A token being green does **not** require spending green mana to create it.

- [Deathbloom Thallid](https://scryfall.com/card/m21/94/deathbloom-thallid) costs {2}{B}; its death creates a green Saproling.
- [Fungal Infection](https://scryfall.com/card/dom/94/fungal-infection) costs {B}, gives a creature -1/-1 for the turn, and creates a green Saproling.
- [Synapse Necromage](https://scryfall.com/card/lci/125/synapse-necromage) leaves two black Fungus tokens that cannot block. They are not Saprolings.
- [Thallid Soothsayer](https://scryfall.com/card/gnt/35/thallid-soothsayer) can sacrifice any creature to draw; [Thallid Omnivore](https://scryfall.com/card/dom/106/thallid-omnivore) can sacrifice any other creature for its power boost, with extra life only for a Saproling.
- [Deathcap Marionette](https://scryfall.com/card/lci/100/deathcap-marionette) contributes an early deathtouch body and optional milling. [Mold Folk](https://scryfall.com/card/clb/133/mold-folk) can use either kind of token for its growth ability.

This supports a simple death-and-regrowth identity without requiring the slow spore-counter system or a green Fungus partner. Limit simultaneous sacrifice outlets and distinguish token types. Deathspore Thallid remains on the Zombie side. Descend, transforming cards, and larger recursive engines can remain cube candidates.

### Black Treefolk: independent, but slower and more mechanically demanding

- [Black Poplar Shaman](https://scryfall.com/card/lrw/99/black-poplar-shaman) can regenerate itself; another Treefolk is not required, though regeneration adds rules.
- [Fendeep Summoner](https://scryfall.com/card/mor/61/fendeep-summoner) animates **Swamps**, so black supplies the resource it needs. Land-creature timing and exposure to removal add complexity.
- [Witherbloom Pledgemage](https://scryfall.com/card/stx/249/witherbloom-pledgemage) is a 5/5 payable entirely with black. Its life-gain bonus uses instant/sorcery spells rather than more Treefolk.
- [Sapling of Colfenor](https://scryfall.com/card/c21/228/sapling-of-colfenor) is payable with black and its attack trigger works with any creature card, but adds reveal and life-total arithmetic.
- [Reaping Willow](https://scryfall.com/card/ecl/240/reaping-willow) supplies its own counters and can reanimate any creature with mana value three or less. Three black pips at four mana and -1/-1-counter handling are practical concerns.
- [Thorntooth Witch](https://scryfall.com/card/lrw/144/thorntooth-witch) rewards **later Treefolk spells**, so it is less reliable in a packet with few Treefolk and a differently themed partner. [Weed-Pruner Poplar](https://scryfall.com/card/mor/83/weed-pruner-poplar) has a mandatory upkeep target and may have to target a friendly creature.

The examined black-payable Treefolk begin at three mana. Black Treefolk remains useful comparison and cube research; it does not replace the confirmed white Treefolk and black Fungus directions. Black Oak of Odunos is excluded from the Plant faction because it is a Zombie. Boggart Loggers is a Goblin Rogue, not a Treefolk, and its Treefolk/Forest destruction does not make it a suitable botanical inclusion.

### The Turned: a thin theme may justify deliberate repeats

[Slitherhead](https://scryfall.com/card/rvr/226/slitherhead), [Sultai Devotee](https://scryfall.com/card/tdm/160/sultai-devotee), and [Ghoultree](https://scryfall.com/card/inr/198/ghoultree) are the clearest initial green-paid Zombie anchors. Ghoultree needs creature cards in the graveyard to become affordable; scavenge and recovery remove those cards, so their interaction needs testing. Sultai Devotee's mana ability filters mana rather than ramping it.

A deliberate repeat is allowed if the green Zombie theme has too few suitable cards, while singleton variety remains preferred. The v0.1 list uses this exception for two Slitherheads and two Sultai Devotees; the other nonbasics remain singleton within the Zombie faction. Choose repeats for the actual missing role: more expensive threats do not supply early plays. Supporting spells such as [Grapple with the Past](https://scryfall.com/card/tdc/257/grapple-with-the-past), [Mulch](https://scryfall.com/card/dsc/189/mulch), and [Regrowth](https://scryfall.com/card/mh1/175/regrowth) support the graveyard plan without substituting ordinary living Fungi for Zombies.

[Sludge Titan](https://scryfall.com/card/clu/43/sludge-titan) is also payable entirely with green, but repeated milling of five cards is consequential in a forty-card deck. Radiation cards, The Foretold Soldier's repeated foretell process, and elaborate Zombie-copy mechanics are lower priorities for the simple prototype. They remain research candidates for the future cube.

## What to investigate before choosing cards

### Mana across all pairings

The first Jumpstart shortlist uses the confirmed mono-color directions; the wider shared research retains multicolor possibilities for the cube and later experiments. Inspect every pair separately, including spells that are only useful when cast early. Ancient Grove can rely on the intended early-game contribution of any of its three partners, but mandatory color costs cannot rely on drawing one specific fixing card from one specific partner.

- The mana-cost symbols are the starting point. The browser's color filter describes the card's actual colors, not which mana is sufficient to cast it.
- Hybrid symbols offer alternatives; ordinary multicolor costs require every shown color. Activated abilities, alternate costs, and second faces also matter.
- Creature-only fixing such as a land naming one creature type may not cast supporting spells or the partner's other creature type.
- Flexible lands that enter tapped improve color access but can slow early turns. These are candidates to compare, not a chosen land package.
- The Turned must work on green mana in the first box. Hybrid costs can be payable entirely with green even when the card itself has two colors; off-color activated abilities and mandatory costs still need checking. This is a mana-construction criterion, not Commander color identity.

### Useful partners, not isolated piles

Look for growth spells that work on any creature, token makers that feed sacrifice outlets, recursion that recovers a partner's creatures, and interaction that prevents a battlefield stall. Narrow bonuses need enough targets: a Fungus/Saproling bonus does not strengthen every Plant or Treefolk, and a Zombie bonus does not help a non-Zombie merely because it is in the same faction.

White Treefolk deliberately occupies the expensive end of the combined curve. The Plants, Fungi, and Lands packets should each provide early plays so that all three pairings with it function, with cheap white helpers and interaction considered where useful. Some Fungus engines take time to produce spores, and blue Zombies may consume graveyard cards that black wants to recover. Test each actual pair's combined plan without requiring either twenty-card half to do every job independently.

### Balance and complexity

Compare early participation, interaction, ways to finish, and how long engines take to matter. Mark demanding mechanics and exceptionally strong cards instead of assuming a thematic match is automatically a balanced choice. For example, protection from Zombies on Grave Bramble is unusually relevant in this particular matchup. The browser retains cautions alongside candidates so they can be reviewed before selection.

## Sources and coverage

Card facts were retrieved through the project's [Scryfall MCP server](https://github.com/cryppadotta/scryfall-mcp). Each entry links a specific printing and preserves its Oracle text and faces. Art loads from Scryfall's image service; text and research notes come from the saved local snapshot, so browsing and filtering do not repeatedly query the card API.

The eleven type crossovers are complete for the recorded explicit-type query, which excluded funny-format cards and limited results to paper cards released by October 21, 2026. Flavor crossovers such as The Necrobloom are assessed separately. The query intentionally does not count generic changelings as thematic crossover discoveries. Other packet pools are **curated starting research**, not exhaustive lists of every card or artwork that could fit. New cards and revised Oracle text can change future results.

Download the [research snapshot as JSON](zombies-vs-plants/cards.json) or inspect the [saved search provenance](zombies-vs-plants/searches.json). Exact names, types, full rules text, mana costs, card images, group labels, and individual notes are retained for extending this research or reviewing it in another chat.
