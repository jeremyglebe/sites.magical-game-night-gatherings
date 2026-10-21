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
