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

// Regression: ref-mode DN header rows must never ride onto a receipt whose
// items were copied from the parent billing note's linked invoices.
test.describe.serial("receipt print purity", () => {
  let dealId: string;
  let receiptId: string;

  test.beforeAll(async () => {
    const cust = await createCustomer(`E2E Cust RCP ${Date.now()}`);
    const deal = await createDeal(cust.id);
    dealId = deal.id;
    const userId = (await (await api()).auth.getUser()).data.user!.id;

    // Invoice created from a ref-mode DN carries the marker row first.
    const inv = await createDocument({
      id: uid(), deal_id: dealId, customer_id: cust.id,
      doc_type: "invoice", doc_number: "INV-E2E-RCP", status: "sent",
      issue_date: today(), due_date: today(),
      vat_registered: true, vat_rate: 7,
      subtotal: 18, vat_amount: 1.26, total_amount: 19.26, net_payable: 19.26,
    });
    await (await api()).from("document_line_items").insert([
      { id: uid(), document_id: inv.id, user_id: userId, item_name: "ใบส่งของ DN-E2E-RCP", item_type: "service", unit: "", unit_price: 0, quantity: 0, base_quantity: 0, line_total: 0, sort_order: 0 },
      { id: uid(), document_id: inv.id, user_id: userId, item_name: "แผ่นครอบมุมทรงแอล 5x5x100 ซม.", item_type: "product", unit: "ชิ้น", unit_price: 18, quantity: 1, base_quantity: 1, line_total: 18, sort_order: 1 },
    ]);

    const bn = await createDocument({
      id: uid(), deal_id: dealId, customer_id: cust.id,
      doc_type: "billing_note", doc_number: "BN-E2E-RCP", status: "sent",
      issue_date: today(),
      vat_registered: true, vat_rate: 7,
      subtotal: 18, vat_amount: 1.26, total_amount: 19.26, net_payable: 19.26,
    });
    await (await api()).from("billing_note_invoices").insert({
      id: uid(), billing_note_id: bn.id, invoice_id: inv.id, user_id: userId,
      invoice_number: inv.doc_number, issue_date: today(),
      subtotal: 18, vat_amount: 1.26, total_amount: 19.26,
    });

    // Draft receipt pointing at the BN (PaymentModal equivalent).
    const rc = await createDocument({
      id: uid(), deal_id: dealId, customer_id: cust.id,
      doc_type: "receipt", doc_number: "RC-E2E-RCP", status: "draft",
      converted_from_id: bn.id,
      issue_date: today(),
      vat_registered: true, vat_rate: 7,
      subtotal: 18, vat_amount: 1.26, total_amount: 19.26, net_payable: 19.26,
      amount_received: 19.26,
    });
    receiptId = rc.id;
  });

  test("draft receipt via BN shows the BN row, no DN marker or invoice rows", async ({ page }) => {
    await page.goto(`/documents/${receiptId}/print`);
    await expect(page.getByText("ใบวางบิลที่ชำระ")).toBeVisible();
    await expect(page.getByText(/BN-E2E-RCP/).first()).toBeVisible();
    await expect(page.getByText(/ใบส่งของ DN-/)).toHaveCount(0);
    await expect(page.getByText(/INV-E2E-RCP/)).toHaveCount(0);
  });

  test("confirmed receipt via billing note shows the BN, not its invoices", async ({ page }) => {
    // Simulate what confirmDraftReceipt does: link the receipt to its
    // parent billing note's invoices (with source_billing_note_id set).
    const userId = (await (await api()).auth.getUser()).data.user!.id;
    await (await api()).from("receipt_invoices").insert({
      id: uid(),
      receipt_id: receiptId,
      invoice_id: "00000000-0000-0000-0000-000000000099",
      source_billing_note_id: "00000000-0000-0000-0000-000000000098",
      user_id: userId,
      invoice_number: "INV-E2E-RCP",
      issue_date: new Date().toISOString().slice(0, 10),
      subtotal: 18,
      vat_amount: 1.26,
      total_amount: 19.26,
      paid_amount: 19.26,
    });

    await page.goto(`/documents/${receiptId}/print`);
    await expect(page.getByText("ใบวางบิลที่ชำระ")).toBeVisible();
    await expect(page.getByText(/INV-E2E-RCP/)).toHaveCount(0);
  });

  test.afterAll(async () => {
    if (dealId) await deleteDealCascade(dealId).catch(() => undefined);
  });
});
