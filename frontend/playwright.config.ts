import { defineConfig } from "@playwright/test";

const API_PORT = process.env.API_PORT || "8001";
const DEV_PORT = process.env.DEV_PORT || "5181";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  use: {
    baseURL: `http://localhost:${DEV_PORT}`,
    headless: true,
  },
  webServer: [
    {
      command: `cd ../backend && PYTHONPATH='' .venv/bin/uvicorn app.main:app --port ${API_PORT}`,
      port: Number(API_PORT),
      timeout: 30000,
      reuseExistingServer: true,
    },
    {
      command: `API_PORT=${API_PORT} npx vite --port ${DEV_PORT}`,
      port: Number(DEV_PORT),
      timeout: 30000,
      reuseExistingServer: true,
    },
  ],
});
