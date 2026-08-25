import { expect, test } from "@playwright/test";
import { api } from "./helpers/env";
import {
  createCustomer,
  createDeal,
  createDocument,
  deleteDealCascade,
  today,
  uid,
} from "./helpers/data";
import { computeDealFinancialSummary } from "../src/lib/dealFinancials";

// Scenario mirrors the real DL-2026-00284 shape: invoice fully paid with WHT,
// credit note issued AFTER payment (with its own VAT + WHT).
const INVOICE = {
  subtotal: 195_000, vat: 13_650, total: 208_650,
  wht: 5_850, net: 202_800,
};
const RECEIPT_RECEIVED = 202_800;
const CN = { subtotal: 130_000, vat: 9_100, total: 139_100, wht: 3_900, net: 135_200 };

test.describe.serial("financial summary correctness", () => {
  let dealId: string;

  test.beforeAll(async () => {
    const cust = await createCustomer(`E2E Cust FIN ${Date.now()}`);
    const deal = await createDeal(cust.id);
    dealId = deal.id;
    const userId = (await (await api()).auth.getUser()).data.user!.id;

    const invoice = await createDocument({
      id: uid(), deal_id: dealId, customer_id: cust.id,
      doc_type: "invoice", doc_number: "INV-E2E-FIN", status: "paid",
      issue_date: today(), due_date: today(),
      vat_registered: true, vat_rate: 7,
      subtotal: INVOICE.subtotal, vat_amount: INVOICE.vat,
      total_amount: INVOICE.total, wht_amount: INVOICE.wht,
      net_payable: INVOICE.net, amount_received: RECEIPT_RECEIVED,
    });
    await createDocument({
      id: uid(), deal_id: dealId, customer_id: cust.id,
      doc_type: "receipt", doc_number: "RC-E2E-FIN", status: "generated",
      issue_date: today(),
      vat_registered: true, vat_rate: 7,
      subtotal: INVOICE.subtotal, vat_amount: INVOICE.vat,
      total_amount: INVOICE.total, wht_amount: INVOICE.wht,
      net_payable: INVOICE.net, amount_received: RECEIPT_RECEIVED,
    });
    void invoice;
    await createDocument({
      id: uid(), deal_id: dealId, customer_id: cust.id,
      doc_type: "credit_note", doc_number: "CN-E2E-FIN", status: "issued",
      issue_date: today(),
      vat_registered: true, vat_rate: 7,
      subtotal: CN.subtotal, vat_amount: CN.vat,
      total_amount: CN.total, wht_amount: CN.wht,
      net_payable: CN.net,
    });
    void userId;
  });

  function parseMoney(text: string): number {
    // strips ฿, grouping commas, whitespace and BOTH minus variants (ASCII + U+2212)
    return Number(text.replace(/[฿,\s\u2212-]/g, ""));
  }

  async function readCardRow(page: import("@playwright/test").Page, label: string): Promise<number> {
    // Each waterfall row is a flex container whose first span is the label.
    const row = page.locator("div.flex.items-baseline.justify-between").filter({
      has: page.getByText(label, { exact: true }),
    }).first();
    const value = await row.locator("span").last().innerText();
    return parseMoney(value);
  }

  test("KPI card numbers match independent computation", async ({ page }) => {
    const docs = (await (await api())
      .from("documents")
      .select("*")
      .eq("deal_id", dealId)).data ?? [];

    const expected = computeDealFinancialSummary(
      docs as never[],
      docs.find((d: { doc_type: string }) => d.doc_type === "invoice") ?? null,
    );

    await page.goto(`/deals/${dealId}`);

    expect(await readCardRow(page, "ยอดรวม (รวม VAT)")).toBe(INVOICE.total);
    expect(await readCardRow(page, "หัก ณ ที่จ่ายตามเอกสาร")).toBe(INVOICE.wht);
    expect(await readCardRow(page, "ยอดสุทธิตามเอกสาร")).toBe(expected.netPayable);
    expect(expected.netPayable).toBe(INVOICE.net);
    expect(await readCardRow(page, "ใบลดหนี้ (รวม VAT)")).toBe(CN.total);
    expect(await readCardRow(page, "ภาษีหัก ณ ที่จ่ายที่ปรับลดลงด้วย")).toBe(CN.wht);
    expect(await readCardRow(page, "ยอดที่ต้องชำระหลังลดหนี้")).toBe(expected.afterAdjustment);
    // Net-basis reconciliation: 202,800 − 135,200 = 67,600 (not gross-based 63,700)
    expect(expected.afterAdjustment).toBe(67_600);
    expect(await readCardRow(page, "รับแล้ว")).toBe(RECEIPT_RECEIVED);
    expect(await readCardRow(page, "ค้างรับ")).toBe(0);
    expect(await readCardRow(page, "เครดิตคงเหลือคืนลูกค้า")).toBe(expected.customerCredit);
    expect(expected.customerCredit).toBe(CN.net);

    // Deal-page badge agrees with the computed state
    await expect(page.getByText("รับครบแล้ว")).toBeVisible();

    void docs;
  });

  test("summary sheet statement shows identical numbers", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    await page.getByRole("button", { name: "สรุปงานขาย" }).click();
    const sheet = page.locator(".fixed.inset-0").filter({
      has: page.getByRole("heading", { name: "สรุปงานขาย" }),
    });

    const statementValue = async (label: string): Promise<number> =>
      parseMoney(
        await sheet
          .locator("div.flex.items-baseline.justify-between")
          .filter({ has: page.getByText(label, { exact: true }) })
          .first()
          .locator("span")
          .last()
          .innerText(),
      );

    expect(await statementValue("ยอดรวม (รวม VAT)")).toBe(INVOICE.total);
    // The sheet uses the generic adjustment label; value must equal the
    // card's net-basis result either way.
    expect(await statementValue("ยอดที่ต้องชำระหลังปรับ")).toBe(67_600);
    expect(await statementValue("เครดิตคงเหลือคืนลูกค้า")).toBe(CN.net);
    // Ledger includes every document incl. the receipt
    await expect(sheet.getByRole("cell", { name: "RC-E2E-FIN" })).toBeVisible();
  });

  test.afterAll(async () => {
    if (dealId) await deleteDealCascade(dealId).catch(() => undefined);
  });
});
