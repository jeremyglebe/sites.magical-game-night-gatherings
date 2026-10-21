import test from "node:test";
import assert from "node:assert/strict";
import { effectScope, ref } from "vue";
import { useBattlefieldPileOrder } from "./useBattlefieldPileOrder.js";

test("pile order persists per match/game and never changes a different scope", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const game = ref("match-a:game-1");
  const scope = effectScope();
  const view = scope.run(() => useBattlefieldPileOrder(() => game.value, { storage }));
  view.setOrder("root", ["aura", "root", "aura"]);
  assert.deepEqual(view.orders.value.root, ["aura", "root"]);
  game.value = "match-a:game-2";
  assert.deepEqual(view.orders.value, {});
  view.setOrder("root", ["root", "aura"]);
  game.value = "match-a:game-1";
  assert.deepEqual(view.orders.value.root, ["aura", "root"]);
  const second = scope.run(() => useBattlefieldPileOrder("match-a:game-1", { storage }));
  assert.deepEqual(second.orders.value.root, ["aura", "root"]);
  scope.stop();
});

test("unavailable storage and malformed preferences do not prevent local reordering", () => {
  const scope = effectScope();
  for (const storage of [null, { getItem: () => "{broken", setItem: () => { throw Error("restricted"); } }]) {
    const view = scope.run(() => useBattlefieldPileOrder("game", { storage }));
    assert.deepEqual(view.orders.value, {});
    view.setOrder("root", ["aura", "root"]);
    assert.deepEqual(view.orders.value.root, ["aura", "root"]);
  }
  scope.stop();
});
