import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse, compileScript } from "@vue/compiler-sfc";
import { createRenderer, h, nextTick, reactive, ref } from "vue";

// Compile the real SFC setup and mount it with Vue's real lifecycle. The renderer
// needs no DOM because these tests exercise editor guards, not dialog styling.
async function mountEditor(file, input, t) {
  const url = new URL(file, import.meta.url);
  const { descriptor } = parse(
    readFileSync(url, "utf8"),
  );
  const source = compileScript(descriptor, { id: file }).content
    // Child visuals are not mounted by this lifecycle-only renderer.
    .replace(/import (\w+) from ["'][^"']+\.vue["'];/g, "const $1 = {};")
    .replace(
    /from (["'])([^"']+)\1/g,
    (_, quote, path) => `from ${JSON.stringify(path.startsWith(".") ? new URL(path, url).href : import.meta.resolve(path))}`,
  );
  const { default: editor } = await import(
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  );
  const props = reactive(input);
  let bindings;
  const wrapper = {
    ...editor,
    setup(props, context) {
      bindings = editor.setup(props, context);
      return () => null;
    },
  };
  const renderer = createRenderer({
    createComment: () => ({}),
    insert() {},
    remove() {},
    parentNode: () => null,
    nextSibling: () => null,
  });
  const app = renderer.createApp({ render: () => h(wrapper, props) });
  app.mount({});
  bindings.dialog.value = {
    open: false,
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
  };
  t.after(() => app.unmount());
  return { props, bindings };
}

const table = () => ({
  players: [{ id: "p1", life: 20, counters: {}, mana: {} }],
  turn: { number: 1, phase: "Main 1", active: "p1" },
  zones: {},
});
const settle = async () => {
  await nextTick();
  await nextTick();
};

test("opening an action editor enables the unchanged seat and reopening refreshes its guard", async (t) => {
  const revision = ref(1);
  const human = {
    canCommit: true,
    seatId: "p1",
    context: () => String(revision.value),
  };
  const { props, bindings } = await mountEditor(
    "./TableActionDialog.vue",
    { mode: "", table: table(), human },
    t,
  );
  assert.equal(bindings.canEdit.value, false);
  props.mode = "life";
  await settle();
  assert.equal(bindings.dialog.value.open, true);
  assert.equal(bindings.form.life, 20);
  assert.equal(bindings.canEdit.value, true);
  revision.value++;
  assert.equal(bindings.canEdit.value, false);
  props.mode = "";
  await settle();
  props.mode = "outcome";
  await settle();
  assert.equal(bindings.canEdit.value, true);
});

test("card inspector guards track state changes and refresh when reopening the same card", async (t) => {
  const revision = ref(1);
  const card = { id: "card1", name: "Plains", controller: "p1" };
  const human = {
    canCommit: true,
    seatId: "p1",
    context: () => String(revision.value),
    cardDetails: async () => card,
  };
  const { props, bindings } = await mountEditor(
    "./CardInspector.vue",
    { card: null, table: table(), human, historical: false, readonly: false },
    t,
  );
  assert.equal(Boolean(bindings.canEdit.value), false);
  props.card = card;
  await settle();
  assert.equal(bindings.canEdit.value, true);
  revision.value++;
  assert.equal(bindings.canEdit.value, false);
  props.card = null;
  await settle();
  props.card = card;
  await settle();
  assert.equal(bindings.canEdit.value, true);
});

test("human stack abilities queue both descriptions and reset the fields for the next ability", async (t) => {
  const queued = [];
  const human = { canCommit: true, seatId: "p1", context: () => "1", queue: action => queued.push(action) };
  const { props, bindings } = await mountEditor("./TableActionDialog.vue", { mode: "", table: table(), human }, t);
  props.mode = "ability";
  await settle();
  Object.assign(bindings.form, { name: "Gravedigger trigger", short_description: " Return a creature. ", long_description: "Return target creature card from your graveyard to your hand.\nTarget: Shambling Ghast." });
  await bindings.submit();
  assert.equal(queued[0].type, "stack_item");
  assert.equal(queued[0].definition.short_description, "Return a creature.");
  assert.match(queued[0].definition.long_description, /Target: Shambling Ghast/);
  props.mode = "";
  await settle();
  props.mode = "ability";
  await settle();
  assert.equal(bindings.form.short_description, "");
  assert.equal(bindings.form.long_description, "");
  bindings.form.name = "Simple ability";
  await bindings.submit();
  assert.equal("short_description" in queued[1].definition, false);
  assert.equal("long_description" in queued[1].definition, false);
});

test("ability inspection prefers full descriptions and keeps legacy text readable", async (t) => {
  const { props, bindings } = await mountEditor("./CardInspector.vue", { card: null, table: table(), readonly: true }, t);
  for (const [card, expected] of [
    [{ name: "Trigger", short_description: "Short", long_description: "Full explanation", oracle_text: "Legacy" }, "Full explanation"],
    [{ name: "Trigger", oracle_text: "Legacy rules text" }, "Legacy rules text"],
    [{ name: "Trigger", short_description: "Short" }, "Short"],
    [{ name: "Trigger" }, "Trigger"],
  ]) {
    props.card = { ...card, kind: "ability" };
    await settle();
    assert.equal(bindings.description.value, expected);
    assert.equal(bindings.image.value, null);
  }
});
