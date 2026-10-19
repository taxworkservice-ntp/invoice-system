import { expect, test } from "@playwright/test";
import { api, signInAndGetSession, uid } from "./helpers/env";

/**
 * The quotation → delivery-note screen historically had no catalog-price
 * warning: that rule lived only in the deal form. `src/lib/documentLine.ts`
 * now owns it, and this spec guards the visible result inside the line editor.
 *
 * Skipped (not failed) when the workspace has the warning switched off
 * (`price_deviation_warn_pct = 0`), because that is a valid configuration.
 */
test.describe("delivery note from quotation — price warning", () => {
  test("warns when the typed price drifts from the catalog price", async ({ page }) => {
    const session = await signInAndGetSession();
    const client = await api();
    const userId = session.user.id;

    const { data: profile } = await client
      .from("client_profiles")
      .select("price_deviation_warn_pct")
      .eq("user_id", userId)
      .maybeSingle();
    const warnPct = profile?.price_deviation_warn_pct ?? 10;
    test.skip(warnPct === 0, "price-deviation warning is disabled in this workspace");

    const suffix = Date.now();
    const customerId = uid();
    const itemId = uid();
    const dealId = uid();
    const quotationId = uid();
    const lineId = uid();

    await client.from("customers").insert({
      id: customerId,
      user_id: userId,
      name: `E2E DN price ${suffix}`,
      is_active: true,
    });
    await client.from("items").insert({
      id: itemId,
      user_id: userId,
      name: `E2E Catalog ${suffix}`,
      item_type: "product",
      base_unit: "ชิ้น",
      unit_price: 100,
      is_active: true,
    });
    await client.from("deals").insert({
      id: dealId,
      user_id: userId,
      customer_id: customerId,
      title: `E2E DN price deal ${suffix}`,
      is_active: true,
    });
    await client.from("documents").insert({
      id: quotationId,
      user_id: userId,
      deal_id: dealId,
      customer_id: customerId,
      doc_type: "quotation",
      doc_number: `QT-E2E-${suffix}`,
      status: "sent",
      issue_date: new Date().toISOString().slice(0, 10),
      subtotal: 300,
      total_amount: 300,
      net_payable: 300,
    });
    await client.from("document_line_items").insert({
      id: lineId,
      document_id: quotationId,
      user_id: userId,
      item_id: itemId,
      item_name: `E2E Catalog ${suffix}`,
      item_type: "product",
      unit: "ชิ้น",
      unit_price: 100,
      quantity: 3,
      line_total: 300,
      sort_order: 0,
    });

    try {
      await page.goto(
        `/documents/new?type=delivery_note_from_quotation&quotationId=${quotationId}`,
      );

      // Step 1 lists the quotation line; tapping its name opens the line editor.
      await page.getByTitle("แก้ไขรายการ").first().click();

      const editor = page.locator("div.fixed.inset-0");
      const priceField = editor.getByLabel(/ราคา\/หน่วย/);
      await expect(priceField).toBeVisible();
      await priceField.fill("500"); // 5× the catalog price

      await expect(editor.getByText(/ต่างจากราคาแค็ตตาล็อก/)).toBeVisible();
    } finally {
      // Line items cascade with the document; the deal then loses its link.
      await client.from("documents").delete().eq("id", quotationId);
      await client.from("items").delete().eq("id", itemId);
      await client.from("deals").delete().eq("id", dealId);
      await client.from("customers").delete().eq("id", customerId);
    }
  });
});
