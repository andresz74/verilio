import { defineConfig, devices } from "@playwright/test";

import { E2E_OWNER_ID } from "./tests/e2e/global-cleanup.js";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @verilio/api dev",
      env: {
        API_PORT: "3100",
        DATABASE_URL:
          process.env.DATABASE_URL ??
          "postgresql://verilio:verilio@127.0.0.1:5432/verilio",
        LOCAL_USER_ID: E2E_OWNER_ID,
      },
      reuseExistingServer: false,
      url: "http://127.0.0.1:3100/health/ready",
    },
    {
      command: "pnpm --filter @verilio/web dev --host 127.0.0.1 --port 4173",
      env: {
        VITE_API_TARGET: "http://127.0.0.1:3100",
      },
      reuseExistingServer: false,
      url: "http://127.0.0.1:4173",
    },
  ],
});
