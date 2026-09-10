import { defineConfig, devices } from "@playwright/test";
import process from "node:process";

const baseURL = process.env.PLAYWRIGHT_EXTERNAL_BASE_URL;
if (!baseURL) {
  throw new Error("PLAYWRIGHT_EXTERNAL_BASE_URL is required");
}

export default defineConfig({
  testDir: "../tests/e2e",
  testMatch: "mvp.spec.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "line",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "production-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
