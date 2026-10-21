import test from "node:test";
import assert from "node:assert/strict";
import { metadata, pageProps, renderDocument } from "./render.mjs";
import { searchPages } from "../client/src/components/search.mjs";
import { href, navigation } from "../client/src/navigation.js";
import { compileCatalogue } from "../content/catalogue.mjs";
import { fileURLToPath } from "node:url";

const pages = [
  {
    path: "/formats/horde/",
    title: "Horde",
    section: "Formats",
    text: "Choose a version. Survivors win together.",
    headings: [{ level: 2, id: "victory", text: "Victory" }],
  },
  {
    path: "/sources/",
    title: "Sources",
    section: "Sources",
    text: "Original Horde rules. Survivors win together.",
    headings: [],
  },
];
test("search ranks titles, matches full text and scopes results without discarding rules", () => {
  assert.deepEqual(
    searchPages(pages, "horde").map((p) => p.path),
    ["/formats/horde/", "/sources/"],
  );
  assert.equal(searchPages(pages, "SURVIVORS win", "Formats").length, 1);
  assert.equal(searchPages(pages, "survivors missing").length, 0);
  assert.equal(searchPages(pages, "  ").length, 0);
  assert.equal(
    searchPages(
      [{ ...pages[0], text: "Victory means surviving." }],
      "victory",
    )[0].anchor,
    "victory",
  );
  assert.match(searchPages(pages, "win")[0].snippet, /Survivors win/);
});
test("document rendering safely embeds metadata and hydration JSON while preserving full article HTML", () => {
  const page = {
    ...pages[0],
    title: "A & B <rules>",
    description: 'A "quote" <tag>',
    html: "<h1>Full rules</h1><p>All procedures</p>",
    source: "formats/horde/index.md",
    frontmatter: { note: "</script><script>bad</script>" },
  };
  const props = pageProps(page, [page], "/catalogue/");
  const template =
    "<title>MTG Game Night</title><!--page-head--><main><!--app-html--></main><!--page-data-->";
  const html = renderDocument(template, page.html, props);
  assert.match(html, /<title>A &amp; B &lt;rules&gt;/);
  assert.match(html, /content="A &quot;quote&quot; &lt;tag&gt;"/);
  assert.ok(html.includes(page.html));
  assert.equal((html.match(/<script/g) || []).length, 1);
  const data = JSON.parse(
    html.match(/type="application\/json">(.*?)<\/script>/s)[1],
  );
  assert.equal(data.page.frontmatter.note, page.frontmatter.note);
  assert.equal(data.base, "/catalogue/");
  assert.equal(data.page.text, undefined);
  assert.equal(data.pages[0].html, undefined);
  assert.equal(metadata([page])[0].source, page.source);
  assert.match(
    renderDocument(template, "<h1>Missing</h1>", pageProps(null, [page], "/")),
    /Page not found/,
  );
});
test("all navigation destinations resolve to existing source pages under root and GitHub Pages bases", async () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const compiled = await compileCatalogue({ root });
  const paths = new Set(compiled.pages.map((page) => page.path));
  for (const group of navigation)
    for (const item of group.items) {
      assert.ok(
        paths.has(href("/", item.link)),
        `Missing page for ${item.link}`,
      );
      assert.equal(
        href("/catalogue/", item.link),
        "/catalogue" + href("/", item.link),
      );
    }
});
