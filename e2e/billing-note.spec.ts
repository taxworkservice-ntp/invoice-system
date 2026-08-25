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

test.describe.serial("billing note journey", () => {
  let dealId: string;

  test.beforeAll(async () => {
    const cust = await createCustomer(`E2E Cust BN ${Date.now()}`);
    const deal = await createDeal(cust.id);
    dealId = deal.id;
    const userId = await getUserId();
    const inv = await createDocument({
      id: uid(), deal_id: dealId, customer_id: cust.id,
      doc_type: "invoice", doc_number: "INV-E2E-BN", status: "sent",
      issue_date: today(), due_date: today(),
      vat_registered: true, vat_rate: 7,
      subtotal: 1000, vat_amount: 70, total_amount: 1070, net_payable: 1070,
    });
    await createLineItems([
      { document_id: inv.id, user_id: userId, item_name: "E2E Service", item_type: "service", unit: "งวด", unit_price: 1000, quantity: 1, line_total: 1000, sort_order: 0 },
    ]);
  });

  test("create billing note from sent invoice", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    await page.getByRole("button", { name: "สร้างใบวางบิล" }).click();
    // Invoice is pre-checked (auto-selected from this deal).
    // Saving a draft keeps the form open — sync on the insert completing.
    const saveDone = page.waitForResponse(
      (r) =>
        r.url().includes("/rest/v1/documents") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "บันทึกร่าง" }).click();
    await saveDone;

    // Draft BN shows on the deal page with the send action.
    await page.goto(`/deals/${dealId}`);
    await expect(page.getByText("ร่าง", { exact: true }).first()).toBeVisible();
    // billing_note is a financial type -> in-app confirm modal before locking.
    await page.getByRole("button", { name: "ส่งใบวางบิลให้ลูกค้า" }).click();
    await expect(page.getByRole("heading", { name: "ยืนยันการส่งเอกสาร" })).toBeVisible();
    await page.getByRole("button", { name: "ส่งเอกสาร" }).click();
    // Sent billing note pill on the deal page.
    await expect(page.getByText("รอชำระ").first()).toBeVisible();
  });

  test.afterAll(async () => {
    if (dealId) await deleteDealCascade(dealId).catch(() => undefined);
  });
});
