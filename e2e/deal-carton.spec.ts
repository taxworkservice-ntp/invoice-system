import { expect, test } from "@playwright/test";
import { api, signInAndGetSession, uid } from "./helpers/env";

/**
 * Carton control on the deal form's delivery note.
 *
 * The markup moved to the shared `LineUnitControl` (it used to be an inline
 * block duplicated from the quotation delivery note). This keeps that row
 * rendering and switching units after the change.
 */
test.describe("deal form — carton line", () => {
  test("shows the carton control for a catalog item sold in cartons", async ({ page }) => {
    const session = await signInAndGetSession();
    const client = await api();
    const userId = session.user.id;

    const suffix = Date.now();
    const customerId = uid();
    const itemId = uid();
    const itemName = `E2E Deal Carton ${suffix}`;

    await client.from("customers").insert({
      id: customerId,
      user_id: userId,
      name: `E2E Deal Carton Cust ${suffix}`,
      is_active: true,
    });
    await client.from("items").insert({
      id: itemId,
      user_id: userId,
      name: itemName,
      item_type: "product",
      base_unit: "ชิ้น",
      carton_unit: "ลัง",
      qty_per_carton: 12,
      unit_price: 10,
      stock_count: 60,
      is_active: true,
    });

    try {
      await page.goto(`/deals/new?type=delivery_note&customer_id=${customerId}`);

      await page.getByRole("button", { name: "เพิ่มสินค้าหรือบริการ" }).click();
      const editor = page.locator("div.fixed.inset-0");
      const itemInput = editor.getByPlaceholder(/พิมพ์ชื่อสินค้าหรือบริการ/);
      await itemInput.fill(itemName);
      // Pick the catalog item (not a free-text line) — that is what carries
      // the carton option.
      await page.getByRole("listitem").filter({ hasText: itemName }).first().click();

      await expect(editor.getByText("1 ลัง = 12 ชิ้น")).toBeVisible();
      await expect(editor.getByText(/คงเหลือ 5 ลัง/)).toBeVisible();

      await editor.getByRole("button", { name: "ขายเป็น ลัง" }).click();
      await editor.getByLabel("จำนวนส่ง").fill("1");
      await expect(editor.getByText(/ตัดสต็อกเป็น 12 ชิ้น/)).toBeVisible();
      await expect(editor.getByRole("button", { name: "ขายเป็น ลัง" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    } finally {
      await client.from("items").delete().eq("id", itemId);
      await client.from("customers").delete().eq("id", customerId);
    }
  });
});
