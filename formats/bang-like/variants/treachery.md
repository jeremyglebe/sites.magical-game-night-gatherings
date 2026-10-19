# MTG Treachery

[BANG-like versions](../) · **Rules: published Treachery rules, May 3, 2026**

Treachery adds Identity cards to an underlying multiplayer format, usually Commander. This page records the setup, Identity rules, unveil procedure, team rules, and end-of-game exceptions. Individual Identity abilities still use their card text.

## Players, decks, and materials

Play with at least four players. The introductory page recommends five to seven; the comprehensive rules describe five or six as ideal.

Choose the underlying format and decks **before** preparing the Identity deck. For Commander, use normal Commander decks, command zones, commander tax, and commander damage. Treachery uses free-for-all turns, allows attacks against multiple players, and uses neither limited range of influence nor the deploy-creatures option.

Prepare exactly one Identity card per player. Identity rarity indicates complexity rather than power: uncommon is recommended for first games, rare for advanced play, mythic for expert play, and purple/special for deliberately chaotic identities.

## Preparing the Identity deck

The general construction rule calls for exactly one Leader, at least one Traitor, and Assassins equal to half the player count rounded down. Fill the remaining places with Guardians or Traitors.

The source also publishes this recommended table:

| Players | Leader | Traitor | Assassins | Guardians |
| --- | ---: | ---: | ---: | ---: |
| 4 | 1 | 1 | 2 | 0 |
| 5 | 1 | 1 | 2 | 1 |
| 6 | 1 | 1 | 3 | 1 |
| 7 | 1 | 1 | 3 | 2 |
| 8 | 1 | 2 | 3 | 2 |

::: info Eight-player source discrepancy
The published eight-player row uses three Assassins; the general half-rounded-down formula gives four. Both appear in the current source. Choose the recommended row or a formula-based distribution before preparing an eight-player game, and announce the distribution. Do not accidentally combine them.
:::

The role distribution is public information before the game, except in the optional Backstab Rumble setup below.

## Setup

1. Choose decks, the Identity selection, and the role distribution.
2. Shuffle the Identity deck and deal one Identity face down to each player.
3. Players privately inspect their own Identity.
4. Put each Identity in its owner's command zone. An Identity with unveil starts face down; an Identity without unveil starts face up.
5. Prepare the underlying game. Starting life is **20**, or **40 for Commander**, unless an Identity or the underlying format changes it. The normal opening hand is **seven**, subject to those same exceptions.
6. The player with the face-up Leader Identity takes the first turn. If effects designate several starting players, randomly choose among them.

Other roles remain secret while their Identities are face down. Do not reveal one just to prove a claim.

## Identity cards and abilities

Identity is a nontraditional card type. An Identity:

- Stays in the command zone for the entire game. If it would leave that zone, it remains there.
- Is not a permanent, cannot be cast, and does not go into an ordinary deck.
- Can be introduced from outside the game by an effect that specifically permits it.
- Is initially owned by the player who started with it in their command zone, and controlled by that owner.
- Can have multiple Identity subtypes: Leader, Guardian, Assassin, and Traitor.
- Has no characteristics while face down.
- Can be inspected by its controller at any time. Other players cannot inspect it without permission from an effect.

A face-up Identity's static, activated, and triggered abilities function from the command zone. An ability referring to “this identity” refers to its own source card there. A reference to a particular role's “player” means a player controlling a **face-up** Identity with that subtype. Some abilities modify the pregame procedure itself.

## Unveil: complete procedure

An unveil ability makes the Identity start face down and makes it turn face up when its controller loses.

To unveil voluntarily:

1. Wait until you have priority.
2. Check any restriction on the Identity, including undercover.
3. Show what the Identity's unveil cost would be face up.
4. Choose any required value of X and pay that cost.
5. Turn the Identity face up. Its normal characteristics return.
6. Put any abilities triggered by this unveil onto the stack at the appropriate time.

Unveiling is a **special action**. It does not use the stack and cannot itself be responded to. The triggered abilities produced by it do use the stack and can be responded to.

An Identity without an unveil cost cannot be turned face up using this procedure. If another ability refers to X in the unveil cost, it uses the value chosen while unveiling.

An “as this Identity is unveiled” effect applies during the turn-face-up action. A “when unveiled” ability triggers only from turning it face up through the unveil special action; merely revealing it on elimination does not perform that action.

## Undercover

An undercover restriction permits unveiling only after at least one of these has happened:

- Another non-Leader Identity has been revealed.
- A player other than you has attacked a Leader player this game.

For the second condition, a creature must actually have been declared as an attacker against the Leader. Putting a creature onto the battlefield already attacking does not count as declaring that attack.

## Copying and turning face up

When an Identity turns face up, use its normal copiable values again while continuing to apply effects already affecting it.

A face-down Identity that copies another Identity still has the characteristics imposed by being face down. When it later turns face up, it shows the copied values. Apply the usual Magic copying rules together with these Identity rules.

## Teams and opponents

- Face-up Leaders and Guardians form the **Leader team**.
- Face-up Assassins form the **Assassin team**.
- Each Traitor forms a separate team and has no teammates, including other Traitors.
- A player with a face-down Identity has no teammates and is an opponent of the other players until it is face up.

This distinction matters for effects referring to an opponent or teammate. Do not treat a hidden Guardian as a face-up teammate for targeting or card effects merely because you suspect their role.

Turns remain individual. Treachery does not grant shared turns, shared life totals, or shared mana.

## Winning and losing

Normal Magic game-ending rules continue to apply, with these team conditions and exceptions:

1. A team loses when all of its players have lost.
2. The Leader team loses when all players controlling Leader Identities have lost, even if Guardians remain. This overrides an effect that would otherwise stop a Guardian from losing.
3. The Assassin team wins when all Leaders have lost and at least one Assassin Identity remains in the game.
4. A Traitor wins when every opponent has left, including every other Traitor.
5. If a player on a team wins, the entire team wins.

A Traitor therefore usually needs the Assassins eliminated before removing the Leader. Simply killing the Leader while an Assassin can claim the victory does not fulfill the Traitor's objective.

## Leaving the game

Reveal all face-down Identities controlled by a departing player. The game remembers that player's last team using their last known Identity.

Apply normal multiplayer removal of that player's owned objects, with two Identity exceptions:

- An ability already on the stack whose source is an Identity and whose owner leaves remains on the stack. Let the departing player resolve it if possible.
- An Identity owned by the departing player but controlled by someone still in the game stays. Its remaining controller becomes its new owner.

At the end of the game, reveal every remaining face-down Identity.

## Optional setups

### Simple role cards

The source offers basic lands instead of custom Identities: Plains for Leader, Island for Guardian, Mountain for Assassin, and Swamp for Traitor. Use the chosen distribution and role objectives. This simplified option supplies roles without the custom cards' unveil effects; the land's ordinary text is not an Identity ability.

### Backstab Rumble

Prepare exactly one Leader and make **every other Identity a Traitor**. Each Traitor still acts alone and must outlast every opponent, including other Traitors.

The source allows this option to be kept secret from players for surprise, overriding its usual public-distribution instruction. It changes the setup, not the Identity, unveil, or last-survivor procedures above.

## Card restrictions and materials

Use the underlying format's banned/restricted list. The Treachery source additionally recommends avoiding Expropriate, Head Games, and Trade Secrets unless everyone agrees; that agreement cannot make a card legal in a base format that already bans it.

- [Local card materials and archived oracle](../sources/treachery-cards/)
- [Current Treachery card oracle](https://mtgtreachery.net/rules/oracle/)
- [Printable cards](https://mtgtreachery.net/en/#download)

## Sources

[Treachery's play instructions](https://mtgtreachery.net/en/) and [comprehensive rules](https://mtgtreachery.net/rules/cr/), checked October 18, 2026. [Archived research notes](../sources/mtg-treachery.md).
