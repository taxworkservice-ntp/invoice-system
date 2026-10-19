import { expect, test } from "@playwright/test";

/**
 * Form width regression.
 *
 * The deal form is a two-column grid (guide rail + content). The content column
 * must stay pinned to column 2 — otherwise, in modes without a rail (quotation,
 * invoice), it lands in the shrink-to-fit `auto` column and the whole form
 * collapses to ~570px on a wide monitor.
 */
const MODES = [
  { type: "quotation", rail: true },
  { type: "invoice", rail: true },
  { type: "utility_bill", rail: true },
  { type: "delivery_note", rail: true },
];

test.describe("deal form — desktop width", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const { type, rail } of MODES) {
    test(`${type}: content column fills the page`, async ({ page }) => {
      await page.goto(`/deals/new?type=${type}`);

      const card = page.locator("#deal-customer");
      await expect(card).toBeVisible();

      const box = await card.boundingBox();
      const viewport = page.viewportSize();
      expect(box).not.toBeNull();
      expect(viewport).not.toBeNull();

      // Well beyond the collapsed width (~570px became ~40% of 1440).
      const ratio = (box!.width + box!.x) / viewport!.width;
      expect(ratio, `${type} form spans the page`).toBeGreaterThan(0.7);

      const stepRail = page.getByRole("navigation", { name: "ขั้นตอน" });
      if (rail) {
        await expect(stepRail).toBeVisible();
      } else {
        await expect(stepRail).toHaveCount(0);
      }
    });
  }
});
