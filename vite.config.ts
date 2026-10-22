import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Freebuff injects PORT for isolated workspaces; fall back to the Vite default locally.
const port = Number(process.env.PORT) || 5173;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "0.0.0.0",
    port,
    strictPort: true,
    // Freebuff previews are served through a proxy: keep HMR off so the
    // preview never depends on a websocket upgrade.
    hmr: false,
  },
  preview: {
    host: "0.0.0.0",
    port,
  },
  build: {
    outDir: "dist",
  },
});
