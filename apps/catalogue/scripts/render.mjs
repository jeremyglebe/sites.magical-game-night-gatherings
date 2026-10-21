export function metadata(pages) {
  return pages.map(({ path, title, description, section, source }) => ({
    path,
    title,
    description,
    section,
    source,
  }));
}
export function pageProps(page, pages, base) {
  const { text, ...visible } = page || {};
  return { page: page ? visible : null, pages: metadata(pages), base };
}
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
export function renderDocument(template, appHtml, props) {
  const title =
    props.page?.path === "/"
      ? "MTG Game Night"
      : `${props.page?.title || "Page not found"} · MTG Game Night`;
  const data = JSON.stringify(props)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  return template
    .replace("<title>MTG Game Night</title>", `<title>${escape(title)}</title>`)
    .replace(
      "<!--page-head-->",
      `<meta name="description" content="${escape(props.page?.description || "Magic: The Gathering format rules, variants and personal boxed sets.")}">`,
    )
    .replace("<!--app-html-->", appHtml)
    .replace(
      "<!--page-data-->",
      `<script id="catalogue-data" type="application/json">${data}</script>`,
    );
}
