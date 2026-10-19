# MTG Treachery — Source Notes

::: info Reference notes
For the play procedure, open the [dedicated rules page](../variants/treachery.md). These notes preserve source context and historical discussion.
:::

Source: <https://mtgtreachery.net/en/>

MTG Treachery is a maintained fan-made multiplayer variant for Magic: The Gathering, optimized for Commander/EDH. It is in the same broad family as Kingdoms, Usurper, Throne Magic, Assassin, and BANG!-style variants.

The source site provides rules, printable Identity cards, a card oracle, web play tools, a Discord bot, and comprehensive rules.

## Site Sections

| Section | Purpose |
| --- | --- |
| How to Play | Introductory rules and role overview. |
| Game Materials | Printable Identity cards, tokens, and rule cards. |
| Banlist | Additional caution list beyond the base format's ban list. |
| Play by Web | Browser tools for playing without printed cards. |
| Play on Discord | Discord bot support. |
| Oracle | Searchable Identity card database. |
| Comprehensive Rules | Formal rules add-on for the Treachery variant. |

## Premise

Treachery adds a custom card type, **Identity**, to multiplayer Magic. Each player receives an Identity card that defines their role, allies, and win condition.

The format is built around table politics, bluffing, and secret information. Players can lie, hide their role, and choose when to reveal powerful one-shot abilities.

The source recommends Treachery for 5-7 players, though it supports 4 and 8+ players.

## Roles

| Role | Team / Objective |
| --- | --- |
| Leader | The Leader and Guardians win if they are the last players standing. |
| Guardian | Guardians help the Leader and win or lose with the Leader. |
| Assassin | Assassins win if the Leader is eliminated. |
| Traitor | The Traitor wins by being the last player standing. |

The Traitor usually needs to remove the Assassins before eliminating the Leader, because if the Leader dies while an Assassin can claim victory, the Assassin team wins.

## Identity Cards

Identity cards are custom nontraditional Magic cards. They remain in the command zone throughout the game.

An Identity's subtype defines the player's role. Except for the Leader, Identities are usually secret and face down.

Most non-Leader Identities have an **Unveil** ability. Unveiling turns the Identity face up and triggers a powerful ability, but it also reveals the player's role.

Players are considered opponents to each other while their Identity cards are face down.

## Starting A Game

Prepare an Identity deck based on player count, shuffle it, and deal one Identity face down to each player. Each player secretly looks at their Identity. The Leader reveals themself and starts the game.

| Players | Leader | Traitor | Assassin | Guardian |
| ---: | ---: | ---: | ---: | ---: |
| 4 | 1 | 1 | 2 | 0 |
| 5 | 1 | 1 | 2 | 1 |
| 6 | 1 | 1 | 3 | 1 |
| 7 | 1 | 1 | 3 | 2 |
| 8 | 1 | 2 | 3 | 2 |

## Simple Role-Card Version

For a simple game without printed Identity cards, the source suggests basic lands:

| Land | Role |
| --- | --- |
| Plains | Leader |
| Island | Guardian |
| Mountain | Assassin |
| Swamp | Traitor |

## Identity Rarity

Identities are sorted by rarity. Rarity indicates complexity rather than power level.

| Rarity | Use |
| --- | --- |
| Uncommon | Recommended for first games. |
| Rare | Advanced identities. |
| Mythic | Expert identities. |
| Special / purple | Chaotic, high-impact identities that groups can include or exclude by taste. |

## Game Materials

The site provides printable Identity cards and related files.

Available print/download formats include:

| Format | Notes |
| --- | --- |
| A4-HQ | European A4 PDF, high-quality images, 9 cards per page. |
| A4-LQ | European A4 PDF, lower-quality images, 9 cards per page. |
| US-HQ | US Letter PDF, high-quality images, 9 cards per page. |
| US-LQ | US Letter PDF, lower-quality images, 9 cards per page. |
| IMG | Individual PNG images. |

The source notes that Treachery cards were designed with Magic Set Editor 2.5.6.

## Treachery 2025 Base Set

The listed 2025 base set includes:

- 62 Identity cards.
- 3 custom tokens.
- 1 rule card.
- English, French, German, and Spanish support.
- Released June 30, 2025.

Related local files:

- [Treachery card oracle JSON](treachery-cards-oracle.json)
- [Treachery card images](treachery-cards/)

## Banlist Notes

Treachery is meant to be played alongside another multiplayer format, usually Commander. It follows the banned/restricted list of the base format.

The source additionally suggests avoiding a few cards unless the table agrees ahead of time. The concern is that Treachery's political structure and universal starting-opponent status can make some cards especially disruptive.

Additional suggested avoids:

- Expropriate
- Head Games
- Trade Secrets

## Digital Tools

The source mentions:

- **MTG Cloak** as a newer web application for playing Treachery without printed cards.
- **Treacherer** as an older web application.
- A Treachery Discord bot with `/help` support.

## Comprehensive Rules Summary

The comprehensive rules are presented as an add-on to the official Magic Comprehensive Rules. They are not intended to be read from beginning to end; they are a reference for specific rules questions.

Important concepts include:

- **Identity** is a custom card type used only for Treachery.
- Identity cards remain in the command zone.
- Identity cards are not permanents and cannot be cast or included in a deck.
- Identity subtypes are also called identity types or roles.
- The identity types are Leader, Guardian, Assassin, and Traitor.
- The Leader subtype includes a static ability that makes its controller the starting player.
- Face-down Identity cards have no characteristics.
- A player may look at their own face-down Identity, but not another player's face-down Identity unless an ability allows it.

## Unveil

Unveil is the core reveal mechanic.

In practical terms:

- Identity cards with Unveil can start face down in the command zone.
- A player may unveil their face-down Identity when they have priority by paying its Unveil cost.
- Unveiling is a special action and does not use the stack.
- Many Identity cards trigger when unveiled.
- When a player loses, their face-down Identity is revealed.
- At the end of the game, all face-down Identities are revealed.

## Undercover

Undercover is a special Unveil restriction, usually found on some Guardian Identities.

It generally means the Identity can be unveiled only if:

- Another non-Leader Identity card has been revealed; or
- A player other than you attacked a Leader player this game.

## Treachery Rules Structure

The formal Treachery variant rules define:

- A Treachery game as a multiplayer game with four or more players, best at five or six.
- An Identity deck with exactly one Identity per player.
- Exactly one Leader.
- At least one Traitor.
- Assassins equal to half the player count, rounded down.
- Remaining slots filled by Guardians or Traitors.
- The Identity distribution is known before the game begins.

## Teams

| Identity | Team |
| --- | --- |
| Leader | Leader team. |
| Guardian | Leader team. |
| Assassin | Assassin team. |
| Traitor | A solo team. |
| Face-down Identity | No teammates and considered opponents with other players until revealed. |

## Winning And Losing

The comprehensive rules specify:

- A team loses if all players on that team have lost.
- The Leader team loses if all Leaders have lost, even if Guardians remain.
- The Assassin team wins if all Leaders have lost and at least one Assassin Identity remains in the game.
- A Traitor wins if all of that Traitor's opponents have left the game, including other Traitors.
- If any player on a team wins, their whole team wins.

## Leaving The Game

When a player leaves the game:

- Their face-down Identity must be revealed.
- The game remembers their last known team.
- Some Identity-related abilities or control-change effects may continue under the comprehensive rules.

## Source Legal / Attribution Notes

The source site states that Magic: The Gathering names, card images, mana symbols, and Oracle text belong to Wizards of the Coast / Hasbro, and that the site is not affiliated with Wizards.

The source also credits card artwork to the original illustrators, the Treachery logo to Ludovic Jordier, and several icons to game-icons.net.

Last update dates shown in the captured source:

- How to Play / Game Materials: June 30, 2025.
- Comprehensive Rules: May 3, 2026.
- Site/legal footer: May 6, 2026.
