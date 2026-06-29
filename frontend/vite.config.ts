/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;
const API_TARGET = process.env.VITE_API_PROXY ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || true,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  envPrefix: ["VITE_"],
  test: {
    environment: "happy-dom",
    globals: true,
  },
});
