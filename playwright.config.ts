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
    {
      // Wide-monitor baselines for the pages where the content container and
      // the row caps actually bind (see DESIGN-SYSTEM.md §6). A 1280 viewport
      // can never catch a width regression, so these exist to guard it.
      name: "visual-wide",
      dependencies: ["setup"],
      testMatch: /visual\.spec\.ts/,
      use: {
        storageState: "e2e/.auth/state.json",
        viewport: { width: 1920, height: 1080 },
        colorScheme: "light",
      },
      expect: {
        toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixels: 250 },
      },
    },
    {
      // Narrow-viewport baselines: guards the mobile shell (bottom nav, tab
      // rows, sticky save bars) which the 1280 desktop projects never render.
      // Generate/refresh with `npm run test:ui-snapshots:mobile:update`.
      name: "visual-mobile",
      dependencies: ["setup"],
      testMatch: /visual\.mobile\.spec\.ts/,
      use: {
        storageState: "e2e/.auth/state.json",
        viewport: { width: 390, height: 844 },
        colorScheme: "light",
        isMobile: true,
        hasTouch: true,
      },
      expect: {
        toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixels: 250 },
      },
    },
  ],
});
