import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const API_PORT = process.env.API_PORT || "8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": `http://localhost:${API_PORT}`,
      "/ws": {
        target: `ws://localhost:${API_PORT}`,
        ws: true,
      },
      "/audio": `http://localhost:${API_PORT}`,
    },
  },
});
