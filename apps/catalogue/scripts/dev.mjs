import { createServer as createViteServer } from "vite";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, join, extname } from "node:path";
import { compileCatalogue, normalizeBase } from "../content/catalogue.mjs";
import { pageProps, renderDocument } from "./render.mjs";
const app = resolve(import.meta.dirname, "..");
const root = resolve(app, "../..");
const base = normalizeBase(process.env.CATALOGUE_BASE || "/");
const vite = await createViteServer({
  configFile: join(app, "vite.config.mjs"),
  server: { middlewareMode: true },
  appType: "custom",
});
let pending;
function content() {
  return (pending ||= compileCatalogue({ root, base }).catch((error) => {
    pending = null;
    throw error;
  }));
}
vite.watcher.add(
  [
    "index.md",
    "formats",
    "boxed-sets",
    "rules",
    "research",
    "sources",
    "apps/catalogue/content/partials",
  ].map((p) => join(root, p)),
);
vite.watcher.on("all", (_, file) => {
  if (file.endsWith(".md")) {
    pending = null;
    vite.ws.send({ type: "full-reload" });
  }
});
const mime = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".csv": "text/csv; charset=utf-8",
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURI(
      new URL(request.url, "http://localhost").pathname,
    );
    const path = pathname.startsWith(base)
      ? "/" + pathname.slice(base.length)
      : pathname;
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405);
      return response.end();
    }
    if (path === "/search-index.json") {
      const { pages } = await content();
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      return response.end(
        JSON.stringify(
          pages.map(({ path, title, section, text, headings }) => ({
            path,
            title,
            section,
            text,
            headings,
          })),
        ),
      );
    }
    if (
      (!extname(path) || path.endsWith(".html")) &&
      !/^\/(?:@|src\/|node_modules\/)/.test(path)
    ) {
      const { pages } = await content();
      const canonical =
        path === "/index.html"
          ? "/"
          : path.endsWith("/index.html")
            ? path.slice(0, -10)
            : path;
      const page = pages.find(
        (p) =>
          p.path === canonical ||
          p.path === canonical + "/" ||
          p.path === canonical + ".html",
      );
      const props = pageProps(page, pages, base);
      const { render } = await vite.ssrLoadModule("/src/entry-server.js");
      const template = await vite.transformIndexHtml(
        request.url,
        await readFile(join(app, "client/index.html"), "utf8"),
      );
      response.writeHead(page ? 200 : 404, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      return response.end(renderDocument(template, await render(props), props));
    }
    const { assets } = await content();
    if (assets.includes(path.slice(1))) {
      response.writeHead(200, {
        "Content-Type": mime[extname(path)] || "application/octet-stream",
      });
      return response.end(await readFile(join(root, path.slice(1))));
    }
    vite.middlewares(request, response, () => {
      response.writeHead(404);
      response.end("Not found");
    });
  } catch (error) {
    vite.ssrFixStacktrace(error);
    console.error(error);
    response.writeHead(500);
    response.end("Catalogue could not render. See the development terminal.");
  }
});
const port = Number(process.env.PORT || 5173);
server.listen(port, "127.0.0.1", () =>
  console.log(`Catalogue: http://127.0.0.1:${port}${base}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    server.close();
    await vite.close();
    process.exit(0);
  });
