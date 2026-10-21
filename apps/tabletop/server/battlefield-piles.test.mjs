import test from "node:test";
import assert from "node:assert/strict";
import { battlefieldPiles, orderedPileCards } from "../shared/battlefield-piles.mjs";

test("attachments group across controllers under the semantic root, without changing card state", () => {
  const root = { id: "tree", controller: "p1", type_line: "Creature — Treefolk", tapped: true };
  const aura = { id: "aura", controller: "p2", attached_to: "tree", tapped: false };
  const land = { id: "forest", controller: "p2", type_line: "Basic Land — Forest" };
  const cards = [aura, land, root];
  const before = structuredClone(cards);
  const groups = battlefieldPiles(cards);
  const pile = groups.find((group) => group.root.id === "tree");
  assert.deepEqual(pile.cards, [root, aura]);
  assert.equal(pile.root.controller, "p1");
  assert.equal(pile.cards[1].controller, "p2");
  assert.equal(groups.flatMap((group) => group.cards).length, 3);
  assert.deepEqual(cards, before);
});

test("attachment chains form a single root-first pile regardless of source order", () => {
  const cards = [
    { id: "leaf", attached_to: "branch" },
    { id: "branch", attached_to: "trunk" },
    { id: "trunk", attached_to: null },
    { id: "vine", attached_to: "trunk" },
  ];
  const [pile] = battlefieldPiles(cards);
  assert.equal(pile.root.id, "trunk");
  assert.deepEqual(pile.cards.map((card) => card.id), ["trunk", "leaf", "branch", "vine"]);
});

test("legacy orphan, self-attachment, and cycle records remain visible exactly once", () => {
  const cards = [
    { id: "child", attached_to: "orphan" },
    { id: "orphan", attached_to: "gone" },
    { id: "b", attached_to: "a" },
    { id: "a", attached_to: "b" },
    { id: "cycle-child", attached_to: "b" },
    { id: "self", attached_to: "self" },
  ];
  const piles = battlefieldPiles(cards);
  assert.deepEqual(piles.map((pile) => pile.root.id).sort(), ["a", "orphan", "self"]);
  assert.deepEqual(piles.find((pile) => pile.root.id === "a").cards.map((card) => card.id), ["a", "b", "cycle-child"]);
  assert.deepEqual(piles.flatMap((pile) => pile.cards.map((card) => card.id)).sort(), cards.map((card) => card.id).sort());
  assert.equal(battlefieldPiles([...cards].reverse()).find((pile) => pile.cards.some((card) => card.id === "b")).root.id, "a");
});

test("removing a root separates remaining attachments safely, and duplicate input never duplicates a card", () => {
  const aura = { id: "aura", attached_to: "gone" };
  assert.deepEqual(battlefieldPiles([aura, aura, { id: "other", attached_to: "gone" }]).map((pile) => pile.root.id), ["aura", "other"]);
  assert.deepEqual(battlefieldPiles([]), []);
});

test("local ordering changes the displayed top without changing the semantic root or membership", () => {
  const [pile] = battlefieldPiles([{ id: "root" }, { id: "aura", attached_to: "root" }, { id: "equipment", attached_to: "root" }]);
  const preferred = ["gone", "aura", "aura", "root"];
  assert.deepEqual(orderedPileCards(pile, preferred).map((card) => card.id), ["aura", "root", "equipment"]);
  assert.equal(pile.root.id, "root");
  assert.deepEqual(pile.cards.map((card) => card.id), ["root", "aura", "equipment"]);
  assert.deepEqual(preferred, ["gone", "aura", "aura", "root"]);
});
