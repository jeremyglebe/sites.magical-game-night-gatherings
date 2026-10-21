// Regression fixture only. New playtests use the Jumpstart boxed set.
import { readFileSync } from 'node:fs';
import { setTimeout as pause } from 'node:timers/promises';
import { connectPlayer } from '../player-client.mjs';

export function demoSetup() {
  const setup = JSON.parse(readFileSync(new URL('./precons.json', import.meta.url), 'utf8'));
  setup.title = 'Game Night · scripted tabletop demo';
  setup.shuffle = false;
  // Stage hands for a reproducible display test; normal playtest:serve shuffles.
  const hands = [
    ['Plains', 'Plains', 'Plains', 'Fan Bearer', 'Mesa Unicorn', 'Serra Angel', 'Luminous Bonds'],
    ['Forest', 'Forest', 'Forest', 'Llanowar Elves', 'Jungle Delver', 'Giant Spider', 'Rabid Bite'],
  ];
  for (const [i, player] of setup.players.entries()) {
    const opening = hands[i].map(name => {
      const entry = player.deck.find(c => c.name === name && c.count > 0);
      if (!entry) throw new Error('Demo card missing from precon: ' + name);
      entry.count--;
      return { ...entry, count: 1 };
    });
    player.deck = [...opening, ...player.deck.filter(c => c.count)];
  }
  return setup;
}

export async function runDemo({ session, url, stepMs = 700 }) {
  const players = [];
  try {
    for (const seat of ['p1', 'p2']) players.push(await connectPlayer({ seat, session, url }));
    const [white, green] = players;
    async function act(p, actions, reason) {
      const current = await p.tool('observe_table');
      const view = await p.tool('act', { revision: current.revision, actions, reason });
      if (stepMs) await pause(stepMs);
      return view;
    }
    async function card(p, zone, name) {
      const view = await p.tool('observe_table');
      const found = view.zones[zone].cards.find(c => c.name === name);
      if (!found) throw new Error('Demo position is missing ' + name);
      return found;
    }
    async function begin(p, seat, number, draw = true) {
      const view = await p.tool('observe_table');
      await act(p, [
        ...view.zones.battlefield.cards.filter(c => c.controller === seat).map(c => ({ type: 'card', card: c.id, set: { tapped: false, damage: 0, note: '' } })),
        ...(draw ? [{ type: 'draw', count: 1 }] : []),
        { type: 'turn', set: { number, active: seat, priority: seat, phase: 'First main' } },
      ], 'Scripted turn: untap; upkeep has no triggers; draw if appropriate; main phase.');
    }
    async function land(p, seat, name) {
      const c = await card(p, seat + ':hand', name);
      await act(p, [{ type: 'move', card: c.id, to: 'battlefield' }], 'Play the land for this turn.');
    }
    async function cast(p, seat, name, mana, attachedTo = null) {
      const c = await card(p, seat + ':hand', name);
      const view = await p.tool('observe_table');
      const lands = view.zones.battlefield.cards.filter(c => c.controller === seat && !c.tapped && c.type_line.includes('Land')).slice(0, mana);
      if (lands.length !== mana) throw new Error('Scripted position lacks mana');
      const other = seat === 'p1' ? green : white;
      const opponent = seat === 'p1' ? 'p2' : 'p1';
      await act(p, [
        ...lands.map(c => ({ type: 'card', card: c.id, set: { tapped: true } })),
        { type: 'move', card: c.id, to: 'stack', position: 'top' },
        ...(attachedTo ? [{ type: 'card', card: c.id, set: { note: 'Target: Llanowar Elves' } }] : []),
        { type: 'turn', set: { priority: opponent } },
      ], 'Scripted cast of ' + name + ': pay with lands and pass priority.');
      await act(other, [{ type: 'turn', set: { priority: seat } }], 'Scripted opponent passes; neither player responds.');
      await act(p, [
        { type: 'move', card: c.id, to: 'battlefield' },
        ...(attachedTo ? [{ type: 'card', card: c.id, set: { attached_to: attachedTo, note: '' } }] : []),
      ], 'Both players passed; resolve ' + name + '.');
    }
    await act(white, [
      { type: 'note', text: 'Scripted demonstration with staged opening hands. No AI game or deck-balance result.' },
      { type: 'draw', count: 7 },
    ], 'Deal the staged white opening hand.');
    await act(green, [{ type: 'draw', count: 7 }], 'Deal the staged green opening hand.');
    await begin(white, 'p1', 1, false);
    await land(white, 'p1', 'Plains');
    await cast(white, 'p1', 'Fan Bearer', 1);
    await begin(green, 'p2', 2);
    await land(green, 'p2', 'Forest');
    await cast(green, 'p2', 'Llanowar Elves', 1);
    await begin(white, 'p1', 3);
    await land(white, 'p1', 'Plains');
    await cast(white, 'p1', 'Mesa Unicorn', 2);
    // No attacks on this turn; this is a display exercise, not strategic play.
    await begin(green, 'p2', 4);
    await land(green, 'p2', 'Forest');
    await cast(green, 'p2', 'Jungle Delver', 1);
    await begin(white, 'p1', 5);
    await land(white, 'p1', 'Plains');
    const elves = await card(white, 'battlefield', 'Llanowar Elves');
    await cast(white, 'p1', 'Luminous Bonds', 3, elves.id);
    const fan = await card(white, 'battlefield', 'Fan Bearer');
    const unicorn = await card(white, 'battlefield', 'Mesa Unicorn');
    const delver = await card(green, 'battlefield', 'Jungle Delver');
    await act(white, [
      { type: 'turn', set: { phase: 'Declare attackers', priority: 'p2' } },
      ...[fan, unicorn].map(c => ({ type: 'card', card: c.id, set: { tapped: true, note: 'Attacking p2' } })),
    ], 'After beginning-of-combat passes, declare both creatures attacking green.');
    await act(green, [
      { type: 'turn', set: { phase: 'Declare blockers', priority: 'p1' } },
      { type: 'card', card: delver.id, set: { note: 'Blocking Fan Bearer' } },
    ], 'After attacker-step passes, Jungle Delver blocks Fan Bearer. Mesa Unicorn is unblocked.');
    await act(white, [
      { type: 'turn', set: { phase: 'Combat damage' } },
      { type: 'card', card: fan.id, set: { damage: 1 } },
      { type: 'card', card: delver.id, set: { damage: 1 } },
      { type: 'player', player: 'p2', set: { life: 18 } },
      { type: 'player', player: 'p1', set: { life: 22 } },
    ], 'After blocker-step passes: 1 damage to each blocker pair; Unicorn deals 2 to green and lifelink gains 2 for white.');
    await act(green, [{ type: 'move', card: delver.id, to: 'p2:graveyard' }, { type: 'card', card: delver.id, set: { damage: 0, note: '' } }], 'State-based action: Jungle Delver dies from lethal damage.');
    await act(white, [
      ...[fan, unicorn].map(c => ({ type: 'card', card: c.id, set: { damage: 0, note: '' } })),
      { type: 'turn', set: { phase: 'Demo complete', priority: null } },
      { type: 'note', text: 'Demo complete. The table remains available to inspect. No winner has been reported.' },
    ], 'Skip empty remaining steps in this script; clear combat notes and damage during cleanup.');
    return { revision: (await white.tool('observe_table')).revision };
  } finally { for (const p of players) await p.close(); }
}
