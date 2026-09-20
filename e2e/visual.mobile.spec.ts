import { test, expect } from "@playwright/test";

/**
 * Mobile (390×844) visual baselines for the settings shell.
 *
 * The desktop `visual` projects run at 1280/1920 and never render the mobile
 * chrome (bottom nav, bleed-scroll tab row, sticky save bars), so those widths
 * cannot catch a narrow-viewport regression. These baselines guard exactly
 * that. Refresh with `npm run test:ui-snapshots:mobile:update` after an
 * intentional mobile change.
 */
const PAGES: { name: string; path: string }[] = [
  { name: "home", path: "/home" },
  { name: "documents", path: "/documents" },
  { name: "catalog", path: "/catalog" },
  { name: "wht", path: "/wht" },
  { name: "reports", path: "/reports" },
  { name: "download-center", path: "/download-center" },
  { name: "settings-company", path: "/settings/company" },
  { name: "settings-documents", path: "/settings/documents" },
  { name: "settings-tax", path: "/settings/tax" },
  { name: "settings-numbering", path: "/settings/numbering" },
  { name: "settings-stock", path: "/settings/stock" },
  { name: "settings-account", path: "/settings/account" },
];

for (const { name, path } of PAGES) {
  test(`mobile: ${name}`, async ({ page }) => {
    await page.goto(path);
    // The mobile top-bar heading renders once the route + auth are resolved.
    await expect(page.locator("header h1").first()).toBeVisible();
    // Let fonts, skeletons and data settle before capturing.
    await page.waitForTimeout(800);
    await expect(page).toHaveScreenshot(`${name}.png`);
  });
}
