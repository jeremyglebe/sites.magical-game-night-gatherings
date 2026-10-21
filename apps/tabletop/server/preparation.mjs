import { readFileSync } from 'node:fs';

const clone = value => structuredClone(value);
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
export const preparationSources = Object.freeze([
  Object.freeze({ id: 'zombies-vs-plants-v0.1', kind: 'jumpstart', title: 'Zombies vs Plants: Jumpstart', version: '0.1', players: 2, packetsPerPlayer: 2, factions: ['plants', 'zombies'] }),
]);
const sourceDirectory = new URL('../../../boxed-sets/zombies-vs-plants/v0.1/', import.meta.url);
const readJSON = name => JSON.parse(readFileSync(new URL(name, sourceDirectory), 'utf8'));

function cardDefinition(card, snapshot) {
  const result = { name: card.name, scryfall_id: card.id };
  for (const key of ['type_line', 'oracle_text', 'mana_cost', 'power', 'toughness']) {
    if (card[key] !== undefined) result[key] = card[key];
  }
  const image = card.image_uris?.normal || card.image_uris?.small;
  if (image) result.image_url = image;
  if (Array.isArray(card.rulings)) {
    result.rulings = card.rulings.filter(ruling => ruling.source === 'wotc')
      .map(({ source, published_at, comment }) => ({ source, published_at, comment }));
    result.rulings_cache = {
      status: 'fetched', fetched_at: snapshot.verifiedAt,
      source: 'Saved Scryfall MCP snapshot; date records snapshot verification',
      uri: card.rulings_uri || `https://api.scryfall.com/cards/${card.id}/rulings`,
    };
  } else result.rulings_cache = { status: 'not_fetched' };
  return result;
}

// Packet contents are a public, pinned inventory, separate from the game zones.
// No participant receives a library or a private draft pool during this step.
export function createPreparation(config, players = config.players) {
  if (config.preparation === undefined || config.preparation === null) return null;
  const requested = config.preparation;
  requireThat(requested?.kind === 'jumpstart', 'Unsupported preparation kind');
  requireThat(requested.source === preparationSources[0].id, 'Unknown preparation source');
  requireThat(Array.isArray(players) && players.length === 2, 'This Jumpstart box needs exactly two players');
  requireThat(players.every(p => ['plants', 'zombies'].includes(p.faction))
    && new Set(players.map(p => p.faction)).size === 2, 'Choose one Plants player and one Zombies player');
  const manifest = readJSON('packets.json');
  const snapshot = readJSON('cards.json');
  const definitions = new Map(snapshot.cards.map(card => [card.oracle_id, card]));
  const packets = manifest.packets.map(packet => {
    const cards = packet.cards.map(row => {
      const card = definitions.get(row.oracleId);
      requireThat(card && card.name === row.name, `Missing saved card definition: ${row.name}`);
      requireThat(Number.isSafeInteger(row.quantity) && row.quantity > 0, `Invalid packet quantity: ${row.name}`);
      return { ...cardDefinition(card, snapshot), count: row.quantity };
    });
    requireThat(cards.reduce((sum, card) => sum + card.count, 0) === 20, `Packet ${packet.id} must contain twenty cards`);
    return { id: packet.id, name: packet.name, faction: packet.faction, color: packet.color, plan: packet.plan, cards };
  });
  requireThat(packets.length === 8 && new Set(packets.map(p => p.id)).size === 8, 'This source must contain eight distinct packets');
  requireThat(['plants', 'zombies'].every(faction => packets.filter(p => p.faction === faction).length === 4), 'This source must contain four packets for each faction');
  return {
    kind: 'jumpstart', source: requested.source, title: manifest.title, version: manifest.version,
    status: 'selecting', currentPlayer: players[0].id, packetsPerPlayer: 2,
    packets, players: players.map(({ id, faction }) => ({ id, faction, selectedPacketIds: [], ready: false })),
    decks: null,
  };
}

export function observePreparation(preparation, actor = null) {
  if (!preparation) return null;
  if (actor !== null) requireThat(preparation.players.some(p => p.id === actor), 'Unknown preparation player');
  // Completed deck definitions are host provenance. Libraries remain filtered
  // by the table; packet contents and announced selections are public.
  const { decks, packets, ...view } = preparation;
  const faction = preparation.players.find(p => p.id === actor)?.faction;
  return clone({ ...view, packets: packets.map(packet => {
    // Full inventories are needed only for selection. Routine game updates
    // retain labels and selections without repeating every card's Oracle text.
    if (preparation.status === 'selecting' && (actor === null || packet.faction === faction)) return packet;
    const { id, name, faction: packetFaction, color } = packet;
    return { id, name, faction: packetFaction, color };
  }) });
}

export function applyPreparation(original, actor, action) {
  requireThat(original?.status === 'selecting', 'Packet selection is not pending');
  requireThat(original.currentPlayer === actor, 'Wait for your packet selection turn');
  requireThat(action?.type === 'select_packets', 'Unsupported preparation action');
  const selected = action.packetIds;
  requireThat(Array.isArray(selected) && selected.length === 2 && selected.every(id => typeof id === 'string')
    && new Set(selected).size === 2, 'Choose two distinct packet IDs');
  const seat = original.players.find(p => p.id === actor);
  requireThat(seat && !seat.ready, 'This player already selected their packets');
  const packets = selected.map(id => original.packets.find(p => p.id === id));
  requireThat(packets.every(p => p && p.faction === seat.faction), 'Choose packets from your assigned faction');
  const claimed = new Set(original.players.flatMap(p => p.selectedPacketIds));
  requireThat(selected.every(id => !claimed.has(id)), 'A selected packet is already claimed');
  const preparation = clone(original);
  const nextSeat = preparation.players.find(p => p.id === actor);
  nextSeat.selectedPacketIds = [...selected];
  nextSeat.ready = true;
  preparation.currentPlayer = preparation.players.find(p => !p.ready)?.id || null;
  if (preparation.currentPlayer === null) {
    preparation.status = 'complete';
    preparation.decks = Object.fromEntries(preparation.players.map(p => [p.id,
      p.selectedPacketIds.flatMap(id => clone(preparation.packets.find(packet => packet.id === id).cards)),
    ]));
  }
  return {
    preparation, nextPlayer: preparation.currentPlayer || preparation.players[0].id,
    decks: preparation.status === 'complete' ? clone(preparation.decks) : null,
  };
}
