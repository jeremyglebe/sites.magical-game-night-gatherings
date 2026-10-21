import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const backend = process.env.TABLETOP_API_URL || "http://127.0.0.1:5180";
const proxy = () => ({
  target: backend,
  changeOrigin: true,
  configure(server) {
    server.on("proxyReq", (request) => request.setHeader("origin", backend));
  },
});
export default defineConfig({
  root: fileURLToPath(new URL("./client", import.meta.url)),
  plugins: [vue(), tailwindcss()],
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    host: "127.0.0.1",
    port: 5183,
    strictPort: true,
    proxy: {
      "/api": proxy(),
      "/avatars": proxy(),
    },
  },
});
