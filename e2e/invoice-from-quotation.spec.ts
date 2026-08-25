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

test.describe.serial("invoice from quotation journey", () => {
  let dealId: string;

  test.beforeAll(async () => {
    const cust = await createCustomer(`E2E Cust INV ${Date.now()}`);
    const deal = await createDeal(cust.id);
    dealId = deal.id;
    const userId = await getUserId();
    const qt = await createDocument({
      id: uid(),
      deal_id: dealId,
      customer_id: cust.id,
      doc_type: "quotation",
      doc_number: "QT-E2E-INV",
      status: "sent",
      issue_date: today(),
      subtotal: 2000,
      vat_amount: 140,
      total_amount: 2140,
      net_payable: 2140,
    });
    await createLineItems([
      {
        document_id: qt.id,
        user_id: userId,
        item_name: "E2E Item",
        item_type: "service",
        unit: "งวด",
        unit_price: 1000,
        quantity: 2,
        base_quantity: 2,
        line_total: 2000,
        sort_order: 0,
      },
    ]);
  });

  test("convert sent quotation → form renders all five steps", async ({ page }) => {
    const { data: qt } = (await api()).from("documents").select("id").eq("doc_number", "QT-E2E-INV").single();
    await page.goto(`/documents/new?type=invoice_from_quotation&quotationId=${qt!.id}`);

    for (const step of ["ลูกค้าและรอบเอกสาร", "เลือกใบเสนอราคา", "รายการที่จะออกบิล", "ตัวเลือกเอกสาร", "สรุปและบันทึก"]) {
      await expect(page.getByText(step).first()).toBeVisible();
    }
  });

  test("create + send invoice from deal page", async ({ page }) => {
    const { data: qt } = (await api()).from("documents").select("id").eq("doc_number", "QT-E2E-INV").single();
    await page.goto(`/documents/new?type=invoice_from_quotation&quotationId=${qt!.id}`);
    await page.getByRole("button", { name: "สร้างใบแจ้งหนี้" }).click();
    await page.waitForURL(/\/deals\//);
    await expect(page.getByText("รอวางบิล")).toBeVisible();

    await page.getByRole("button", { name: "ส่งใบแจ้งหนี้ให้ลูกค้า" }).click();
    await expect(page.getByText("ใบแจ้งหนี้ส่งแล้ว")).toBeVisible();
  });

  test.afterAll(async () => {
    if (dealId) await deleteDealCascade(dealId).catch(() => undefined);
  });
});
