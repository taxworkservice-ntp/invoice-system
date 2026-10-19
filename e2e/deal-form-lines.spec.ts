import { expect, test } from "@playwright/test";
import { api, signInAndGetSession, uid } from "./helpers/env";

/**
 * Line editing on the deal form itself.
 *
 * The in-repo deal-form journeys (`deal-quotation`, `delivery-partial`, …) need
 * a service-role key that is absent in this checkout, so the form had no
 * runnable guard. Stage 3 changes how those rows are rendered, so this spec
 * locks the current behaviour first: add a catalog line, set quantity and
 * price, save, and read the stored document back.
 */
test.describe("deal form — line editing", () => {
  test("saves a quotation line with the typed quantity and price", async ({ page }) => {
    const session = await signInAndGetSession();
    const client = await api();
    const userId = session.user.id;

    const suffix = Date.now();
    const customerId = uid();
    const itemId = uid();
    const itemName = `E2E Deal Line ${suffix}`;

    await client.from("customers").insert({
      id: customerId,
      user_id: userId,
      name: `E2E Deal Line Cust ${suffix}`,
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

    let dealId: string | null = null;

    try {
      await page.goto(`/deals/new?type=quotation&customer_id=${customerId}`);

      // Customer arrives pre-picked from the URL.
      await expect(page.getByText(`E2E Deal Line Cust ${suffix}`).first()).toBeVisible();

      // The form deliberately ships with no default issue date.
      await page.getByRole("button", { name: "วันนี้" }).click();

      await page.getByRole("button", { name: "เพิ่มสินค้าหรือบริการ" }).click();

      // Rows are read-only; a tap opens the shared line editor.
      const editor = page.locator("div.fixed.inset-0");
      await expect(editor.getByRole("heading", { name: "เพิ่มรายการ" })).toBeVisible();

      const itemInput = editor.getByPlaceholder(/พิมพ์ชื่อสินค้าหรือบริการ/);
      await itemInput.fill(itemName);
      await page.getByRole("listitem").filter({ hasText: itemName }).first().click();

      await editor.getByLabel("จำนวนส่ง").fill("2");
      await editor.getByLabel(/ราคา\/หน่วย/).fill("100");
      await editor.getByRole("button", { name: "บันทึก", exact: true }).click();
      await expect(editor).toHaveCount(0);

      // The row now mirrors what will print.
      await expect(page.getByText(itemName).first()).toBeVisible();
      await expect(page.getByText("฿200.00").first()).toBeVisible();

      await page.getByRole("button", { name: "ตรวจสอบและบันทึก" }).click();
      const confirm = page.locator("div.fixed.inset-0").filter({
        has: page.getByRole("heading", { name: "ยืนยันการบันทึก" }),
      });
      await confirm.getByRole("button", { name: "บันทึก", exact: true }).click();

      await page.waitForURL(
        /\/deals\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      );
      dealId = page.url().split("/deals/")[1].split(/[?#]/)[0];

      const { data: doc } = await client
        .from("documents")
        .select("id, doc_type, subtotal, vat_amount, total_amount")
        .eq("deal_id", dealId)
        .eq("doc_type", "quotation")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      expect(doc).toBeTruthy();

      const { data: lines } = await client
        .from("document_line_items")
        .select("item_id, item_name, unit, quantity, unit_price, base_quantity, line_total")
        .eq("document_id", doc!.id);

      expect(lines).toHaveLength(1);
      expect(lines![0]).toMatchObject({
        item_id: itemId,
        item_name: itemName,
        unit: "ชิ้น",
        quantity: 2,
        base_quantity: 2,
      });
      expect(Number(lines![0].unit_price)).toBe(100);
      expect(Number(lines![0].line_total)).toBe(200);
      expect(Number(doc!.subtotal)).toBe(200);
      expect(Number(doc!.total_amount)).toBe(200 + Number(doc!.vat_amount));
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
