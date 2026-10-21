export const factionName = (faction) =>
  ({ plants: "Plants", zombies: "Zombies" })[faction] || faction;

export function packetSelectionError(preparation, playerId, packetIds) {
  if (preparation?.status !== "selecting") return "Packet selection has finished.";
  const player = preparation.players?.find((entry) => entry.id === playerId);
  if (!player) return "Enter a player seat to choose packets.";
  if (player.ready) return "This player's packets are already confirmed.";
  if (preparation.currentPlayer !== playerId) return "Wait for your packet selection.";
  const needed = preparation.packetsPerPlayer || 2;
  if (!Array.isArray(packetIds) || packetIds.length !== needed || new Set(packetIds).size !== needed)
    return `Choose ${needed} different packets.`;
  if (packetIds.some((id) => !preparation.packets?.some((packet) => packet.id === id && packet.faction === player.faction)))
    return "Choose packets from your assigned faction.";
  return "";
}

export function combinedPacketCards(packets, packetIds) {
  const cards = new Map();
  for (const packet of packets || []) {
    if (!packetIds.includes(packet.id)) continue;
    for (const card of packet.cards || []) {
      const key = card.oracle_id || card.name;
      const previous = cards.get(key);
      cards.set(key, { ...card, count: (previous?.count || 0) + (card.count ?? 1) });
    }
  }
  return [...cards.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function deckCounts(cards) {
  return cards.reduce((counts, card) => ({
    cards: counts.cards + (card.count ?? 1),
    lands: counts.lands + (/\bLand\b/.test(card.type_line || "") ? (card.count ?? 1) : 0),
  }), { cards: 0, lands: 0 });
}
