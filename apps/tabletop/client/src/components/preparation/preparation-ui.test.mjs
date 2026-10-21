import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse, compileScript } from "@vue/compiler-sfc";
import { createRenderer, h, nextTick, reactive } from "vue";
import { createTable, observe } from "../../../../server/table.mjs";

async function mountSetup(file, input, t) {
  const url = new URL(file, import.meta.url);
  const { descriptor } = parse(readFileSync(url, "utf8"));
  const source = compileScript(descriptor, { id: file }).content
    .replace(/import (\w+) from ["'][^"']+\.vue["'];/g, "const $1 = {};")
    .replace(/from (["'])([^"']+)\1/g, (_, quote, path) => `from ${JSON.stringify(path.startsWith(".") ? new URL(path, url).href : import.meta.resolve(path))}`);
  const { default: component } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const props = reactive(input);
  let bindings;
  const wrapper = { ...component, setup(props, context) {
    bindings = component.setup(props, context);
    return () => null;
  } };
  const renderer = createRenderer({ createComment: () => ({}), insert() {}, remove() {}, parentNode: () => null, nextSibling: () => null });
  const app = renderer.createApp({ render: () => h(wrapper, props) });
  app.mount({});
  t.after(() => app.unmount());
  return { props, bindings };
}

test("new tables default to Jumpstart with two opposite factions and no old preset deck data", async (t) => {
  const emitted = [];
  const { bindings } = await mountSetup("../setup/SetupPanel.vue", { app: {}, onCreate: (setup) => emitted.push(setup) }, t);
  assert.equal(bindings.form.deckSource, "zombies-vs-plants-v0.1");
  bindings.addPlayer();
  assert.equal(bindings.players.value.length, 2);
  bindings.chooseFaction(0, "zombies");
  assert.deepEqual(bindings.players.value.map((player) => player.faction), ["zombies", "plants"]);
  bindings.players.value[0].deck = [{ name: "Old imported deck" }];
  bindings.players.value[0].deckPreset = "white";
  bindings.submit();
  assert.deepEqual(emitted[0].preparation, { kind: "jumpstart", source: "zombies-vs-plants-v0.1" });
  assert.equal(emitted[0].players.some((player) => "deck" in player || "deckPreset" in player), false);
});

test("custom card-list imports remain available and removed presets cannot silently replace them", async (t) => {
  const emitted = [];
  const { bindings } = await mountSetup("../setup/SetupPanel.vue", { app: {}, onCreate: (setup) => emitted.push(setup) }, t);
  assert.throws(() => bindings.importSetup({ players: [{ deckPreset: "white" }, { deckPreset: "green" }] }), /presets have been removed/);
  assert.equal(bindings.form.deckSource, "zombies-vs-plants-v0.1");
  const deck = [{ name: "Island", count: 40 }];
  bindings.importSetup({ title: "Imported deck", players: [{ id: "human", ai: false, deck }] });
  assert.equal(bindings.form.deckSource, "custom");
  bindings.submit();
  assert.equal("preparation" in emitted[0], false);
  assert.deepEqual(emitted[0].players[0].deck, deck);
  assert.equal("faction" in emitted[0].players[0], false);
  bindings.importSetup({ players: [{ id: "a" }, { id: "b" }] });
  bindings.submit();
  assert.deepEqual(emitted[1].preparation, { kind: "jumpstart", source: "zombies-vs-plants-v0.1" });
});

test("setup preserves the banter choice through imports and submits it for either deck source", async (t) => {
  const emitted = [];
  const { bindings } = await mountSetup("../setup/SetupPanel.vue", { app: {}, onCreate: (setup) => emitted.push(setup) }, t);
  assert.equal(bindings.form.allowBanter, true);
  bindings.submit();
  assert.equal(emitted.at(-1).allowBanter, true);
  bindings.form.allowBanter = false;
  bindings.submit();
  assert.equal(emitted.at(-1).allowBanter, false);

  bindings.importSetup({ allowBanter: false, players: [{ id: "a" }, { id: "b" }] });
  assert.equal(bindings.form.allowBanter, false);
  bindings.submit();
  assert.equal(emitted.at(-1).allowBanter, false);

  const deck = [{ name: "Island", count: 40 }];
  bindings.importSetup({ allowBanter: false, players: [{ id: "human", ai: false, deck }] });
  bindings.submit();
  assert.equal(emitted.at(-1).allowBanter, false);
  bindings.form.allowBanter = true;
  bindings.submit();
  assert.equal(emitted.at(-1).allowBanter, true, "the current checkbox overrides the imported value");

  bindings.form.allowBanter = false;
  bindings.importSetup({ players: [{ id: "a" }, { id: "b" }] });
  assert.equal(bindings.form.allowBanter, true, "older setup files receive the default instead of retaining a previous form choice");
});

test("pregame choices survive polling and reset when entering a different seat", async (t) => {
  const state = createTable({ preparation: { kind: "jumpstart", source: "zombies-vs-plants-v0.1" }, players: [{ id: "p1", faction: "plants" }, { id: "p2", faction: "zombies" }] });
  const selected = [];
  const { props, bindings } = await mountSetup("./PreparationPanel.vue", {
    table: observe(state), app: { match: { id: "test" } }, human: { seatId: "p1", canAct: true, selectPackets: async (ids) => selected.push(ids) },
  }, t);
  const ids = state.preparation.packets.filter((packet) => packet.faction === "plants").slice(0, 2).map((packet) => packet.id);
  ids.forEach((id) => bindings.toggle(id, true));
  props.app = { match: { id: "test" }, coordinator: { mode: "running" } };
  props.table = { ...observe(state), revision: 1 };
  await nextTick();
  assert.deepEqual(bindings.selection.value, ids);
  assert.deepEqual(bindings.counts.value, { cards: 40, lands: 16 });
  await bindings.confirm();
  assert.deepEqual(selected, [ids]);
  props.human = { ...props.human, seatId: "p2", canAct: false };
  await nextTick();
  assert.deepEqual(bindings.selection.value, []);
  assert.equal(bindings.shownFaction.value, "zombies");
  await bindings.confirm();
  assert.equal(selected.length, 1);
});
