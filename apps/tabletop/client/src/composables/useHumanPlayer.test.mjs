import test from "node:test";
import assert from "node:assert/strict";
import { effectScope, shallowRef, ref, nextTick } from "vue";
import { createTable, observe, applyActions } from "../../../server/table.mjs";
import { useHumanPlayer } from "./useHumanPlayer.js";
const act = (state, actor, revision, actions) =>
  applyActions(state, actor, revision, actions, "Vue human test");
const flush = async () => {
  await nextTick();
  await new Promise((resolve) => setImmediate(resolve));
  await nextTick();
};

let fixtureId = 0;
function harness() {
  const matchId = `vue-test-${++fixtureId}`;
  let state = createTable({
    shuffle: false,
    players: ["p1", "p2"].map((id) => ({
      id,
      name: id,
      deck: [{ name: `Secret ${id}`, type_line: "Creature", count: 10 }],
    })),
  });
  state = act(state, "p1", state.revision, [{ type: "draw", count: 2 }]);
  state = act(state, "p2", state.revision, [{ type: "draw", count: 2 }]);
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
