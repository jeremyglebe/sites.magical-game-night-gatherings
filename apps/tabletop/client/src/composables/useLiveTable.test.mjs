import test from "node:test";
import assert from "node:assert/strict";
import { createRenderer } from "vue";
import { useLiveTable } from "./useLiveTable.js";

// A DOM is unnecessary: mounting a null-rendering component exercises Vue's
// actual lifecycle hooks and cleans up the polling interval on unmount.
const renderer = createRenderer({
  createComment: () => ({}),
  insert() {},
  remove() {},
  parentNode: () => null,
  nextSibling: () => null,
});

for (const status of [401, 404]) {
  test(`standalone table remains viewable when /api/app returns ${status}`, async (t) => {
    const calls = [];
    const table = { revision: 7, players: [{ id: "solo", name: "Solo" }] };
    t.mock.method(globalThis, "fetch", async (path) => {
      calls.push(path);
      if (path === "/api/app")
        return Response.json(
          { error: "Player connection required" },
          { status },
        );
      assert.equal(path, "/api/table");
      return Response.json(table);
    });
    let live;
    const component = renderer.createApp({
      setup() {
        live = useLiveTable();
        return () => null;
      },
    });
    component.mount({});
    t.after(() => component.unmount());
    await live.refresh();
    assert.equal(live.legacy.value, true);
    assert.equal(live.connected.value, true);
    assert.deepEqual(live.table.value, table);
    assert.equal(live.error.value, "");
    await live.refresh();
    assert.deepEqual(calls, ["/api/app", "/api/table", "/api/table"]);
  });
}

test("a failing application endpoint is not mistaken for a standalone table", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (path) => {
    calls.push(path);
    return Response.json({ error: "Application unavailable" }, { status: 503 });
  });
  let live;
  const component = renderer.createApp({
    setup() {
      live = useLiveTable();
      return () => null;
    },
  });
  component.mount({});
  t.after(() => component.unmount());
  await live.refresh();
  assert.equal(live.legacy.value, false);
  assert.equal(live.connected.value, false);
  assert.equal(live.table.value, null);
  assert.equal(live.error.value, "Application unavailable");
  assert.deepEqual(calls, ["/api/app"]);
});
