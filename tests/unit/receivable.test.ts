import { describe, expect, it } from "vitest";
import {
  adjustmentNet,
  dealOutstanding,
  isActiveAdjustmentNote,
  isReceivableDoc,
  netAdjustmentTotal,
  receivableAmount,
  type ReceivableDocLike,
} from "../../src/lib/receivable";
import { computeWorkspaceFinancials } from "../../src/lib/reports/financialModel";

/**
 * The shared receivable definition. Every page that reports "ค้างชำระ" reads
 * these, so they are pinned here — a regression silently changes the AR figure
 * on several screens at once.
 */

let seq = 0;
function doc(overrides: Partial<ReceivableDocLike> & { doc_type: string }): ReceivableDocLike {
  seq += 1;
  return { status: "sent", total_amount: 0, net_payable: 0, amount_received: 0, ...overrides };
}

describe("isReceivableDoc", () => {
  it("accepts open invoices, tax-invoice-receipts and billing notes", () => {
    expect(isReceivableDoc(doc({ doc_type: "invoice", status: "sent" }))).toBe(true);
    expect(isReceivableDoc(doc({ doc_type: "invoice", status: "overdue" }))).toBe(true);
    expect(isReceivableDoc(doc({ doc_type: "invoice", status: "partially_paid" }))).toBe(true);
    expect(isReceivableDoc(doc({ doc_type: "tax_invoice_receipt", status: "sent" }))).toBe(true);
    expect(isReceivableDoc(doc({ doc_type: "billing_note", status: "overdue" }))).toBe(true);
  });

  it("never treats a receipt as a receivable", () => {
    // `documentSend` writes status `sent` for every document type, so a draft
    // receipt sent through that path used to inflate AR at its full net.
    expect(isReceivableDoc(doc({ doc_type: "receipt", status: "sent" }))).toBe(false);
    expect(isReceivableDoc(doc({ doc_type: "receipt", status: "generated" }))).toBe(false);
    expect(isReceivableDoc(doc({ doc_type: "receipt", status: "paid" }))).toBe(false);
  });

  it("excludes documents that are not open", () => {
    expect(isReceivableDoc(doc({ doc_type: "invoice", status: "paid" }))).toBe(false);
    expect(isReceivableDoc(doc({ doc_type: "invoice", status: "draft" }))).toBe(false);
    expect(isReceivableDoc(doc({ doc_type: "invoice", status: "voided" }))).toBe(false);
    // The billing note carries the receivable once an invoice is bundled.
    expect(isReceivableDoc(doc({ doc_type: "invoice", status: "in_billing" }))).toBe(false);
    expect(isReceivableDoc(doc({ doc_type: "credit_note", status: "issued" }))).toBe(false);
    expect(isReceivableDoc(doc({ doc_type: "quotation", status: "sent" }))).toBe(false);
  });
});

describe("receivableAmount", () => {
  it("is the cash still owed after WHT and after anything received", () => {
    expect(receivableAmount(doc({ doc_type: "invoice", net_payable: 1070 }))).toBe(1070);
    expect(
      receivableAmount(
        doc({
          doc_type: "invoice",
          status: "partially_paid",
          net_payable: 1070,
          amount_received: 400,
        }),
      ),
    ).toBe(670);
  });

  it("never goes negative when a document is over-received", () => {
    expect(
      receivableAmount(
        doc({
          doc_type: "invoice",
          status: "partially_paid",
          net_payable: 100,
          amount_received: 250,
        }),
      ),
    ).toBe(0);
  });
});

describe("adjustment notes", () => {
  it("uses the note's net, not its gross", () => {
    // A credit note releases its own WHT, so only its net reduces the debt.
    const credit = doc({
      doc_type: "credit_note",
      status: "issued",
      total_amount: 1070,
      net_payable: 1040,
    });
    expect(adjustmentNet(credit)).toBe(-1040);
    const debit = doc({
      doc_type: "debit_note",
      status: "issued",
      total_amount: 214,
      net_payable: 208,
    });
    expect(adjustmentNet(debit)).toBe(208);
  });

  it("ignores draft and voided notes", () => {
    expect(isActiveAdjustmentNote(doc({ doc_type: "credit_note", status: "draft" }))).toBe(false);
    expect(isActiveAdjustmentNote(doc({ doc_type: "debit_note", status: "voided" }))).toBe(false);
    expect(
      netAdjustmentTotal([doc({ doc_type: "credit_note", status: "voided", net_payable: 500 })]),
    ).toBe(0);
  });
});

describe("dealOutstanding", () => {
  it("sums open invoices net of receipts and adjustments", () => {
    const outstanding = dealOutstanding([
      doc({ doc_type: "invoice", status: "sent", net_payable: 1000 }),
      doc({
        doc_type: "invoice",
        status: "partially_paid",
        net_payable: 500,
        amount_received: 200,
      }),
      doc({ doc_type: "credit_note", status: "issued", net_payable: 100 }),
      doc({ doc_type: "invoice", status: "voided", net_payable: 9999 }),
    ]);
    expect(outstanding).toBe(1000 + 300 - 100);
  });

  it("lets a billing note supersede the invoices it bundles", () => {
    const outstanding = dealOutstanding([
      doc({ doc_type: "invoice", status: "in_billing", net_payable: 1070 }),
      doc({ doc_type: "billing_note", status: "sent", net_payable: 1070 }),
    ]);
    expect(outstanding).toBe(1070);
  });

  it("never reports a negative balance", () => {
    expect(
      dealOutstanding([
        doc({ doc_type: "invoice", status: "sent", net_payable: 100 }),
        doc({ doc_type: "credit_note", status: "issued", net_payable: 500 }),
      ]),
    ).toBe(0);
  });

  it("agrees with the workspace model for a single deal", () => {
    // The deal-level and workspace-level shapes differ, but for one deal's
    // documents they must produce the same number.
    const docs = [
      doc({ doc_type: "invoice", status: "sent", net_payable: 1070 }),
      doc({ doc_type: "credit_note", status: "issued", net_payable: 70 }),
    ] as Array<ReceivableDocLike & { id: string; customer_id: string }>;
    docs[0].id = "i1";
    docs[0].customer_id = "c1";
    docs[1].id = "n1";
    docs[1].customer_id = "c1";

    const model = computeWorkspaceFinancials({
      docs,
      invoiceIdsInBillingNote: new Set<string>(),
      start: "2026-09-01",
      end: "2026-09-30",
      trendMonths: [],
      today: new Date("2026-09-15T00:00:00"),
    });

    expect(dealOutstanding(docs)).toBe(model.summary.outstanding);
    expect(model.summary.outstanding).toBe(1000);
  });
});
