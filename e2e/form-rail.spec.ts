import { expect, test } from "@playwright/test";

/**
 * The guide rail must behave the same on every deal-form mode.
 *
 * It used to exist only for delivery notes; quotation/invoice/utility showed a
 * non-clickable chip row instead. Now one step list drives the rail, the mobile
 * strip and the green "done" borders on every mode.
 */
test.describe("deal form — guide rail on every mode", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  const expected: { type: string; steps: string[] }[] = [
    { type: "quotation", steps: ["ลูกค้า", "วันที่", "รายการ"] },
    { type: "invoice", steps: ["ลูกค้า", "วันที่", "รายการ"] },
    { type: "utility_bill", steps: ["ลูกค้า", "รอบบิล", "รายการ"] },
    { type: "delivery_note", steps: ["ลูกค้า", "วันที่", "รายการ", "การพิมพ์"] },
  ];

  for (const { type, steps } of expected) {
    test(`${type}: rail lists its own steps and scrolls`, async ({ page }) => {
      await page.goto(`/deals/new?type=${type}`);

      const rail = page.getByRole("navigation", { name: "ขั้นตอน" });
      await expect(rail).toBeVisible();
      for (const label of steps) {
        await expect(rail.getByRole("button", { name: new RegExp(label) })).toBeVisible();
      }

      // Clicking the last step still takes the officer to that section.
      await page.evaluate(() => window.scrollTo(0, 0));
      await rail.getByRole("button", { name: new RegExp(steps[steps.length - 1]) }).click();
      await expect
        .poll(async () => page.evaluate(() => window.scrollY), { timeout: 5000 })
        .toBeGreaterThan(0);
    });
  }

  test("mobile shows the strip instead of the rail", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/deals/new?type=quotation");
    await expect(page.locator('[aria-label="ความคืบหน้า"]')).toBeVisible();
    await expect(page.getByRole("navigation", { name: "ขั้นตอน" })).toHaveCount(0);
  });
});
