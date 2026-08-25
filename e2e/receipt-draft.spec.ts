import { expect, test } from "@playwright/test";
import { api, admin } from "./helpers/env";
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
  let bankAccountId: string;

  test.beforeAll(async () => {
    const cust = await createCustomer(`E2E Cust RC ${Date.now()}`);
    const deal = await createDeal(cust.id);
    dealId = deal.id;
    const userId = await getUserId();
    // Transfer payments require a receiving account — without a seeded row
    // the modal shows the disabled placeholder and cannot save.
    bankAccountId = uid();
    const { error } = await (await api()).from("bank_accounts").insert({
      id: bankAccountId,
      user_id: userId,
      bank_name: "E2E Bank",
      account_number: "1234567890",
      is_primary: true,
      sort_order: 0,
    });
    if (error) throw error;
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
    // Regression guard: the disabled placeholder must be gone once the bank
    // list loads, and the default account must be auto-selected.
    await expect(page.getByText("ยังไม่มีบัญชีธนาคาร")).toHaveCount(0);
    await page.getByRole("button", { name: "บันทึกใบเสร็จ (ร่าง)" }).click();
    // Draft receipt holds the deal open: numbered draft + confirm action.
    // ("รอยืนยันการรับเงิน" is the home-pipeline hint only.)
    await expect(page.getByText("มีฉบับร่างค้าง").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "ยืนยันการรับเงิน" }).first(),
    ).toBeVisible();
  });

  test("แก้ไขฉบับร่าง reopens modal prefilled and saves edits in place", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    await page.getByRole("button", { name: "แก้ไขฉบับร่าง" }).click();
    await expect(page.getByRole("heading", { name: "แก้ไขใบเสร็จร่าง" })).toBeVisible();
    await page.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
    // Saved in place: modal closes, deal still held open by the same draft.
    await expect(page.getByRole("heading", { name: "แก้ไขใบเสร็จร่าง" })).toBeHidden();
    await expect(page.getByText("มีฉบับร่างค้าง").first()).toBeVisible();
  });

  test("confirm applies side effects → deal done", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    await page.getByRole("button", { name: "ยืนยันการรับเงิน" }).first().click();
    // Confirm modal (shared Modal) titled "ยืนยันการรับเงิน".
    const confirmModal = page.locator("div.fixed.inset-0").filter({
      has: page.getByRole("heading", { name: "ยืนยันการรับเงิน" }),
    });
    await confirmModal.getByRole("button", { name: "ยืนยันการรับเงิน" }).click();
    await expect(page.getByText("รับครบแล้ว").first()).toBeVisible();
    await expect(page.getByText("ชำระแล้ว").first()).toBeVisible();
  });

  test.afterAll(async () => {
    if (dealId) await deleteDealCascade(dealId).catch(() => undefined);
    if (bankAccountId) {
      await admin().from("bank_accounts").delete().eq("id", bankAccountId).then(
        () => undefined,
        () => undefined,
      );
    }
  });
});
