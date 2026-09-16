import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "journeys",
      dependencies: ["setup"],
      use: { storageState: "e2e/.auth/state.json" },
      testIgnore: [/auth\.setup\.ts/, /visual\.spec\.ts/],
    },
    {
      // Design-system visual baselines. Generate/refresh with
      // `npm run test:ui-snapshots:update`.
      name: "visual",
      dependencies: ["setup"],
      testMatch: /visual\.spec\.ts/,
      use: {
        storageState: "e2e/.auth/state.json",
        viewport: { width: 1280, height: 900 },
        colorScheme: "light",
      },
      expect: {
        toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixels: 250 },
      },
    },
  ],
});
