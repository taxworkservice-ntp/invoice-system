import { test, expect } from "@playwright/test";

/**
 * Design-system visual baselines.
 *
 * Guards the typography/colour/radius/elevation rules in DESIGN-SYSTEM.md
 * against drift. Baselines are generated against the seeded test workspace, so
 * refresh them with `npm run test:ui-snapshots:update` after an intentional
 * visual change.
 */
const PAGES: { name: string; path: string }[] = [
  { name: "home", path: "/home" },
  { name: "documents", path: "/documents" },
  { name: "documents-overdue", path: "/documents?preset=overdue" },
  { name: "customers", path: "/customers" },
  { name: "deals", path: "/deals" },
  { name: "payroll", path: "/payroll" },
  { name: "wht", path: "/wht" },
  { name: "settings-documents", path: "/settings/documents" },
];

for (const { name, path } of PAGES) {
  test(`visual: ${name}`, async ({ page }) => {
    await page.goto(path);
    // The shell heading renders once the route + auth are resolved.
    await expect(page.locator("h1, h2").first()).toBeVisible();
    // Let fonts, skeletons and data settle before capturing.
    await page.waitForTimeout(800);
    await expect(page).toHaveScreenshot(`${name}.png`);
  });
}
