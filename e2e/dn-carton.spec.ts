import { expect, test } from "@playwright/test";
import { api, signInAndGetSession, uid } from "./helpers/env";

/**
 * Cartons on a delivery note created from a quotation.
 *
 * Agreed rule: the printed document shows cartons, stock moves in pieces.
 * This spec proves the whole path — the unit switch in the line editor, then
 * what actually lands in `document_line_items` after saving.
 */
test.describe("delivery note from quotation — sell by carton", () => {
  test("stores cartons for the paper and pieces for stock", async ({ page }) => {
    const session = await signInAndGetSession();
    const client = await api();
    const userId = session.user.id;

    const suffix = Date.now();
    const customerId = uid();
    const itemId = uid();
    const dealId = uid();
    const quotationId = uid();

    await client.from("customers").insert({
      id: customerId,
      user_id: userId,
      name: `E2E Carton ${suffix}`,
      is_active: true,
    });
    await client.from("items").insert({
      id: itemId,
      user_id: userId,
      name: `E2E Carton Item ${suffix}`,
      item_type: "product",
      base_unit: "ชิ้น",
      carton_unit: "ลัง",
      qty_per_carton: 12,
      unit_price: 10,
      stock_count: 120,
      is_active: true,
    });
    await client.from("deals").insert({
      id: dealId,
      user_id: userId,
      customer_id: customerId,
      title: `E2E Carton deal ${suffix}`,
      is_active: true,
    });
    await client.from("documents").insert({
      id: quotationId,
      user_id: userId,
      deal_id: dealId,
      customer_id: customerId,
      doc_type: "quotation",
      doc_number: `QT-CARTON-${suffix}`,
      status: "sent",
      issue_date: new Date().toISOString().slice(0, 10),
      subtotal: 30,
      total_amount: 30,
      net_payable: 30,
    });
    await client.from("document_line_items").insert({
      document_id: quotationId,
      user_id: userId,
      item_id: itemId,
      item_name: `E2E Carton Item ${suffix}`,
      item_type: "product",
      unit: "ชิ้น",
      unit_price: 10,
      quantity: 3,
      base_quantity: 3,
      line_total: 30,
      sort_order: 0,
    });

    let deliveryNoteId: string | null = null;

    try {
      await page.goto(
        `/documents/new?type=delivery_note_from_quotation&quotationId=${quotationId}`,
      );

      // --- line editor: switch the line to sell by the carton ----
      await page.getByTitle("แก้ไขรายการ").first().click();
      const editor = page.locator("div.fixed.inset-0");
      await expect(editor.getByText("แก้ไขรายการ")).toBeVisible();

      // Price history is reachable here too — it no longer hides behind the
      // delivery-note price-review control.
      await expect(
        editor.getByRole("button", { name: "ประวัติราคาขาย" }),
      ).toBeVisible();

      await editor.getByRole("button", { name: "ขายเป็น ลัง" }).click();
      await expect(editor.getByText("1 ลัง = 12 ชิ้น")).toBeVisible();

      // Delivering one carton; price re-priced from the catalog (10 × 12).
      await editor.getByLabel("จำนวนส่ง").fill("1");
      await expect(editor.getByText(/ตัดสต็อกเป็น 12 ชิ้น/)).toBeVisible();
      await expect(editor.getByText(/คงเหลือ 10 ลัง/)).toBeVisible();
      await expect(editor.getByLabel(/ราคา\/หน่วย/)).toHaveValue("120.00");

      // Workspaces with mandatory price review need the explicit confirm.
      const confirm = editor.getByRole("button", { name: /ยืนยันราคา/ });
      if (await confirm.count()) await confirm.first().click();
      await editor.getByRole("button", { name: "บันทึก", exact: true }).click();

      // --- required steps: delivery date, then the print mode ----
      await page.getByPlaceholder("dd/mm/yyyy").fill("18/10/2026");
      await page.getByText("แสดงจำนวนเงิน", { exact: true }).click();

      const save = page.getByRole("button", { name: "สร้างใบส่งของฉบับร่าง" });
      await expect(save).toBeEnabled();
      await save.click();

      await expect(page.getByText(/สร้างใบส่งของจากใบเสนอราคาแล้ว/)).toBeVisible();

      // --- what was actually stored ---
      const { data: note } = await client
        .from("documents")
        .select("id")
        .eq("customer_id", customerId)
        .eq("doc_type", "delivery_note")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      deliveryNoteId = note?.id ?? null;
      expect(deliveryNoteId).toBeTruthy();

      const { data: lines } = await client
        .from("document_line_items")
        .select("unit, quantity, base_quantity, qty_carton, carton_unit, unit_price")
        .eq("document_id", deliveryNoteId as string);

      expect(lines).toHaveLength(1);
      expect(lines?.[0]).toMatchObject({
        unit: "ลัง", // paper shows cartons
        quantity: 1,
        base_quantity: 12, // stock moves in pieces
        qty_carton: 1,
        carton_unit: "ลัง",
      });
      expect(Number(lines?.[0]?.unit_price)).toBe(120);
    } finally {
      if (deliveryNoteId) await client.from("documents").delete().eq("id", deliveryNoteId);
      await client.from("documents").delete().eq("id", quotationId);
      await client.from("items").delete().eq("id", itemId);
      await client.from("deals").delete().eq("id", dealId);
      await client.from("customers").delete().eq("id", customerId);
    }
  });
});
