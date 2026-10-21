import { computed, ref, shallowRef, watch } from "vue";
import { previewHumanActions } from "../../../shared/human-preview.mjs";
import { cardDropActions } from "../../../shared/human-card-moves.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));
const readStorage = (key) => {
  try {
    return JSON.parse(sessionStorage.getItem(key) || "null");
  } catch {
    return null;
  }
};

/** One entered human seat. Private reads and reversible drafts never enter the public store. */
export function useHumanPlayer({
  app,
  publicTable,
  connected,
  request,
  refresh,
}) {
  const seatId = ref(""),
    snapshot = shallowRef(null),
    pending = shallowRef([]),
    busy = ref(false),
    error = ref("");
  const message = ref(""),
    recipient = ref(""),
    selectedSource = shallowRef(null),
    failedDraft = ref(false);
  const baseRevision = ref(null),
    boardRevision = ref(null),
    version = ref(0);
  let generation = 0,
    fetching = false,
    fetchAgain = false,
    storedMatch = app.value?.match?.id || "";
  const matchId = computed(() => app.value?.match?.id || "");
  const humans = computed(
    () => app.value?.match?.players?.filter((p) => p.ai === false) || [],
  );
  const key = (match = storedMatch, seat = seatId.value) =>
    `game-night-human-draft:${match}:${seat}`;
  const fresh = computed(
    () =>
      !!seatId.value &&
      connected.value &&
      snapshot.value?.table?.revision === publicTable.value?.revision,
  );
  const view = computed(() => (fresh.value ? snapshot.value.table : null));
  const stale = computed(
    () =>
      pending.value.length > 0 &&
      baseRevision.value !== snapshot.value?.table?.revision,
  );
  const previewResult = computed(() =>
    view.value && pending.value.length && !stale.value && !failedDraft.value
      ? previewHumanActions(
          clone(view.value),
          seatId.value,
          clone(pending.value.map((item) => item.action)),
        )
      : null,
  );
  const preview = computed(() => previewResult.value?.table || null);
  const displayTable = computed(
    () => preview.value || view.value || publicTable.value,
  );
  const canAct = computed(
    () =>
      fresh.value &&
      !!snapshot.value?.canAct &&
      !snapshot.value.table.result &&
      !app.value?.postgame &&
      app.value?.coordinator?.pendingRecipient?.playerId === seatId.value &&
      !(app.value?.coordinator?.players || []).some((p) => p.active) &&
      !busy.value,
  );
  const canChat = computed(
    () =>
      connected.value &&
      !!seatId.value &&
      !!snapshot.value &&
      snapshot.value.canChat !== false &&
      !snapshot.value.table.result &&
      !app.value?.postgame &&
      !busy.value,
  );
  const canCommit = computed(
    () =>
      canAct.value &&
      !stale.value &&
      !failedDraft.value &&
      previewResult.value?.valid !== false,
  );
  const status = computed(() =>
    !connected.value
      ? "Disconnected · reconnect before playing."
      : !seatId.value
        ? "Enter a human seat to see your hand."
        : !snapshot.value
          ? "Loading your seat…"
          : snapshot.value.table.result
            ? "The game has ended."
            : canAct.value
              ? "Your response · moves stay queued until you send."
              : snapshot.value.message ||
                "Waiting for a handoff. You can still chat and inspect cards.",
  );
  const draftWarning = computed(() =>
    stale.value
      ? "The table changed. Clear and rebuild this play."
      : failedDraft.value
        ? "Send unconfirmed. Check the table, then clear and rebuild this play."
        : previewResult.value?.errors?.[0]?.message || "",
  );
  function save() {
    if (!storedMatch || !seatId.value) return;
    try {
      sessionStorage.setItem(
        key(),
        JSON.stringify({
          queue: pending.value.map(({ action, label }) => ({
            op: action,
            label,
          })),
          baseRevision: baseRevision.value,
          draftBoardRevision: boardRevision.value,
          failedDraft: failedDraft.value,
          message: message.value,
          recipient: recipient.value,
        }),
      );
    } catch {
      /* Storage is optional. */
    }
  }
  function restore() {
    const data = readStorage(key());
    pending.value =
      Array.isArray(data?.queue) &&
      data.queue.length <= 30 &&
      data.queue.every(
        (item) => item?.op?.type && typeof item.label === "string",
      )
        ? data.queue.map(({ op, label }) => ({ action: op, label }))
        : [];
    baseRevision.value = data?.baseRevision ?? null;
    boardRevision.value = data?.draftBoardRevision ?? null;
    failedDraft.value = data?.failedDraft === true;
    message.value = String(data?.message || "").slice(0, 2000);
    const players = publicTable.value?.players || [];
    recipient.value = players.some((p) => p.id === data?.recipient)
      ? data.recipient
      : players[
          (players.findIndex((p) => p.id === seatId.value) + 1) % players.length
        ]?.id || seatId.value;
  }
  function resetDraft() {
    pending.value = [];
    baseRevision.value = null;
    boardRevision.value = null;
    failedDraft.value = false;
    selectedSource.value = null;
    version.value++;
  }
  function accept(result) {
    if (
      !result?.table ||
      (snapshot.value && result.table.revision < snapshot.value.table.revision)
    )
      return;
    if (pending.value.length && !failedDraft.value) {
      if (
        boardRevision.value === null &&
        baseRevision.value === result.table.revision
      )
        boardRevision.value = result.boardRevision ?? null;
      if (
        boardRevision.value !== null &&
        result.boardRevision === boardRevision.value
      )
        baseRevision.value = result.table.revision;
    }
    snapshot.value = result;
    save();
  }
  async function refreshView() {
    if (!seatId.value || !connected.value || !matchId.value) return;
    if (fetching) {
      fetchAgain = true;
      return;
    }
    fetching = true;
    const serial = generation,
      match = matchId.value,
      seat = seatId.value;
    try {
      const result = await request(
        `/api/human?${new URLSearchParams({ matchId: match, playerId: seat })}`,
      );
      if (
        serial === generation &&
        result.matchId === match &&
        result.playerId === seat
      )
        accept(result);
    } catch (err) {
      if (serial === generation) {
        snapshot.value = null;
        error.value = err.message;
      }
    } finally {
      fetching = false;
      if (fetchAgain) {
        fetchAgain = false;
        void refreshView();
      }
    }
  }
  function join(id) {
    if (busy.value || !humans.value.some((p) => p.id === id)) return;
    save();
    generation++;
    snapshot.value = null;
    selectedSource.value = null;
    seatId.value = id;
    storedMatch = matchId.value;
    error.value = "";
    restore();
    try {
      sessionStorage.setItem(`game-night-human-seat:${storedMatch}`, id);
    } catch {}
    void refreshView();
  }
  function leave() {
    if (busy.value) return;
    save();
    generation++;
    seatId.value = "";
    snapshot.value = null;
    resetDraft();
    message.value = "";
    error.value = "";
  }
  function ensureWritable() {
    if (!canAct.value)
      throw Error(
        snapshot.value?.message || "Wait until control is handed to this seat.",
      );
    if (
      stale.value ||
      failedDraft.value ||
      previewResult.value?.valid === false
    )
      throw Error(draftWarning.value);
  }
  function queue(action, label) {
    ensureWritable();
    const entries = Array.isArray(action)
      ? action.map((item) => ({
          action: item.action || item.op,
          label: item.label,
        }))
      : [{ action, label: label || action.type }];
    if (pending.value.length + entries.length > 28)
      throw Error("A play can queue up to 28 actions. Send this play first.");
    if (!pending.value.length) {
      baseRevision.value = snapshot.value.table.revision;
      boardRevision.value = snapshot.value.boardRevision ?? null;
    }
    pending.value = [...pending.value, ...clone(entries)];
    selectedSource.value = null;
    version.value++;
    error.value = "";
    save();
  }
  function clear() {
    if (busy.value) return;
    resetDraft();
    error.value = "";
    save();
  }
  function remove(index) {
    if (busy.value) return;
    pending.value = pending.value.filter((_, i) => i !== index);
    if (!pending.value.length) resetDraft();
    selectedSource.value = null;
    version.value++;
    save();
  }
  function undo() {
    remove(pending.value.length - 1);
  }
  function sourceCard(source) {
    return Object.values(displayTable.value?.zones || {})
      .flatMap((z) => z.cards || [])
      .find((c) => c.id === source?.cardId);
  }
  function canDrag(source) {
    if (!canCommit.value) return false;
    if (source?.drawFrom)
      return (
        source.drawFrom === `${seatId.value}:library` &&
        displayTable.value?.zones[source.drawFrom]?.count > 0
      );
    const c = sourceCard(source);
    return !!c && !c.draft && c.editable !== false && !c.preview_unknown;
  }
  function canDrop(source, target) {
    if (!canDrag(source)) return false;
    try {
      return (
        cardDropActions(displayTable.value, seatId.value, source, target)
          .length > 0
      );
    } catch {
      return false;
    }
  }
  function queueDrop(source, target) {
    ensureWritable();
    if (!canDrag(source)) throw Error("This card changed. Select it again.");
    const actions = cardDropActions(
      displayTable.value,
      seatId.value,
      source,
      target,
    );
    if (actions.length) queue(actions);
    selectedSource.value = null;
    return true;
  }
  function selectSource(source) {
    ensureWritable();
    if (!canDrag(source))
      throw Error("Send the pending play before moving that card.");
    selectedSource.value = source;
  }
  function cancelSelection() {
    selectedSource.value = null;
  }
  function draw(count = 1) {
    queue(
      { type: "draw", count: Number(count) },
      `Draw ${count} card${count === 1 ? "" : "s"}`,
    );
  }
  function shuffle() {
    queue({ type: "shuffle" }, "Shuffle your library");
  }
  function untap() {
    const cards = (displayTable.value?.zones.battlefield.cards || []).filter(
      (c) => c.controller === seatId.value && c.tapped,
    );
    if (!cards.length) throw Error("No tapped cards to untap.");
    if (cards.some((c) => c.draft || c.editable === false))
      throw Error("Send the pending play before editing new cards.");
    queue(
      cards.map((c) => ({
        action: { type: "card", card: c.id, set: { tapped: false } },
        label: `Untap ${c.name}`,
      })),
    );
  }
  function returnHand() {
    const cards =
      displayTable.value?.zones[`${seatId.value}:hand`]?.cards || [];
    if (!cards.length) throw Error("Your hand is empty.");
    if (cards.some((c) => c.draft || c.editable === false))
      throw Error("Send pending draws before returning those cards.");
    queue(
      cards.map((c) => ({
        action: {
          type: "move",
          card: c.id,
          to: `${seatId.value}:library`,
          position: "bottom",
        },
        label: `Return ${c.name} to your library`,
      })),
    );
  }
  async function cardDetails(card) {
    return request(
      `/api/human/card?${new URLSearchParams({ matchId: matchId.value, playerId: seatId.value, id: card.id })}`,
    );
  }
  async function send(options = {}) {
    const text = String(options.message ?? message.value).trim();
    let terminal = options.handoff;
    if (typeof terminal === "string")
      terminal = {
        type: { priority: "pass", turn: "pass_turn" }[terminal] || terminal,
        next: options.to || recipient.value,
      };
    const serial = generation,
      match = matchId.value,
      seat = seatId.value;
    let attempted = false;
    try {
      error.value = "";
      const commit =
        !!terminal || (pending.value.length > 0 && canCommit.value);
      let path, body;
      if (commit) {
        ensureWritable();
        const actions = clone(pending.value.map((item) => item.action));
        if (terminal && ["pass", "pass_turn"].includes(terminal.type)) {
          actions.push({ ...terminal, ...(text ? { message: text } : {}) });
        } else {
          if (text) actions.push({ type: "say", text });
          if (terminal) actions.push(terminal);
        }
        if (!actions.length) return false;
        if (actions.length > 30)
          throw Error("Send fewer than 31 actions at once.");
        path = "/api/human/act";
        body = {
          matchId: match,
          playerId: seat,
          revision: pending.value.length
            ? baseRevision.value
            : snapshot.value.table.revision,
          actions,
        };
      } else {
        if (!text) return false;
        if (!canChat.value)
          throw Error("Enter your seat and reconnect to send a message.");
        path = "/api/human/chat";
        body = { matchId: match, playerId: seat, text };
      }
      busy.value = true;
      attempted = commit;
      const result = await request(path, body);
      if (serial !== generation) return false;
      if (commit) resetDraft();
      message.value = "";
      accept(result);
      save();
      await refresh();
      return true;
    } catch (err) {
      if (serial === generation) {
        if (attempted && pending.value.length) {
          failedDraft.value = true;
          save();
        }
        error.value = `${err.message} Your draft is kept; it was not automatically retried.`;
      }
      return false;
    } finally {
      busy.value = false;
      void refreshView();
    }
  }
  watch([message, recipient], save);
  watch(matchId, (id, old) => {
    if (id === old) return;
    save();
    generation++;
    seatId.value = "";
    snapshot.value = null;
    resetDraft();
    message.value = "";
    storedMatch = id;
    error.value = "";
  });
  watch(
    () => [
      publicTable.value?.revision,
      connected.value,
      app.value?.coordinator?.mode,
      app.value?.coordinator?.pendingRecipient?.playerId,
      app.value?.coordinator?.active,
      app.value?.postgame?.status,
    ],
    () => {
      selectedSource.value = null;
      if (!connected.value) snapshot.value = null;
      else void refreshView();
    },
  );
  return {
    seatId,
    view,
    preview,
    pending,
    busy,
    error,
    message,
    recipient,
    canAct,
    canCommit,
    canChat,
    stale,
    failedDraft,
    previewResult,
    displayTable,
    selectedSource,
    status,
    draftWarning,
    humans,
    version,
    join,
    leave,
    queue,
    undo,
    remove,
    clear,
    send,
    refreshView,
    canDrag,
    canDrop,
    queueDrop,
    selectSource,
    cancelSelection,
    draw,
    shuffle,
    untap,
    returnHand,
    cardDetails,
    request,
    context: () =>
      JSON.stringify([
        matchId.value,
        seatId.value,
        snapshot.value?.boardRevision ?? snapshot.value?.table?.revision,
        version.value,
        connected.value,
        canCommit.value,
      ]),
  };
}
