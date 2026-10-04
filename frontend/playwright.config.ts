import { defineConfig, devices } from "@playwright/test";
import { E2E_PORT } from "./tests/global-setup";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  globalSetup: "./tests/global-setup.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://127.0.0.1:${E2E_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
