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

test.describe.serial("credit note journey", () => {
  let dealId: string;
  let custName: string;
  let cnUrl: string;

  test.beforeAll(async () => {
    const cust = await createCustomer(`E2E Cust CN ${Date.now()}`);
    custName = cust.name;
    const deal = await createDeal(cust.id);
    dealId = deal.id;
    const userId = await getUserId();
    const inv = await createDocument({
      id: uid(), deal_id: dealId, customer_id: cust.id,
      doc_type: "invoice", doc_number: "INV-E2E-CN", status: "paid",
      issue_date: today(), due_date: today(),
      vat_registered: true, vat_rate: 7,
      subtotal: 1000, vat_amount: 70, total_amount: 1070, net_payable: 1070,
      amount_received: 1070,
    });
    await createLineItems([
      // Ref-summary header row, exactly as invoice-from-DN persists them
      // (print marker: zero amounts, source-doc name).
      { document_id: inv.id, user_id: userId, item_name: "ใบส่งของ DN-E2E-CN", item_type: "service", unit: "", unit_price: 0, quantity: 0, base_quantity: 0, line_total: 0, sort_order: 0 },
      { document_id: inv.id, user_id: userId, item_name: "E2E Service", item_type: "service", unit: "งวด", unit_price: 1000, quantity: 1, base_quantity: 1, line_total: 1000, sort_order: 1 },
    ]);
  });

  test("issue credit note against fully-paid invoice → customer credit badge", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    // Issuance lives in the เอกสาร tab
    await page.getByRole("tab", { name: /เอกสาร/ }).click();
    await page.getByRole("button", { name: "ออกใบลดหนี้" }).click();
    // The action bar context label "{customer} · {n} รายการ" only renders once
    // the deal data has loaded — but n must be >= 1: issuing while the invoice
    // lines are still fetching silently no-ops (items.length === 0 guard).
    await expect(
      page.getByText(new RegExp(`${custName} · [1-9]\\d* รายการ`)),
    ).toBeVisible();
    await page.getByRole("button", { name: "ออกใบลดหนี้" }).last().click();
    // Wait for the issued CN's own detail page — /documents/new must not match.
    await page.waitForURL(
      /\/documents\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    cnUrl = page.url();
    await expect(page.getByText("ออกแล้ว", { exact: true })).toBeVisible();

    // Regression guard: ref-summary print-marker rows from the source invoice
    // must NOT be copied into the credit note (qty 0 / ฿0 pollution).
    const cnId = page.url().split("/documents/")[1].split(/[?#]/)[0];
    const { data: cnLines } = await (
      await api()
    )
      .from("document_line_items")
      .select("item_name, quantity, unit_price, line_total")
      .eq("document_id", cnId);
    expect(
      (cnLines || []).filter(
        (l) =>
          l.quantity === 0 && l.unit_price === 0 && /^ใบส่งของ\s/.test(l.item_name || ""),
      ),
    ).toHaveLength(0);

    // back on the deal, customer credit badge appears
    await page.goto(`/deals/${dealId}`);
    await expect(page.getByText("เครดิตเงินสดคงเหลือ")).toBeVisible();
  });

  test("wrong CN can be voided & reissued (immutability flow)", async ({ page }) => {
    await page.goto(cnUrl);
    await page.getByRole("button", { name: "ยกเลิกและออกฉบับใหม่" }).click();
    // pick a correction reason
    const reasonSelect = page.locator("select").first();
    await reasonSelect.selectOption({ index: 1 });
    await page.getByRole("button", { name: "ยกเลิกใบลดหนี้และออกฉบับใหม่" }).click();
    // lands back on deal with a fresh draft credit note
    await expect(page.getByText("ร่าง").first()).toBeVisible();
  });

  test.afterAll(async () => {
    if (dealId) await deleteDealCascade(dealId).catch(() => undefined);
  });
});
