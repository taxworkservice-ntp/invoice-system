import { expect, test } from "@playwright/test";
import {
  createCustomer,
  createDeal,
  createDocument,
  deleteDealCascade,
  today,
  uid,
} from "./helpers/data";

test.describe.serial("deal summary sheet", () => {
  let dealId: string;
  let invoiceNumber: string;

  test.beforeAll(async () => {
    const cust = await createCustomer(`E2E Cust SUM ${Date.now()}`);
    const deal = await createDeal(cust.id);
    dealId = deal.id;
    const inv = await createDocument({
      id: uid(), deal_id: dealId, customer_id: cust.id,
      doc_type: "invoice", doc_number: "INV-E2E-SUM", status: "sent",
      issue_date: today(), due_date: today(),
      vat_registered: true, vat_rate: 7,
      subtotal: 1000, vat_amount: 70, total_amount: 1070, net_payable: 1070,
    });
    invoiceNumber = inv.doc_number!;
  });

  test("sheet shows timeline, document ledger and reconciliation", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    await page.getByRole("button", { name: "สรุปงานขาย" }).click();
    await expect(page.getByRole("heading", { name: "สรุปงานขาย" })).toBeVisible();

    // Document ledger contains the invoice
    const sheet = page.locator(".fixed.inset-0").filter({
      has: page.getByRole("heading", { name: "สรุปงานขาย" }),
    });
    await expect(
      sheet.getByRole("cell", { name: invoiceNumber }),
    ).toBeVisible();

    // Timeline logged the API-side insert via the DB trigger
    await expect(page.getByText("สร้างเอกสารและออกเอกสาร").first()).toBeVisible();

    // Reconciliation statement renders its waterfall rows (scoped to the sheet:
    // the deal page card and the hidden print layout repeat these labels)
    await expect(sheet.getByText("ยอดรวม (รวม VAT)").first()).toBeVisible();
    await expect(sheet.getByText("ยอดสุทธิตามเอกสาร").first()).toBeVisible();
    await expect(sheet.getByText("ค้างรับ").first()).toBeVisible();
  });

  test.afterAll(async () => {
    if (dealId) await deleteDealCascade(dealId).catch(() => undefined);
  });
});
