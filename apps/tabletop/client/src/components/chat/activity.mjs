import { revealedCardSnapshots } from "../../../../shared/revealed-cards.mjs";
import { actionText } from "../../../../shared/table-language.mjs";

/** Keep speech and reveals in their original position between grouped actions. */
export function activityParts(event, players = []) {
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
        text: actionText(change, { players, actor: event.actor }),
        cards,
      });
    } else if (change.type === "say") say(change.text);
    else {
      lines.push(
        change.type === "note" && typeof change.text === "string"
          ? `Note: ${change.text}`
          : actionText(change, { players, actor: event.actor }),
      );
      if (["pass", "pass_turn", "select_packets", "ready_next_game"].includes(change.type)) say(change.message);
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
  return /^robot-(orc|wizard|dwarf|elf-ranger|knight|rogue|cleric|bard|plant|zombie)$/.test(
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
