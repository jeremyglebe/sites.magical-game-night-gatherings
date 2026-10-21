import test from "node:test";
import assert from "node:assert/strict";
import { createPreparation } from "../../../../server/preparation.mjs";
import { combinedPacketCards, deckCounts, packetSelectionError } from "./packet-selection.mjs";

const fixture = () => createPreparation({
  preparation: { kind: "jumpstart", source: "zombies-vs-plants-v0.1" },
  players: [{ id: "p1", faction: "plants" }, { id: "p2", faction: "zombies" }],
});

test("packet choice requires the current seat and two distinct same-faction packets", () => {
  const prep = fixture();
  const plants = prep.packets.filter((packet) => packet.faction === "plants");
  const zombie = prep.packets.find((packet) => packet.faction === "zombies");
  assert.equal(packetSelectionError(prep, "p1", plants.slice(0, 2).map((packet) => packet.id)), "");
  for (const selected of [[], [plants[0].id], [plants[0].id, plants[0].id], [plants[0].id, zombie.id], [plants[0].id, "missing"]]) {
    assert.notEqual(packetSelectionError(prep, "p1", selected), "");
  }
  assert.match(packetSelectionError(prep, "p2", [zombie.id, zombie.id]), /Wait/);
  prep.players[0].ready = true;
  assert.match(packetSelectionError(prep, "p1", plants.slice(0, 2).map((packet) => packet.id)), /already/);
});

test("all legal packet previews contain forty cards and sixteen lands without losing repeated basics", () => {
  const prep = fixture();
  for (const faction of ["plants", "zombies"]) {
    const packets = prep.packets.filter((packet) => packet.faction === faction);
    for (let i = 0; i < packets.length; i++) for (let j = i + 1; j < packets.length; j++) {
      const cards = combinedPacketCards(prep.packets, [packets[i].id, packets[j].id]);
      assert.deepEqual(deckCounts(cards), { cards: 40, lands: 16 });
      assert.equal(new Set(cards.map((card) => card.name)).size, cards.length);
    }
  }
  assert.deepEqual(deckCounts(combinedPacketCards(prep.packets, [])), { cards: 0, lands: 0 });
});
