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

test.describe.serial("draft receipt lifecycle", () => {
  let dealId: string;

  test.beforeAll(async () => {
    const cust = await createCustomer(`E2E Cust RC ${Date.now()}`);
    const deal = await createDeal(cust.id);
    dealId = deal.id;
    const userId = await getUserId();
    const inv = await createDocument({
      id: uid(), deal_id: dealId, customer_id: cust.id,
      doc_type: "invoice", doc_number: "INV-E2E-RC", status: "sent",
      issue_date: today(), due_date: today(),
      vat_registered: true, vat_rate: 7,
      subtotal: 1000, vat_amount: 70, total_amount: 1070, net_payable: 1070,
    });
    await createLineItems([
      { document_id: inv.id, user_id: userId, item_name: "E2E Service", item_type: "service", unit: "งวด", unit_price: 1000, quantity: 1, line_total: 1000, sort_order: 0 },
    ]);
  });

  test("save draft receipt → deal waits for confirmation (not done)", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    // skip BN, open payment modal directly
    await page.getByRole("button", { name: "ข้ามใบวางบิล แล้วบันทึกรับเงิน" }).click();
    await expect(page.getByRole("heading", { name: "บันทึกรับเงิน (ร่างใบเสร็จ)" })).toBeVisible();
    await page.getByRole("button", { name: "บันทึกใบเสร็จ (ร่าง)" }).click();
    await expect(page.getByText("รอยืนยันการรับเงิน")).toBeVisible();
  });

  test("แก้ไขฉบับร่าง reopens modal prefilled and saves edits in place", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    await page.getByRole("button", { name: "แก้ไขฉบับร่าง" }).click();
    await expect(page.getByRole("heading", { name: "แก้ไขใบเสร็จร่าง" })).toBeVisible();
    await page.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
    await expect(page.getByText("บันทึกการแก้ไขใบเสร็จแล้ว")).toBeVisible();
  });

  test("confirm applies side effects → deal done", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    await page.getByRole("button", { name: "ยืนยันการรับเงิน" }).first().click();
    // dialog appears — confirm inside it
    await page.locator('[role="dialog"], .fixed').last().getByRole("button", { name: "ยืนยันการรับเงิน" }).click();
    await expect(page.getByText("เครดิตคงเหลือ", { exact: false }).or(page.getByText("รับครบแล้ว"))).toBeVisible();
    await expect(page.getByText("เสร็จแล้ว").first()).toBeVisible();
  });

  test.afterAll(async () => {
    if (dealId) await deleteDealCascade(dealId).catch(() => undefined);
  });
});
