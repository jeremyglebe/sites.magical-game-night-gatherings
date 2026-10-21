import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse, compileScript } from "@vue/compiler-sfc";
import { createRenderer, h, nextTick, reactive } from "vue";

async function fixture(t, singleton = false) {
  const url = new URL("./BattlefieldPile.vue", import.meta.url);
  const { descriptor } = parse(readFileSync(url, "utf8"));
  const source = compileScript(descriptor, { id: "battlefield-pile" }).content
    .replace(/import (\w+) from ["'][^"']+\.vue["'];/g, "const $1 = {};")
    .replace(/from (["'])([^"']+)\1/g, (_, quote, path) =>
      `from ${JSON.stringify(path.startsWith(".") ? new URL(path, url).href : import.meta.resolve(path))}`);
  const { default: component } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const root = { id: "root", name: "Shambling Ghast", controller: "p1", tapped: true };
  const aura = { id: "aura", name: "Dead Weight", controller: "p2", attached_to: "root" };
  const orders = [], inspected = [], queued = [];
  const props = reactive({
    pile: { root, cards: singleton ? [root] : [root, aura] },
    order: [],
    readonly: true,
    human: { queue: (action) => queued.push(action) },
    onOrder: (value) => { orders.push(value); props.order = value.ids; },
    onInspect: (card) => inspected.push(card.id),
  });
  let bindings;
  const wrapper = { ...component, setup(input, context) { bindings = component.setup(input, context); return () => null; } };
  const renderer = createRenderer({ createComment: () => ({}), insert() {}, remove() {}, parentNode: () => null, nextSibling: () => null });
  const app = renderer.createApp({ render: () => h(wrapper, props) });
  app.mount({});
  t.after(() => app.unmount());
  return { bindings, props, root, aura, orders, inspected, queued };
}

function event(values = {}) {
  return { prevented: false, stopped: false, shiftKey: false, deltaX: 0, deltaY: 0, deltaMode: 0,
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...values };
}

test("plain click inspects the top card; Shift-click cycles locally without opening an inspector", async (t) => {
  const { bindings, root, aura, orders, inspected, queued } = await fixture(t);
  const click = event();
  bindings.cycleClick(click);
  if (!click.stopped) bindings.inspectTop();
  assert.deepEqual(inspected, ["root"]);
  const shifted = event({ shiftKey: true });
  bindings.cycleClick(shifted);
  if (!shifted.stopped) bindings.inspectTop();
  assert.equal(shifted.prevented, true);
  assert.deepEqual(inspected, ["root"]);
  assert.deepEqual(orders, [{ rootId: "root", ids: ["aura", "root"] }]);
  await nextTick();
  bindings.inspectTop();
  assert.deepEqual(inspected, ["root", "aura"]);
  assert.equal(root.tapped, true);
  assert.equal(aura.controller, "p2");
  assert.equal(aura.attached_to, "root");
  assert.deepEqual(queued, []);
});

test("Shift+Enter cycles for spectators but ignores key repeat and ordinary Enter", async (t) => {
  const { bindings, orders, queued } = await fixture(t);
  const plain = event({ key: "Enter" });
  bindings.cycleKey(plain);
  assert.equal(plain.prevented, false);
  const shifted = event({ key: "Enter", shiftKey: true });
  bindings.cycleKey(shifted);
  assert.equal(shifted.prevented, true);
  bindings.cycleKey(event({ key: "Enter", shiftKey: true, repeat: true }));
  assert.equal(orders.length, 1);
  assert.deepEqual(queued, []);
});

test("wheel cycles a multi-card pile while singleton scrolling and pinch zoom remain native", async (t) => {
  const pile = await fixture(t);
  const down = event({ deltaY: 100 });
  pile.bindings.cycleWheel(down);
  assert.equal(down.prevented, true);
  assert.deepEqual(pile.orders, [{ rootId: "root", ids: ["aura", "root"] }]);
  const zoom = event({ deltaY: 100, ctrlKey: true });
  pile.bindings.cycleWheel(zoom);
  assert.equal(zoom.prevented, false);
  assert.equal(pile.orders.length, 1);
  const single = await fixture(t, true);
  const scroll = event({ deltaY: 100 });
  single.bindings.cycleWheel(scroll);
  assert.equal(scroll.prevented, false);
  assert.deepEqual(single.orders, []);
  assert.deepEqual(pile.queued, []);
});
