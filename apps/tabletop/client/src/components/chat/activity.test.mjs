import test from "node:test";
import assert from "node:assert/strict";
import { activityParts, avatarImage, cardImage } from "./activity.mjs";

test("chat preserves action / speech / reveal / handoff order without exposing live card handles", () => {
  const parts = activityParts({
    changes: [
      { type: "move", summary: "Played Mountain" },
      { type: "update", summary: "Tapped Mountain" },
      { type: "say", text: "Does it resolve?" },
      {
        type: "reveal",
        summary: "Revealed Sol Ring",
        revealedCards: [
          {
            name: "Sol Ring",
            id: "private-card-id",
            private_note: "hidden",
            image_url: "https://cards.scryfall.io/a.jpg",
          },
        ],
      },
      { type: "pass", summary: "Passed priority", message: "Over to you." },
    ],
  });
  assert.deepEqual(
    parts.map((part) => part.kind),
    ["actions", "speech", "reveal", "actions", "speech"],
  );
  assert.deepEqual(parts[0].lines, ["Played Mountain", "Tapped Mountain"]);
  assert.equal(parts[2].cards[0].id, undefined);
  assert.equal(parts[2].cards[0].private_note, undefined);
  assert.equal(parts[4].text, "Over to you.");
});

test("chat asset URLs stay within allowed card and avatar sources", () => {
  assert.equal(cardImage({ image_url: "javascript:alert(1)" }), null);
  assert.equal(
    cardImage({ image_url: "https://unrelated.example/card.png" }),
    null,
  );
  assert.equal(
    cardImage({ image_url: "https://cards.scryfall.io/card.jpg" }),
    "https://cards.scryfall.io/card.jpg",
  );
  assert.equal(avatarImage("../private/file"), null);
  assert.equal(avatarImage("robot-orc"), "/avatars/robot-orc.png");
});

test("packet selection presents its public explanation after the selection and before later activity", () => {
  assert.deepEqual(activityParts({ changes: [
    { type: "say", text: "I want some early flyers." },
    { type: "select_packets", summary: "p1 selected Overgrowth + Ancient Grove", message: "Plants plus birds should cover the early turns." },
    { type: "note", text: "Player 2 chooses next." },
  ] }), [
    { kind: "speech", text: "I want some early flyers." },
    { kind: "actions", lines: ["p1 selected Overgrowth + Ancient Grove"] },
    { kind: "speech", text: "Plants plus birds should cover the early turns." },
    { kind: "actions", lines: ["Note: Player 2 chooses next."] },
  ]);
  assert.deepEqual(activityParts({ type: "select_packets", summary: "Packets chosen", message: "  " }), [
    { kind: "actions", lines: ["Packets chosen"] },
  ]);
});


test("readiness speech follows between-game actions", () => {
  const parts = activityParts({ changes: [
    { type: "sideboard", summary: "Player 1 prepared their deck" },
    { type: "ready_next_game", summary: "Player 1 is ready", message: "Ready for another game." },
  ] });
  assert.deepEqual(parts, [
    { kind: "actions", lines: ["Player 1 prepared their deck", "Player 1 is ready"] },
    { kind: "speech", text: "Ready for another game." },
  ]);
});

test("UI action templates use configured names while preserving speech and recorded data", () => {
  const players = [{ id: "p1", name: "Frederick" }, { id: "p2", name: "Gianmarco" }];
  const event = {
    actor: "p2",
    changes: [
      { type: "turn", set: { phase: "End of combat" }, summary: 'p2 updated the turn marker: phase="End of combat"' },
      { type: "stack_item", cards: ["Shambling Ghast death trigger"], summary: "p2 added an ability to the stack: Shambling Ghast death trigger" },
      { type: "move", from: "battlefield", to: "p2:graveyard", cards: ["Shambling Ghast"], summary: "p2 moved Shambling Ghast from battlefield to p2:graveyard" },
      { type: "say", text: "I used to be called p2. Does that resolve?" },
      { type: "pass", next: "p1", message: "Frederick, over to you.", summary: "p2 passed priority to p1" },
    ],
  };
  const original = structuredClone(event);
  const parts = activityParts(event, players);
  assert.equal(parts[0].lines[0], "Gianmarco moves to End of Combat");
  assert.match(parts[0].lines[1], /Gianmarco.*Shambling Ghast death trigger/);
  assert.equal(parts[0].lines[2], "Gianmarco moves Shambling Ghast from the battlefield to their graveyard");
  assert.doesNotMatch(parts.filter(part => part.kind === "actions").flatMap(part => part.lines).join("\n"), /\bp[12]\b|phase=|updated the turn marker/);
  assert.deepEqual(parts.filter(part => part.kind === "speech").map(part => part.text), [
    "I used to be called p2. Does that resolve?", "Frederick, over to you.",
  ]);
  assert.deepEqual(event, original);
});
