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

test.describe.serial("partial delivery journey", () => {
  let dealId: string;

  test.beforeAll(async () => {
    const cust = await createCustomer(`E2E Cust DN ${Date.now()}`);
    const deal = await createDeal(cust.id);
    dealId = deal.id;
    const userId = await getUserId();
    const qt = await createDocument({
      id: uid(),
      deal_id: dealId,
      customer_id: cust.id,
      doc_type: "quotation",
      doc_number: "QT-E2E-DN",
      status: "sent",
      issue_date: today(),
    });
    await createLineItems([
      {
        document_id: qt.id,
        user_id: userId,
        item_name: "E2E Goods",
        item_type: "product",
        unit: "ชิ้น",
        unit_price: 50,
        quantity: 10,
        base_quantity: 10,
        line_total: 500,
        sort_order: 0,
      },
    ]);
  });

  async function openDnForm(page: import("@playwright/test").Page) {
    const { data: qt } = await (await api()).from("documents").select("id").eq("doc_number", "QT-E2E-DN").single();
    await page.goto(`/documents/new?type=delivery_note_from_quotation&quotationId=${qt!.id}`);
  }

  test("partial DN: deliver 4 of 10", async ({ page }) => {
    await openDnForm(page);
    const qty = page.locator('input[type="number"]').first();
    await qty.fill("4");
    await page.getByRole("button", { name: "สร้างใบส่งของฉบับร่าง" }).click();
    await page.waitForURL(
      /\/deals\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    // Draft DNs do not count as delivered until sent.
    await page
      .getByRole("button", { name: "บันทึกว่าส่งของแล้ว" })
      .first()
      .click();
    await expect(page.getByText("ส่งแล้ว 4 / 10")).toBeVisible();
  });

  test("second DN covers the remainder", async ({ page }) => {
    await openDnForm(page);
    // remaining quantity (6) prefilled
    await page.getByRole("button", { name: "สร้างใบส่งของฉบับร่าง" }).click();
    await page.waitForURL(
      /\/deals\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    await page
      .getByRole("button", { name: "บันทึกว่าส่งของแล้ว" })
      .first()
      .click();
    await expect(page.getByText("ส่งครบแล้ว").first()).toBeVisible();
  });

  test.afterAll(async () => {
    if (dealId) await deleteDealCascade(dealId).catch(() => undefined);
  });
});
