import { expect, test, type Page } from "@playwright/test";
import { api } from "./helpers/env";

/**
 * The fields the journeys type into.
 *
 * The shared line editor (components/documents/LineItemEditorModal.tsx) moved
 * the name, the price and the quantity out of the grids and into a modal, and
 * the numeric fields became text fields with `inputMode="decimal"` (a
 * native number input cannot show the grouping the app uses). The specs that
 * need a service-role key cannot run everywhere, so this spec guards the
 * locators themselves: when a field moves again, it fails here first — with
 * a message that says where the field went.
 */

function modal(page: Page, heading: string) {
  return page.locator("div.fixed.inset-0").filter({
    has: page.getByRole("heading", { name: heading }),
  });
}

async function workspace() {
  const client = await api();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error("the test workspace client is not signed in");
  return { client, userId: user.id };
}

test.describe.serial("field locators · the fields the journeys type into", () => {
  const stamp = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const customerName = `Locator Cust ${stamp}`;
  let customerId: string;
  let dealId: string;
  let quotationId: string;
  let dnId: string;

  test.beforeAll(async () => {
    const { client, userId } = await workspace();
    customerId = crypto.randomUUID();
    dealId = crypto.randomUUID();
    await client.from("customers").insert({
      id: customerId,
      user_id: userId,
      name: customerName,
      is_active: true,
    });
    await client.from("deals").insert({
      id: dealId,
      user_id: userId,
      customer_id: customerId,
      title: "Locator Deal",
      is_active: true,
    });

    quotationId = crypto.randomUUID();
    await client.from("documents").insert({
      id: quotationId,
      user_id: userId,
      deal_id: dealId,
      customer_id: customerId,
      doc_type: "quotation",
      doc_number: `LOC-QT-${stamp}`,
      status: "sent",
      issue_date: today,
      subtotal: 500,
      total_amount: 500,
    });
    const { data: quoteLines } = await client
      .from("document_line_items")
      .insert({
        document_id: quotationId,
        user_id: userId,
        item_name: "Locator Goods",
        item_type: "product",
        unit: "ชิ้น",
        unit_price: 100,
        quantity: 5,
        base_quantity: 5,
        line_total: 500,
        sort_order: 0,
      })
      .select();

    dnId = crypto.randomUUID();
    await client.from("documents").insert({
      id: dnId,
      user_id: userId,
      deal_id: dealId,
      customer_id: customerId,
      doc_type: "delivery_note",
      doc_number: `LOC-DN-${stamp}`,
      status: "sent",
      issue_date: today,
      subtotal: 500,
      total_amount: 500,
    });
    await client.from("document_line_items").insert({
      document_id: dnId,
      user_id: userId,
      item_name: "Locator Goods",
      item_type: "product",
      unit: "ชิ้น",
      unit_price: 100,
      quantity: 5,
      base_quantity: 5,
      line_total: 500,
      sort_order: 0,
      source_document_id: quotationId,
      source_line_item_id: quoteLines![0].id,
    });

    await client.from("documents").insert({
      id: crypto.randomUUID(),
      user_id: userId,
      deal_id: dealId,
      customer_id: customerId,
      doc_type: "billing_note",
      doc_number: `LOC-BN-${stamp}`,
      status: "sent",
      issue_date: today,
      due_date: today,
      subtotal: 500,
      vat_amount: 35,
      total_amount: 535,
      net_payable: 535,
    });
  });

  test("the deal form: the name and the price live in the line editor", async ({ page }) => {
    await page.goto("/deals/new?type=quotation");
    await page.getByRole("button", { name: "เลือกลูกค้า" }).click();
    await page.getByPlaceholder("ค้นหาชื่อ รหัส หรือเลขผู้เสียภาษี").fill(customerName);
    await page.getByText(customerName).first().click();

    await page.getByRole("button", { name: "เพิ่มสินค้าหรือบริการ" }).click();
    const editor = modal(page, "เพิ่มรายการ");
    await expect(editor).toBeVisible();

    const name = editor.getByPlaceholder(/พิมพ์ชื่อสินค้าหรือบริการ/);
    await expect(name).toBeVisible();
    await name.fill(`Locator Item ${stamp}`);

    // The price caption is a <label> with a possible suffix, so the name is
    // matched as a substring.
    const price = editor.getByLabel(/ราคา\/หน่วย/);
    await expect(price).toBeVisible();
    await price.fill("150");

    await editor.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(editor).toBeHidden();
    await expect(page.getByText(`Locator Item ${stamp}`)).toBeVisible();
  });

  test("the delivery-note form: the quantity lives in the line editor", async ({ page }) => {
    await page.goto(`/documents/new?type=delivery_note_from_quotation&quotationId=${quotationId}`);
    await page.getByTitle("แก้ไขจำนวน").first().click();

    const editor = modal(page, "แก้ไขรายการ");
    await expect(editor).toBeVisible();
    const qty = editor.getByLabel("จำนวนส่ง");
    await qty.fill("4");
    await expect(qty).toHaveValue("4");
    await editor.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(editor).toBeHidden();
  });

  test("the invoice-from-DN grid: the quantity is a decimal text field", async ({ page }) => {
    await page.goto(`/documents/new?type=invoice_from_delivery_notes&dnId=${dnId}`);
    await page.getByRole("checkbox", { name: /โหมดอ้างอิง/ }).uncheck();

    const qty = page.locator('input[inputmode="decimal"]').first();
    await expect(qty).toBeVisible();
    await qty.fill("99");
    // The clamp lands on blur (the field keeps the typed text while focused).
    await qty.blur();
    // The field must not show a number the system will not bill.
    await expect(qty).toHaveValue("5");
  });

  test("the payment modal: the amount is a decimal text field", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    await page.getByRole("button", { name: "บันทึกรับเงิน" }).click();

    const payModal = modal(page, "บันทึกรับเงิน (ร่างใบเสร็จ)");
    await expect(payModal).toBeVisible();
    const amount = payModal.locator('input[inputmode="decimal"]').first();
    await expect(amount).toBeVisible();
    await expect(amount).not.toHaveValue("0", { timeout: 15_000 });
  });

  test.afterAll(async () => {
    const { client } = await workspace();
    const { data: docs } = await client.from("documents").select("id").eq("deal_id", dealId);
    const ids = (docs || []).map((d: any) => d.id);
    if (ids.length) {
      for (const [table, column] of [
        ["invoice_delivery_notes", "invoice_id"],
        ["invoice_delivery_notes", "delivery_note_id"],
        ["billing_note_invoices", "invoice_id"],
        ["billing_note_invoices", "billing_note_id"],
        ["receipt_invoices", "invoice_id"],
        ["receipt_invoices", "receipt_id"],
        ["document_line_items", "document_id"],
        ["stock_movements", "document_id"],
      ] as const) {
        await client
          .from(table)
          .delete()
          .in(column as string, ids as string[]);
      }
      await client.from("documents").delete().in("id", ids);
    }
    await client.from("deals").delete().eq("id", dealId);
    await client.from("customers").delete().eq("id", customerId);
  });
});
