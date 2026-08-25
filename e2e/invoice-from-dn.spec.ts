import { expect, test } from "@playwright/test";
import { api } from "./helpers/env";
import {
  createCustomer,
  createDeal,
  createDocument,
  createLineItems,
  deleteDealCascade,
  getUserId,
  today,
  uid,
} from "./helpers/data";

test.describe.serial("invoice from delivery notes — both modes + guard", () => {
  let dealId: string;
  let dnNumber: string;

  test.beforeAll(async () => {
    const cust = await createCustomer(`E2E Cust IFD ${Date.now()}`);
    const deal = await createDeal(cust.id);
    dealId = deal.id;
    const userId = await getUserId();
    const qt = await createDocument({
      id: uid(), deal_id: dealId, customer_id: cust.id,
      doc_type: "quotation", doc_number: "QT-E2E-IFD", status: "sent", issue_date: today(),
    });
    await createLineItems([
      { document_id: qt.id, user_id: userId, item_name: "E2E Goods", item_type: "product", unit: "ชิ้น", unit_price: 100, quantity: 5, base_quantity: 5, line_total: 500, sort_order: 0 },
    ]);
    const dn = await createDocument({
      id: uid(), deal_id: dealId, customer_id: cust.id,
      doc_type: "delivery_note", doc_number: "DN-E2E-IFD", status: "sent",
      issue_date: today(), converted_from_id: qt.id, hide_amounts_on_print: true,
    });
    dnNumber = dn.doc_number;
    await createLineItems([
      {
        document_id: dn.id, user_id: userId, item_name: "E2E Goods",
        item_sku: null, item_type: "product", unit: "ชิ้น",
        unit_price: 100, quantity: 5, base_quantity: 5,
        discount_percent: 0, discount_amount: 0, line_total: 500,
        source_document_id: qt.id, sort_order: 0,
      },
    ]);
  });

  test("ref mode shows one summary row per DN", async ({ page }) => {
    const { data: dn } = (await api()).from("documents").select("id").eq("doc_number", dnNumber).single();
    await page.goto(`/documents/new?type=invoice_from_delivery_notes&dnId=${dn!.id}`);
    await expect(page.getByText(`ใบส่งของ ${dnNumber}`)).toBeVisible();
    // no detail grid inputs in ref mode
    await expect(page.getByPlaceholder("+ รายละเอียด / สเปค")).toHaveCount(0);
  });

  test("detail mode shows the editable grid with variance hints", async ({ page }) => {
    const { data: dn } = (await api()).from("documents").select("id").eq("doc_number", dnNumber).single();
    await page.goto(`/documents/new?type=invoice_from_delivery_notes&dnId=${dn!.id}`);
    await page.getByText("โหมดอ้างอิง").click();
    await expect(page.getByPlaceholder("+ รายละเอียด / สเปค").first()).toBeVisible();
  });

  test("over-billing is blocked with a clear error", async ({ page }) => {
    const { data: dn } = (await api()).from("documents").select("id").eq("doc_number", dnNumber).single();
    await page.goto(`/documents/new?type=invoice_from_delivery_notes&dnId=${dn!.id}`);
    // switch to detail mode and try to over-bill
    await page.getByText("โหมดอ้างอิง").click();
    const qty = page.locator('input[type="number"]').first();
    await qty.fill("99");
    await page.getByRole("button", { name: "สร้างใบแจ้งหนี้" }).click();
    await expect(page.getByText("มากกว่ายอดคงเหลือ")).toBeVisible();
  });

  test.afterAll(async () => {
    if (dealId) await deleteDealCascade(dealId).catch(() => undefined);
  });
});
