import { preview } from "vite";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { normalizeBase } from "../content/catalogue.mjs";

const app = resolve(import.meta.dirname, "..");
let base;
try {
  const html = await readFile(join(app, "dist/index.html"), "utf8");
  const match = html.match(
    /<script id="catalogue-data" type="application\/json">(.*?)<\/script>/s,
  );
  base = normalizeBase(JSON.parse(match?.[1]).base);
} catch {
  throw new Error("No valid catalogue build found. Run npm run build first.");
}
const server = await preview({
  configFile: join(app, "vite.config.mjs"),
  base,
});
server.printUrls();
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => server.httpServer.close());
