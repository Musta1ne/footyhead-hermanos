import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "/",
  plugins: [react()],
  server: {
    host: "127.0.0.1", port: 8080,
    proxy: {
      "/api": "http://127.0.0.1:2567",
      "/matchmake": "http://127.0.0.1:2567",
      "^/(?!src|assets|node_modules|@|play)([^/]+)/([^/]+)$": {
        target: "http://127.0.0.1:2567", ws: true,
      },
    },
  },
});
