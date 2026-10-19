import { expect, test } from "@playwright/test";
import { api, signInAndGetSession, uid } from "./helpers/env";

/**
 * "เคยขาย… ใช้ราคานี้" — the last-price hint under a line's price field.
 *
 * Two rules this guards:
 *  - the hint is a box with a real button (not a bare text link), and
 *  - pressing it asks before replacing the price that is already in the field.
 */
test.describe("line editor — last-price hint", () => {
  test("asks before replacing the price with the price sold before", async ({ page }) => {
    const session = await signInAndGetSession();
    const client = await api();
    const userId = session.user.id;

    const suffix = Date.now();
    const customerId = uid();
    const itemId = uid();
    const pastDocId = uid();
    const itemName = `E2E Hint Item ${suffix}`;

    await client.from("customers").insert({
      id: customerId,
      user_id: userId,
      name: `E2E Hint Cust ${suffix}`,
      is_active: true,
    });
    await client.from("items").insert({
      id: itemId,
      user_id: userId,
      name: itemName,
      item_type: "product",
      base_unit: "ชิ้น",
      unit_price: 100,
      stock_count: 50,
      is_active: true,
    });
    // A past sale to THIS customer at a different price — that's what the hint
    // offers, and what the confirm has to protect (current price is 100).
    await client.from("documents").insert({
      id: pastDocId,
      user_id: userId,
      customer_id: customerId,
      doc_type: "quotation",
      doc_number: `QT-HINT-${suffix}`,
      status: "sent",
      issue_date: new Date().toISOString().slice(0, 10),
      subtotal: 20,
      total_amount: 20,
      net_payable: 20,
    });
    await client.from("document_line_items").insert({
      document_id: pastDocId,
      user_id: userId,
      item_id: itemId,
      item_name: itemName,
      item_type: "product",
      unit: "ชิ้น",
      unit_price: 4,
      quantity: 5,
      base_quantity: 5,
      discount_percent: 0,
      discount_amount: 0,
      line_total: 20,
      sort_order: 0,
    });

    try {
      await page.goto(`/deals/new?type=quotation&customer_id=${customerId}`);
      await page.getByRole("button", { name: "วันนี้" }).click().catch(() => {});

      await page.getByRole("button", { name: "เพิ่มสินค้าหรือบริการ" }).click();
      const editor = page.locator("div.fixed.inset-0");
      const itemInput = editor.getByPlaceholder(/พิมพ์ชื่อสินค้าหรือบริการ/);
      await itemInput.fill(itemName);
      await page.getByRole("listitem").filter({ hasText: itemName }).first().click();

      // Catalog price arrives; the hint offers the past price.
      const price = editor.getByLabel(/ราคา\/หน่วย/);
      await expect(price).toHaveValue("100.00");
      await expect(editor.getByText(/เคยขายลูกค้านี้ ฿4\.00/)).toBeVisible();

      // It is a button inside the hint box, and it asks first.
      await editor.getByRole("button", { name: "ใช้ราคานี้" }).click();
      const confirm = page.getByRole("dialog", { name: "ใช้ราคานี้?" });
      await expect(confirm).toBeVisible();
      await expect(confirm.getByText(/แทนที่ราคาปัจจุบัน ฿100\.00/)).toBeVisible();

      // Cancel changes nothing.
      await confirm.getByRole("button", { name: "ยกเลิก" }).click();
      await expect(confirm).toHaveCount(0);
      await expect(price).toHaveValue("100.00");

      // Confirming applies the past price.
      await editor.getByRole("button", { name: "ใช้ราคานี้" }).click();
      await confirm.getByRole("button", { name: "ใช้ราคานี้" }).click();
      await expect(price).toHaveValue("4.00");
      // Once it is the price in use, the hint says so and offers no button.
      await expect(editor.getByText(/ใช้ราคานี้อยู่/)).toBeVisible();
    } finally {
      await client.from("document_line_items").delete().eq("document_id", pastDocId);
      await client.from("documents").delete().eq("id", pastDocId);
      await client.from("items").delete().eq("id", itemId);
      await client.from("customers").delete().eq("id", customerId);
    }
  });
});
