export function formatDate(
  value,
  options = { dateStyle: "medium", timeStyle: "short" },
) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, options).format(date)
    : "Date unavailable";
}
export function imageURL(definition) {
  try {
    const url = new URL(definition?.image_url);
    return url.protocol === "https:" && url.hostname === "cards.scryfall.io"
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function avatarURL(player) {
  return /^robot-(orc|wizard|dwarf|elf-ranger|knight|rogue|cleric|bard)$/.test(
    player?.avatar,
  )
    ? `/avatars/${player.avatar}.png`
    : null;
}
export function modelLabel(player = {}) {
  if (player.ai === false) return "Human player";
  return (
    [
      player.model?.replace(/^gpt-/, ""),
      player.reasoning &&
        `${player.reasoning[0].toUpperCase()}${player.reasoning.slice(1)} reasoning`,
    ]
      .filter(Boolean)
      .join(" · ") || "Player"
  );
}
export function resultLabel(game) {
  if (!game?.result) return "Unfinished";
  const winners = game.result.winners || [];
  return (
    (winners.length
      ? `${winners.map((id) => game.players?.find((p) => p.id === id)?.name || id).join(" & ")} won`
      : "Draw") +
    (game.feedback?.status === "pending" ? " · Feedback pending" : "")
  );
}
export function localTableURL(value) {
  try {
    const url = new URL(value || "/", location.origin);
    if (
      url.origin === location.origin ||
      (url.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    )
      return url.href;
  } catch {
    /* Optional host metadata must not create an external navigation. */
  }
  return "/";
}
export async function getJSON(url, signal) {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) {
    let message;
    try {
      message = (await response.json()).error;
    } catch {
      /* Fall back to HTTP status. */
    }
    throw new Error(
      typeof message === "string"
        ? message
        : `Unable to read saved game (HTTP ${response.status}).`,
    );
  }
  return response.json();
}
export function keyboardTabs(event, items, selected, select) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const at = items.indexOf(selected);
  const index =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (at + (event.key === "ArrowRight" ? 1 : -1) + items.length) %
          items.length;
  select(items[index]);
  event.currentTarget.querySelectorAll('[role="tab"]')[index]?.focus();
}
