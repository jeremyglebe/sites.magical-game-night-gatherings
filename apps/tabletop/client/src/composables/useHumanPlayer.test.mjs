import test from "node:test";
import assert from "node:assert/strict";
import { effectScope, shallowRef, ref, nextTick } from "vue";
import { createTable, observe, applyActions } from "../../../server/table.mjs";
import { useHumanPlayer } from "./useHumanPlayer.js";
import { sideboardingView } from "../../../server/series.mjs";
const act = (state, actor, revision, actions) =>
  applyActions(state, actor, revision, actions, "Vue human test");
const flush = async () => {
  await nextTick();
  await new Promise((resolve) => setImmediate(resolve));
  await nextTick();
};

let fixtureId = 0;
function harness({ preparation = false, series = false } = {}) {
  const matchId = `vue-test-${++fixtureId}`;
  let state = createTable({
    shuffle: false,
    ...(series ? { series: { mode: "first_to", winsRequired: 2, sideboarding: true } } : {}),
    ...(preparation ? { preparation: { kind: "jumpstart", source: "zombies-vs-plants-v0.1" } } : {}),
    players: ["p1", "p2"].map((id, index) => ({
      id,
      name: id,
      faction: index === 0 ? "plants" : "zombies",
      deck: [{ name: `Secret ${id}`, type_line: "Creature", count: 10 }],
      ...(series ? { sideboard: [{ name: `Reserve ${id}`, count: 2 }] } : {}),
    })),
  });
  if (!preparation) {
    state = act(state, "p1", state.revision, [{ type: "draw", count: 2 }]);
    state = act(state, "p2", state.revision, [{ type: "draw", count: 2 }]);
  }
  let physicalRevision = state.revision,
    failActions = false,
    gate = null;
  const app = shallowRef({
    match: {
      id: matchId,
      players: [
        { id: "p1", ai: false },
        { id: "p2", ai: true },
      ],
    },
    coordinator: {
      mode: "running",
      pendingRecipient: { playerId: "p1" },
      players: [],
      active: 0,
    },
  });
  const publicTable = shallowRef(observe(state)),
    connected = ref(true),
    calls = [];
  const response = () => ({
    matchId,
    playerId: "p1",
    table: observe(state, "p1"),
    boardRevision: physicalRevision,
    canAct: app.value.coordinator.pendingRecipient.playerId === "p1",
    canChat: true,
  });
  const refresh = async () => {
    publicTable.value = observe(state);
  };
  const request = async (path, body) => {
    calls.push({ path, body });
    if (path.startsWith("/api/human/sideboard?")) return sideboardingView(state, "p1");
    if (path.startsWith("/api/human?")) {
      if (gate) await gate;
      return response();
    }
    if (path === "/api/human/act") {
      if (failActions) throw Error("Response lost");
      state = act(state, "p1", body.revision, body.actions);
      physicalRevision = state.revision;
      return response();
    }
    if (path === "/api/human/chat") {
      state = act(state, "p1", state.revision, [
        { type: "say", text: body.text },
      ]);
      return response();
    }
    throw Error("Unexpected endpoint");
  };
  const scope = effectScope();
  const human = scope.run(() =>
    useHumanPlayer({ app, publicTable, connected, request, refresh }),
  );
  return {
    human,
    scope,
    app,
    publicTable,
    connected,
    calls,
    refresh,
    response,
    change: (actions) => {
      state = act(state, "p2", state.revision, actions);
      physicalRevision = state.revision;
      publicTable.value = observe(state);
    },
    fail: () => (failActions = true),
    setGate: (value) => (gate = value),
  };
}

test("entered seat previews are reversible and disappear on hide or disconnect", async () => {
  const h = harness();
  h.human.join("p1");
  await flush();
  assert.equal(h.human.view.value.zones["p1:hand"].cards.length, 2);
  assert.equal(h.human.view.value.zones["p2:hand"].cards.length, 0);
  const card = h.human.view.value.zones["p1:hand"].cards[0];
  h.human.queue(
    { type: "move", card: card.id, to: "battlefield" },
    "Play creature",
  );
  assert.equal(h.human.preview.value.zones.battlefield.cards.length, 1);
  assert.equal(h.publicTable.value.zones.battlefield.cards.length, 0);
  h.human.undo();
  assert.equal(h.human.preview.value, null);
  h.connected.value = false;
  await flush();
  assert.equal(h.human.view.value, null);
  assert.equal(h.human.displayTable.value.zones["p1:hand"].cards.length, 0);
  h.human.leave();
  assert.equal(h.human.seatId.value, "");
  h.scope.stop();
});

test("a physical change invalidates queued actions and prevents sending them", async () => {
  const h = harness();
  h.human.join("p1");
  await flush();
  h.human.queue({ type: "turn", set: { phase: "Main 1" } }, "Main phase");
  h.change([{ type: "player", player: "p2", set: { life: 19 } }]);
  await flush();
  assert.equal(h.human.stale.value, true);
  assert.equal(h.human.preview.value, null);
  assert.equal(h.human.canCommit.value, false);
  assert.equal(await h.human.send({ handoff: "priority", to: "p2" }), false);
  assert.equal(h.calls.filter((c) => c.path === "/api/human/act").length, 0);
  h.scope.stop();
});

test("out-of-turn speech preserves the physical draft and rebases only speech revisions", async () => {
  const h = harness();
  h.human.join("p1");
  await flush();
  h.human.queue({ type: "turn", set: { phase: "Main 1" } }, "Main phase");
  h.app.value = {
    ...h.app.value,
    coordinator: {
      ...h.app.value.coordinator,
      pendingRecipient: { playerId: "p2" },
    },
  };
  await flush();
  assert.equal(h.human.canAct.value, false);
  assert.equal(h.human.canChat.value, true);
  assert.equal(await h.human.send({ message: "One moment, please." }), true);
  await flush();
  assert.equal(h.human.pending.value.length, 1);
  assert.equal(h.human.stale.value, false);
  assert.equal(h.calls.filter((c) => c.path === "/api/human/chat").length, 1);
  assert.equal(h.calls.filter((c) => c.path === "/api/human/act").length, 0);
  h.scope.stop();
});

test("send batches queued actions, speech and one handoff and clears only after success", async () => {
  const h = harness();
  h.human.join("p1");
  await flush();
  h.human.queue({ type: "turn", set: { phase: "Main 1" } }, "Main phase");
  assert.equal(
    await h.human.send({
      message: "Your response?",
      handoff: "priority",
      to: "p2",
    }),
    true,
  );
  await flush();
  const sent = h.calls.find((c) => c.path === "/api/human/act").body;
  assert.deepEqual(
    sent.actions.map((a) => a.type),
    ["turn", "pass"],
  );
  assert.equal(sent.actions[1].message, "Your response?");
  assert.equal(h.human.pending.value.length, 0);
  h.scope.stop();
});

test("unconfirmed sends keep the draft, block retry and never retry automatically", async () => {
  const h = harness();
  h.human.join("p1");
  await flush();
  h.human.queue({ type: "turn", set: { phase: "Main 1" } }, "Main phase");
  h.fail();
  assert.equal(await h.human.send(), false);
  await flush();
  assert.equal(h.human.pending.value.length, 1);
  assert.equal(h.human.failedDraft.value, true);
  assert.equal(h.human.canCommit.value, false);
  await h.human.send({ handoff: "turn", to: "p2" });
  assert.equal(h.calls.filter((c) => c.path === "/api/human/act").length, 1);
  h.human.clear();
  assert.equal(h.human.failedDraft.value, false);
  h.scope.stop();
});

test("a delayed private response cannot re-enter a hidden seat", async () => {
  const h = harness();
  let release;
  h.setGate(new Promise((resolve) => (release = resolve)));
  h.human.join("p1");
  h.human.leave();
  release();
  await flush();
  assert.equal(h.human.view.value, null);
  assert.equal(h.human.seatId.value, "");
  h.scope.stop();
});

test("pregame selection keeps chat open, blocks game actions, and submits one authorized packet selection", async () => {
  const h = harness({ preparation: true });
  h.human.join("p1");
  await flush();
  const prep = h.human.view.value.preparation;
  const ids = prep.packets.filter((packet) => packet.faction === "plants").slice(0, 2).map((packet) => packet.id);
  assert.equal(h.human.canAct.value, true);
  assert.equal(h.human.canCommit.value, false);
  assert.equal(h.human.canChat.value, true);
  assert.throws(() => h.human.draw(), /Choose packets/);
  assert.equal(await h.human.send({ handoff: "priority", to: "p2" }), false);
  assert.equal(await h.human.send({ message: "I am checking the packet lists." }), true);
  await flush();
  assert.equal(await h.human.selectPackets(ids), true);
  await flush();
  const submitted = h.calls.filter((call) => call.path === "/api/human/act");
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].body.playerId, "p1");
  assert.deepEqual(submitted[0].body.actions, [{ type: "select_packets", packetIds: ids }]);
  assert.equal(h.human.view.value.preparation.players[0].ready, true);
  assert.equal(await h.human.selectPackets(ids), false);
  assert.equal(h.calls.filter((call) => call.path === "/api/human/act").length, 1);
  h.scope.stop();
});

test("failed packet submission retains selection stage and does not automatically retry", async () => {
  const h = harness({ preparation: true });
  h.human.join("p1");
  await flush();
  const ids = h.human.view.value.preparation.packets.filter((packet) => packet.faction === "plants").slice(0, 2).map((packet) => packet.id);
  h.fail();
  assert.equal(await h.human.selectPackets(ids), false);
  await flush();
  assert.equal(h.human.view.value.preparation.players[0].ready, false);
  assert.equal(h.calls.filter((call) => call.path === "/api/human/act").length, 1);
  assert.match(h.human.error.value, /not automatically retried/);
  h.scope.stop();
});


test("between-game human controls keep chat open, block game moves, and submit private swaps with readiness", async () => {
  const h = harness({ series: true });
  h.human.join("p1");
  await flush();
  h.change([{ type: "result", winners: ["p2"], explanation: "First game" }]);
  await flush();
  assert.equal(h.human.betweenGames.value, true);
  assert.equal(h.human.canAct.value, true);
  assert.equal(h.human.canChat.value, true);
  assert.equal(h.human.canCommit.value, false);
  assert.throws(() => h.human.draw(), /Prepare the next game/);
  assert.equal(await h.human.send({ handoff: "turn", to: "p2" }), false);
  assert.equal(await h.human.send({ message: "Let's try again." }), true);
  await flush();
  const pool = await h.human.readSideboard();
  assert.equal(pool.mainSize, 10);
  assert.equal(pool.cards.some((card) => card.definition.name.includes("p2")), false);
  const main = pool.cards.map((card) => ({ id: card.id, count: card.main ? 9 : 1 }));
  assert.equal(await h.human.prepareNextGame({ main, startingPlayer: "p1", message: "Ready." }), true);
  await flush();
  const submit = h.calls.filter((call) => call.path === "/api/human/act");
  assert.equal(submit.length, 1);
  assert.deepEqual(submit[0].body.actions, [
    { type: "sideboard", main },
    { type: "ready_next_game", starting_player: "p1", message: "Ready." },
  ]);
  assert.equal(h.human.view.value.series.ready.includes("p1"), true);
  assert.equal(h.human.canCommit.value, false);
  h.scope.stop();
});

test("failed readiness is not retried and ordinary games cannot use between-game tools", async () => {
  const h = harness({ series: true });
  h.human.join("p1");
  await flush();
  assert.equal(await h.human.readSideboard(), null);
  assert.equal(await h.human.prepareNextGame(), false);
  assert.equal(h.calls.filter((call) => call.path === "/api/human/act").length, 0);
  h.change([{ type: "result", winners: ["p2"] }]);
  await flush();
  h.fail();
  assert.equal(await h.human.prepareNextGame(), false);
  await flush();
  assert.equal(h.calls.filter((call) => call.path === "/api/human/act").length, 1);
  assert.equal(h.human.view.value.series.ready.length, 0);
  assert.match(h.human.error.value, /not automatically retried/);
  h.scope.stop();
});

test("attachment drops preview across controllers, reject cycles, and undo without touching the saved table", async () => {
  const h = harness();
  try {
    h.human.join("p1");
    await flush();
    const [equipment, creature] = h.human.view.value.zones["p1:hand"].cards;
    for (const card of [equipment, creature]) h.human.queueDrop({ cardId: card.id }, { zoneId: "battlefield" });
    assert.equal(await h.human.send(), true);
    await flush();
    h.change([{ type: "card", card: creature.id, set: { controller: "p2" } }]);
    await flush();
    const source = { cardId: equipment.id }, target = { zoneId: "battlefield", attachTo: creature.id, controller: "p2" };
    assert.equal(h.human.canDrop(source, target), true);
    assert.equal(h.human.queueDrop(source, target), true);
    const previewed = h.human.preview.value.zones.battlefield.cards.find(card => card.id === equipment.id);
    assert.equal(previewed.attached_to, creature.id);
    assert.equal(previewed.controller, "p1");
    assert.equal(h.publicTable.value.zones.battlefield.cards.find(card => card.id === equipment.id).attached_to, null);
    assert.equal(h.human.canDrop({ cardId: creature.id }, { zoneId: "battlefield", attachTo: equipment.id }), false, "a descendant cannot become its ancestor's parent");
    assert.equal(h.human.canDrop(source, target), false, "an existing relationship is a no-op");
    assert.equal(h.human.queueDrop(source, target), false);
    assert.equal(h.human.pending.value.length, 1);
    h.human.undo();
    assert.equal(h.human.preview.value, null);
    h.human.queueDrop(source, target);
    assert.equal(await h.human.send(), true);
    await flush();
    h.human.queueDrop(source, { zoneId: "battlefield", controller: "p1" });
    assert.equal(h.human.preview.value.zones.battlefield.cards.find(card => card.id === equipment.id).attached_to, null);
    h.human.undo();
    assert.equal(h.human.displayTable.value.zones.battlefield.cards.find(card => card.id === equipment.id).attached_to, creature.id);
  } finally { h.scope.stop(); }
});

test("resolving a stack card onto a creature queues both operations and stale drafts cannot send", async () => {
  const h = harness();
  try {
    h.human.join("p1");
    await flush();
    const [aura, creature] = h.human.view.value.zones["p1:hand"].cards;
    h.human.queueDrop({ cardId: aura.id }, { zoneId: "stack" });
    h.human.queueDrop({ cardId: creature.id }, { zoneId: "battlefield" });
    assert.equal(await h.human.send(), true);
    await flush();
    h.human.queueDrop({ cardId: aura.id }, { zoneId: "battlefield", attachTo: creature.id });
    assert.deepEqual(h.human.pending.value.map(item => item.action), [
      { type: "move", card: aura.id, to: "battlefield", position: "bottom" },
      { type: "card", card: aura.id, set: { attached_to: creature.id } },
    ]);
    assert.equal(h.human.preview.value.zones.stack.cards.length, 0);
    assert.equal(h.publicTable.value.zones.stack.cards.length, 1);
    h.human.undo(); h.human.undo();
    assert.equal(h.human.displayTable.value.zones.stack.cards[0].id, aura.id);
    h.human.queueDrop({ cardId: aura.id }, { zoneId: "battlefield", attachTo: creature.id });
    h.change([{ type: "move", card: creature.id, to: "p1:graveyard" }]);
    await flush();
    assert.equal(h.human.stale.value, true);
    assert.equal(h.human.canDrop({ cardId: aura.id }, { zoneId: "battlefield", attachTo: creature.id }), false);
    const submits = h.calls.filter(call => call.path === "/api/human/act").length;
    assert.equal(await h.human.send(), false);
    assert.equal(h.calls.filter(call => call.path === "/api/human/act").length, submits);
  } finally { h.scope.stop(); }
});
