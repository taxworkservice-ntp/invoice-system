import { describe, it, expect } from "vitest";
import { computeDealFinancialSummary } from "../../src/lib/dealFinancials";
import type { Document } from "../../src/types";

function doc(overrides: Partial<Document> & Pick<Document, "doc_type" | "status">): Document {
  return {
    id: crypto.randomUUID(),
    subtotal: 0,
    vat_amount: 0,
    total_amount: 0,
    wht_amount: 0,
    net_payable: 0,
    amount_received: 0,
    ...overrides,
  } as Document;
}

describe("computeDealFinancialSummary", () => {
  it("computes outstanding for an unpaid invoice", () => {
    const summary = computeDealFinancialSummary([
      doc({ doc_type: "invoice", status: "sent", total_amount: 1070, net_payable: 1070 }),
    ]);
    expect(summary.grossAmount).toBe(1070);
    expect(summary.netPayable).toBe(1070);
    expect(summary.outstanding).toBe(1070);
    expect(summary.customerCredit).toBe(0);
  });

  it("exposes the before-VAT breakdown of the source document", () => {
    const summary = computeDealFinancialSummary([
      doc({
        doc_type: "invoice", status: "sent",
        subtotal: 380_000, vat_amount: 26_600, total_amount: 406_600, net_payable: 406_600,
      }),
    ]);
    expect(summary.subtotalBeforeVat).toBe(380_000);
    expect(summary.vatAmount).toBe(26_600);
    // VAT-exempt / legacy docs without vat_amount keep the breakdown hidden
    const exempt = computeDealFinancialSummary([
      doc({ doc_type: "invoice", status: "sent", total_amount: 1_000, net_payable: 1_000 }),
    ]);
    expect(exempt.vatAmount).toBe(0);
    expect(exempt.subtotalBeforeVat).toBe(1_000);
  });

  it("reconciles a fully-paid deal", () => {
    const summary = computeDealFinancialSummary([
      doc({
        doc_type: "invoice", status: "paid",
        total_amount: 208650, wht_amount: 5850, net_payable: 202800,
        amount_received: 202800,
      }),
      doc({ doc_type: "receipt", status: "generated", amount_received: 202800 }),
    ]);
    expect(summary.netPayable).toBe(202800);
    expect(summary.amountReceived).toBe(202800);
    expect(summary.outstanding).toBe(0);
    expect(summary.customerCredit).toBe(0);
    // WHT accumulated proportionally from receipts = full expected WHT
    expect(summary.whtAmount).toBe(5850);
  });

  it("nets the credit note's own WHT when crediting a fully-paid invoice", () => {
    // Invoice paid in full; CN issued afterwards reverses part of it.
    const summary = computeDealFinancialSummary([
      doc({
        doc_type: "invoice", status: "paid",
        total_amount: 208650, wht_amount: 5850, net_payable: 202800,
        amount_received: 202800,
      }),
      doc({ doc_type: "receipt", status: "generated", amount_received: 202800 }),
      doc({
        doc_type: "credit_note", status: "issued",
        total_amount: 139100, vat_amount: 9100, wht_amount: 3900, net_payable: 135200,
      }),
    ]);
    // Due = invoice net − CN net (CN releases its own WHT)
    expect(summary.afterAdjustment).toBe(67600);
    expect(summary.outstanding).toBe(0);
    expect(summary.customerCredit).toBe(135200);
    expect(summary.creditWht).toBe(3900);
  });

  it("debit notes increase the due by their net amount", () => {
    const summary = computeDealFinancialSummary([
      doc({ doc_type: "invoice", status: "sent", total_amount: 1070, net_payable: 1070 }),
      doc({
        doc_type: "debit_note", status: "issued",
        total_amount: 214, vat_amount: 14, wht_amount: 6, net_payable: 208,
      }),
    ]);
    expect(summary.afterAdjustment).toBe(1278);
    expect(summary.outstanding).toBe(1278);
  });

  it("ignores voided and draft adjustment notes", () => {
    const summary = computeDealFinancialSummary([
      doc({ doc_type: "invoice", status: "sent", total_amount: 1070, net_payable: 1070 }),
      doc({ doc_type: "credit_note", status: "voided", total_amount: 500, net_payable: 500 }),
      doc({ doc_type: "credit_note", status: "draft", total_amount: 300, net_payable: 300 }),
    ]);
    expect(summary.creditTotal).toBe(0);
    expect(summary.afterAdjustment).toBe(1070);
  });

  it("flags reference-only source when only a quotation and delivery note exist", () => {
    // QT + DN issued but nothing billable yet — the deal detail summary must
    // present the amounts as reference figures, not as a tax-invoice receivable.
    const summary = computeDealFinancialSummary(
      [
        doc({
          doc_type: "quotation", status: "sent",
          total_amount: 695500, wht_amount: 19500, net_payable: 676000,
        }),
        doc({ doc_type: "delivery_note", status: "sent", total_amount: 695500, net_payable: 695500 }),
      ],
      doc({
        doc_type: "quotation", status: "sent",
        total_amount: 695500, wht_amount: 19500, net_payable: 676000,
      }),
    );
    expect(summary.hasCollectionDoc).toBe(false);
    expect(summary.sourceDocType).toBe("quotation");
    expect(summary.netPayable).toBe(676000);
  });

  it("flags a collection document when an invoice exists", () => {
    const summary = computeDealFinancialSummary([
      doc({ doc_type: "invoice", status: "sent", total_amount: 1070, net_payable: 1070 }),
    ]);
    expect(summary.hasCollectionDoc).toBe(true);
    expect(summary.sourceDocType).toBe("invoice");
  });
});
