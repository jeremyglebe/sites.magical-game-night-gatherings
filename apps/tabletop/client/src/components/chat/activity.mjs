import { revealedCardSnapshots } from "../../../../shared/revealed-cards.mjs";

/** Keep speech and reveals in their original position between grouped actions. */
export function activityParts(event) {
  const parts = [];
  let lines = [];
  const flush = () => {
    if (lines.length) parts.push({ kind: "actions", lines });
    lines = [];
  };
  const say = (text) => {
    if (typeof text === "string" && text.trim()) {
      flush();
      parts.push({ kind: "speech", text });
    }
  };
  for (const change of event.changes?.length ? event.changes : [event]) {
    const cards = revealedCardSnapshots(change);
    if (cards.length) {
      flush();
      parts.push({
        kind: "reveal",
        text: change.summary || "Revealed a card",
        cards,
      });
    } else if (change.type === "say") say(change.text);
    else {
      lines.push(
        change.type === "note" && typeof change.text === "string"
          ? `Note: ${change.text}`
          : change.summary || "Table updated",
      );
      if (["pass", "pass_turn"].includes(change.type)) say(change.message);
    }
  }
  flush();
  return parts;
}

export function cardImage(card) {
  try {
    const url = new URL(card.image_url);
    return url.protocol === "https:" && url.hostname === "cards.scryfall.io"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function avatarImage(avatar) {
  return /^robot-(orc|wizard|dwarf|elf-ranger|knight|rogue|cleric|bard)$/.test(
    avatar || "",
  )
    ? `/avatars/${avatar}.png`
    : null;
}

export function eventTime(at) {
  const date = new Date(at);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }).format(date)
    : "";
}
