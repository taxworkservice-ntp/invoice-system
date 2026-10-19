import { expect, test } from "@playwright/test";
import { api, signInAndGetSession, uid } from "./helpers/env";

/**
 * Comma grouping in numeric fields.
 *
 * Money and quantities group while typing (`5000` → `5,000`), the caret stays
 * where the officer is typing, and the stored value is the plain number.
 * Identifiers (tax ID, PO number, phone) are deliberately NOT grouped.
 */
test.describe("numeric inputs — comma grouping", () => {
  test("groups money while typing and stores the plain number", async ({ page }) => {
    const session = await signInAndGetSession();
    const client = await api();
    const userId = session.user.id;

    const suffix = Date.now();
    const customerId = uid();
    const itemId = uid();
    const itemName = `E2E Comma ${suffix}`;

    await client.from("customers").insert({
      id: customerId,
      user_id: userId,
      name: `E2E Comma Cust ${suffix}`,
      is_active: true,
    });
    await client.from("items").insert({
      id: itemId,
      user_id: userId,
      name: itemName,
      item_type: "product",
      base_unit: "ชิ้น",
      unit_price: 5000,
      stock_count: 10,
      is_active: true,
    });

    let dealId: string | null = null;

    try {
      await page.goto(`/deals/new?type=quotation&customer_id=${customerId}`);
      await page.getByRole("button", { name: "วันนี้" }).click();

      await page.getByRole("button", { name: "เพิ่มสินค้าหรือบริการ" }).click();
      const editor = page.locator("div.fixed.inset-0");
      const itemInput = editor.getByPlaceholder(/พิมพ์ชื่อสินค้าหรือบริการ/);
      await itemInput.fill(itemName);
      await page.getByRole("listitem").filter({ hasText: itemName }).first().click();

      const price = editor.getByLabel(/ราคา\/หน่วย/);
      const quantity = editor.getByLabel("จำนวนส่ง");

      // Catalog price arrives grouped, and stays grouped when retyped.
      await expect(price).toHaveValue("5,000.00");
      await price.fill("12345");
      await expect(price).toHaveValue("12,345");

      // Regression: typing past a group boundary must not flip the comma to a
      // decimal (60000 used to collapse to "6.00").
      await price.fill("");
      await price.pressSequentially("60000");
      await expect(price).toHaveValue("60,000");

      // Regression: a typed decimal point must stay put (it used to be pushed
      // to the end, so "0.35" became "035.").
      await price.fill("");
      await price.pressSequentially("0.35");
      await expect(price).toHaveValue("0.35");
      await price.fill("");
      await price.pressSequentially("12.75");
      await expect(price).toHaveValue("12.75");

      await price.fill("12345");
      await expect(price).toHaveValue("12,345");

      // Quantity allows three decimals and groups the integer part.
      await quantity.fill("1000.5");
      await expect(quantity).toHaveValue("1,000.5");
      await quantity.fill("");
      await quantity.pressSequentially("25.125");
      await expect(quantity).toHaveValue("25.125");
      await quantity.fill("1000.5");

      // Blur settles money to two decimals.
      await editor.getByRole("button", { name: "บันทึก", exact: true }).click();
      await expect(editor).toHaveCount(0);

      await page.getByRole("button", { name: "ตรวจสอบและบันทึก" }).click();
      const confirm = page.locator("div.fixed.inset-0").filter({
        has: page.getByRole("heading", { name: "ยืนยันการบันทึก" }),
      });
      await confirm.getByRole("button", { name: "บันทึก", exact: true }).click();
      await page.waitForURL(/\/deals\/[0-9a-f-]{36}/i);
      dealId = page.url().split("/deals/")[1].split(/[?#]/)[0];

      const { data: doc } = await client
        .from("documents")
        .select("id")
        .eq("deal_id", dealId)
        .eq("doc_type", "quotation")
        .limit(1)
        .single();

      const { data: lines } = await client
        .from("document_line_items")
        .select("quantity, unit_price")
        .eq("document_id", doc!.id);

      // Stored plainly — grouping is display only.
      expect(Number(lines![0].unit_price)).toBe(12345);
      expect(Number(lines![0].quantity)).toBe(1000.5);
    } finally {
      if (dealId) {
        await client.from("documents").delete().eq("deal_id", dealId);
        await client.from("deals").delete().eq("id", dealId);
      }
      await client.from("items").delete().eq("id", itemId);
      await client.from("customers").delete().eq("id", customerId);
    }
  });
});
