import { normalizeBase } from "./content/catalogue.mjs";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL("./client", import.meta.url)),
  base: normalizeBase(process.env.CATALOGUE_BASE || "/"),
  plugins: [vue(), tailwindcss()],
  publicDir: false,
  build: { outDir: "../dist", emptyOutDir: true },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { host: "127.0.0.1", port: 5174, strictPort: true },
});
