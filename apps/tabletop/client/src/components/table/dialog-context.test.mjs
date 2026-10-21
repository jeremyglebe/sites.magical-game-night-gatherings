import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse, compileScript } from "@vue/compiler-sfc";
import { createRenderer, h, nextTick, reactive, ref } from "vue";

// Compile the real SFC setup and mount it with Vue's real lifecycle. The renderer
// needs no DOM because these tests exercise editor guards, not dialog styling.
async function mountEditor(file, input, t) {
  const { descriptor } = parse(
    readFileSync(new URL(file, import.meta.url), "utf8"),
  );
  const source = compileScript(descriptor, { id: file }).content.replace(
    'from "vue"',
    `from ${JSON.stringify(import.meta.resolve("vue"))}`,
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
