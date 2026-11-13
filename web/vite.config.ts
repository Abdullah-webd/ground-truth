import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const backend = process.env.GT_API ?? "http://127.0.0.1:8765";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  define: { CESIUM_BASE_URL: JSON.stringify("/cesium") },
  server: {
    port: 5179,
    strictPort: true,
    proxy: { "/api": backend, "/static": backend },
  },
  preview: {
    port: 4179,
    proxy: { "/api": backend, "/static": backend },
  },
  build: { chunkSizeWarningLimit: 6000 },
});
