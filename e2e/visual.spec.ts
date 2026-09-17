import { test, expect } from "@playwright/test";

/**
 * Design-system visual baselines.
 *
 * Guards the typography/colour/radius/elevation rules in DESIGN-SYSTEM.md
 * against drift. Baselines are generated against the seeded test workspace, so
 * refresh them with `npm run test:ui-snapshots:update` after an intentional
 * visual change.
 *
 * Runs twice: `visual` at 1280 (everything) and `visual-wide` at 1920, which
 * only covers the pages where the content container / row caps bind. Width
 * changes are invisible at 1280, so the wide project is the only thing that
 * can catch a container regression.
 */
const PAGES: { name: string; path: string; wide?: boolean }[] = [
  { name: "home", path: "/home", wide: true },
  { name: "documents", path: "/documents", wide: true },
  { name: "documents-overdue", path: "/documents?preset=overdue" },
  { name: "customers", path: "/customers" },
  { name: "deals", path: "/deals" },
  { name: "payroll", path: "/payroll" },
  { name: "wht", path: "/wht", wide: true },
  { name: "reports", path: "/reports", wide: true },
  { name: "settings-documents", path: "/settings/documents" },
];

for (const { name, path, wide = false } of PAGES) {
  test(`visual: ${name}`, async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "visual-wide" && !wide,
      "wide project only covers pages where the container binds",
    );
    await page.goto(path);
    // The shell heading renders once the route + auth are resolved.
    await expect(page.locator("h1, h2").first()).toBeVisible();
    // Let fonts, skeletons and data settle before capturing.
    await page.waitForTimeout(800);
    await expect(page).toHaveScreenshot(`${name}.png`);
  });
}
