import { build } from "vite";
import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  compileCatalogue,
  pageOutputPath,
  normalizeBase,
} from "../content/catalogue.mjs";
import { pageProps, renderDocument } from "./render.mjs";
const app = resolve(import.meta.dirname, "..");
const root = resolve(app, "../..");
const base = normalizeBase(process.env.CATALOGUE_BASE || "/");
const configFile = join(app, "vite.config.mjs");
const dist = join(app, "dist");
const generated = join(app, ".generated");
const catalogue = await compileCatalogue({ root, base });
await build({ configFile, base });
await build({
  configFile,
  base,
  build: {
    ssr: join(app, "client/src/entry-server.js"),
    outDir: generated,
    emptyOutDir: true,
  },
});
const { render } = await import(
  pathToFileURL(join(generated, "entry-server.js"))
);
const template = await readFile(join(dist, "index.html"), "utf8");
for (const page of [...catalogue.pages, null]) {
  const props = pageProps(page, catalogue.pages, base);
  const output = join(dist, page ? pageOutputPath(page.path) : "404.html");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, renderDocument(template, await render(props), props));
}
for (const asset of catalogue.assets) {
  await mkdir(dirname(join(dist, asset)), { recursive: true });
  await cp(join(root, asset), join(dist, asset));
}
await writeFile(
  join(dist, "search-index.json"),
  JSON.stringify(
    catalogue.pages.map(({ path, title, section, text, headings }) => ({
      path,
      title,
      section,
      text,
      headings,
    })),
  ),
);
await writeFile(join(dist, ".nojekyll"), "");
await rm(generated, { recursive: true, force: true });
console.log(
  `Catalogue: ${catalogue.pages.length} complete pages, ${catalogue.assets.length} local assets. Base: ${base}`,
);
