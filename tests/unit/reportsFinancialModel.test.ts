import { describe, expect, it } from "vitest";
import {
  computeWorkspaceFinancials,
  getMonthRange,
  monthsEndingAt,
  trendMonthsForPeriod,
  type FinancialDocLike,
} from "../../src/lib/reports/financialModel";

/**
 * Reports money math. These cover the figures that were previously wrong
 * (collected, revenue basis, AR adjustment basis, aging buckets, WHT bases) and
 * the reconciliation invariants the screen relies on, so the report cannot
 * silently drift from the register or the customer list again.
 */

const TODAY = new Date("2026-09-15T00:00:00");
const PERIOD = getMonthRange(2026, 9); // 2026-09-01 .. 2026-09-30
const TREND = monthsEndingAt(2026, 9, 12);

let seq = 0;
function doc(
  overrides: Partial<FinancialDocLike> & { doc_type: string; status?: string },
): FinancialDocLike {
  seq += 1;
  return {
    id: `doc-${seq}`,
    status: "sent",
    issue_date: "2026-09-05",
    customer_id: "cust-1",
    customer: { name: "ลูกค้า เอ" },
    subtotal: 0,
    vat_amount: 0,
    total_amount: 0,
    net_payable: 0,
    wht_amount: 0,
    ...overrides,
  };
}

function run(
  docs: FinancialDocLike[],
  extra: Partial<Parameters<typeof computeWorkspaceFinancials>[0]> = {},
) {
  return computeWorkspaceFinancials({
    docs,
    invoiceIdsInBillingNote: new Set<string>(),
    start: PERIOD.start,
    end: PERIOD.end,
    trendMonths: TREND,
    today: TODAY,
    vatRegistered: true,
    ...extra,
  });
}

describe("computeWorkspaceFinancials — period summary", () => {
  it("does not count an unpaid invoice as collected", () => {
    // amount_received is NULL until a receipt is confirmed; the old code fell
    // back to net_payable and reported the invoice as fully collected.
    const { summary } = run([
      doc({
        doc_type: "invoice",
        status: "sent",
        subtotal: 1000,
        vat_amount: 70,
        total_amount: 1070,
        net_payable: 1070,
        amount_received: null,
      }),
    ]);
    expect(summary.revenue).toBe(1070);
    expect(summary.collected).toBe(0);
    expect(summary.vatCollected).toBe(70);
    expect(summary.docCount).toBe(1);
  });

  it("counts only the received cash for a partially paid invoice", () => {
    const { summary, arByCustomer } = run([
      doc({
        doc_type: "invoice",
        status: "partially_paid",
        subtotal: 1000,
        vat_amount: 70,
        total_amount: 1070,
        net_payable: 1070,
        amount_received: 400,
        due_date: "2026-08-20",
      }),
    ]);
    expect(summary.collected).toBe(400);
    expect(summary.outstanding).toBe(670);
    expect(arByCustomer[0].total).toBe(670);
  });

  it("recognizes revenue on the invoice for a non-VAT workspace too", () => {
    const { summary } = run(
      [
        doc({ doc_type: "invoice", status: "sent", total_amount: 1000, net_payable: 1000 }),
        // A receipt for the same deal must not double the revenue.
        doc({
          doc_type: "receipt",
          status: "generated",
          total_amount: 1000,
          net_payable: 1000,
          amount_received: 1000,
        }),
      ],
      { vatRegistered: false },
    );
    expect(summary.revenue).toBe(1000);
    expect(summary.collected).toBe(0);
  });

  it("ignores draft, voided and converted documents", () => {
    const { summary } = run([
      doc({ doc_type: "invoice", status: "draft", total_amount: 999, net_payable: 999 }),
      doc({ doc_type: "invoice", status: "voided", total_amount: 999, net_payable: 999 }),
      doc({ doc_type: "invoice", status: "converted", total_amount: 999, net_payable: 999 }),
      doc({ doc_type: "invoice", status: "sent", total_amount: 500, net_payable: 500 }),
    ]);
    expect(summary.revenue).toBe(500);
    expect(summary.docCount).toBe(1);
  });

  it("only counts documents whose recognition date falls in the period", () => {
    const { summary } = run([
      doc({
        doc_type: "invoice",
        status: "sent",
        issue_date: "2026-08-31",
        total_amount: 100,
        net_payable: 100,
      }),
      doc({
        doc_type: "invoice",
        status: "sent",
        issue_date: "2026-09-01",
        total_amount: 200,
        net_payable: 200,
      }),
      doc({
        doc_type: "invoice",
        status: "sent",
        issue_date: "2026-09-30",
        total_amount: 300,
        net_payable: 300,
      }),
      doc({
        doc_type: "invoice",
        status: "sent",
        issue_date: "2026-10-01",
        total_amount: 400,
        net_payable: 400,
      }),
    ]);
    expect(summary.revenue).toBe(500);
  });
});

describe("computeWorkspaceFinancials — adjustment notes", () => {
  it("reduces revenue by the credit note's gross and AR by its net", () => {
    // A credit note releases its own WHT, so only its net reduces what the
    // customer still owes — but revenue is reported VAT-inclusive, so the
    // revenue line moves by the gross.
    const { summary } = run([
      doc({
        doc_type: "invoice",
        status: "sent",
        subtotal: 10000,
        vat_amount: 700,
        total_amount: 10700,
        wht_amount: 300,
        net_payable: 10400,
        due_date: "2026-08-10",
      }),
      doc({
        doc_type: "credit_note",
        status: "issued",
        issue_date: "2026-09-10",
        subtotal: 1000,
        vat_amount: 70,
        total_amount: 1070,
        wht_amount: 30,
        net_payable: 1040,
      }),
    ]);
    expect(summary.revenue).toBe(10700 - 1070);
    expect(summary.vatCollected).toBe(700 - 70);
    // 10400 − 1040 (net), not 10400 − 1070 (gross)
    expect(summary.outstanding).toBe(10400 - 1040);
  });

  it("increases revenue and AR for a debit note", () => {
    const { summary, arByCustomer } = run([
      doc({
        doc_type: "invoice",
        status: "sent",
        subtotal: 1000,
        vat_amount: 70,
        total_amount: 1070,
        net_payable: 1070,
        due_date: "2026-08-10",
      }),
      doc({
        doc_type: "debit_note",
        status: "issued",
        issue_date: "2026-09-12",
        subtotal: 200,
        vat_amount: 14,
        total_amount: 214,
        net_payable: 214,
      }),
    ]);
    expect(summary.revenue).toBe(1070 + 214);
    // The debit has no document of its own to sit on, so it is carried
    // explicitly — it must not vanish.
    expect(summary.outstanding).toBe(1070 + 214);
    expect(arByCustomer[0].total).toBe(1070 + 214);
  });

  it("only applies adjustment notes dated inside the period", () => {
    const { summary } = run([
      doc({ doc_type: "invoice", status: "sent", total_amount: 1000, net_payable: 1000 }),
      doc({
        doc_type: "credit_note",
        status: "issued",
        issue_date: "2026-08-15",
        total_amount: 500,
        net_payable: 500,
      }),
    ]);
    expect(summary.revenue).toBe(1000);
  });
});

describe("computeWorkspaceFinancials — AR and aging", () => {
  it("does not double count an invoice held inside a billing note", () => {
    const invoice = doc({
      doc_type: "invoice",
      status: "sent",
      net_payable: 1070,
      due_date: "2026-08-01",
    });
    const note = doc({
      doc_type: "billing_note",
      status: "sent",
      net_payable: 1070,
      due_date: "2026-08-01",
    });
    const { summary, arByCustomer } = run([invoice, note], {
      invoiceIdsInBillingNote: new Set([invoice.id]),
    });
    expect(summary.outstanding).toBe(1070);
    expect(arByCustomer[0].count).toBe(1);
  });

  it("puts not-yet-due receivables in the current bucket instead of dropping them", () => {
    const { summary, arAging } = run([
      doc({ doc_type: "invoice", status: "sent", net_payable: 1000, due_date: "2026-10-31" }),
    ]);
    expect(arAging[0].label).toBe("ยังไม่ถึงกำหนด");
    expect(arAging[0].total).toBe(1000);
    expect(summary.outstanding).toBe(1000);
  });

  it("never ages a missing due date into the 90+ bucket", () => {
    const { summary, arAging } = run([
      doc({ doc_type: "invoice", status: "sent", net_payable: 1000, due_date: null }),
    ]);
    expect(arAging[0].total).toBe(1000);
    expect(arAging[4].total).toBe(0);
    expect(summary.outstanding).toBe(1000);
  });

  it("keeps the aging buckets reconciled with the outstanding total", () => {
    const { summary, arAging } = run([
      doc({ doc_type: "invoice", status: "sent", net_payable: 100, due_date: "2026-10-01" }), // current
      doc({ doc_type: "invoice", status: "sent", net_payable: 200, due_date: "2026-09-05" }), // 1-30
      doc({ doc_type: "invoice", status: "sent", net_payable: 300, due_date: "2026-08-01" }), // 31-60
      doc({ doc_type: "invoice", status: "sent", net_payable: 400, due_date: "2026-07-01" }), // 61-90
      doc({ doc_type: "invoice", status: "sent", net_payable: 500, due_date: "2026-05-01" }), // 90+
      doc({ doc_type: "invoice", status: "sent", net_payable: 600, due_date: null }), // current
    ]);
    const bucketTotal = arAging.reduce((sum, b) => sum + b.total, 0);
    expect(bucketTotal).toBe(summary.outstanding);
    expect(arAging.map((b) => b.total)).toEqual([700, 200, 300, 400, 500]);
  });

  it("reports credit beyond a customer's open AR as a credit balance, not AR", () => {
    const { summary, customerCreditTotal } = run([
      doc({ doc_type: "invoice", status: "sent", net_payable: 500, due_date: "2026-08-01" }),
      doc({
        doc_type: "credit_note",
        status: "issued",
        issue_date: "2026-09-06",
        total_amount: 1200,
        net_payable: 1200,
      }),
    ]);
    expect(summary.outstanding).toBe(0);
    expect(customerCreditTotal).toBe(700);
  });

  it("attributes a credit note to its own customer only", () => {
    // The old summary subtracted every credit note from the workspace AR total,
    // so one customer's credit reduced another customer's receivable.
    const { summary, arByCustomer, customerCreditTotal } = run([
      doc({
        doc_type: "invoice",
        status: "sent",
        customer_id: "c1",
        customer: { name: "เอ" },
        net_payable: 1000,
        due_date: "2026-08-01",
      }),
      doc({
        doc_type: "credit_note",
        status: "issued",
        issue_date: "2026-09-06",
        customer_id: "c2",
        customer: { name: "บี" },
        total_amount: 500,
        net_payable: 500,
      }),
    ]);
    expect(summary.outstanding).toBe(1000);
    expect(arByCustomer).toHaveLength(1);
    expect(arByCustomer[0].customerId).toBe("c1");
    // The credit is a balance owed back to บี, reported separately.
    expect(customerCreditTotal).toBe(500);
  });

  it("sums the customer list to the outstanding total", () => {
    const { summary, arByCustomer } = run([
      doc({
        doc_type: "invoice",
        status: "sent",
        customer_id: "c1",
        net_payable: 300,
        due_date: "2026-08-01",
      }),
      doc({
        doc_type: "invoice",
        status: "sent",
        customer_id: "c2",
        net_payable: 700,
        due_date: "2026-08-01",
      }),
      doc({
        doc_type: "credit_note",
        status: "issued",
        issue_date: "2026-09-06",
        customer_id: "c1",
        total_amount: 100,
        net_payable: 100,
      }),
    ]);
    const listTotal = arByCustomer.reduce((sum, c) => sum + c.total, 0);
    expect(listTotal).toBe(summary.outstanding);
    expect(summary.outstanding).toBe(900);
  });

  it("marks only overdue documents as overdue in the customer list", () => {
    const { arByCustomer } = run([
      doc({ doc_type: "invoice", status: "sent", net_payable: 100, due_date: "2026-10-31" }),
    ]);
    expect(arByCustomer[0].daysOverdue).toBe(0);
  });
});

describe("computeWorkspaceFinancials — WHT", () => {
  it("separates expected WHT on invoices from actual WHT on receipts", () => {
    const { summary } = run([
      doc({
        doc_type: "invoice",
        status: "sent",
        subtotal: 10000,
        vat_amount: 700,
        total_amount: 10700,
        wht_amount: 300,
        net_payable: 10400,
      }),
      doc({
        doc_type: "receipt",
        status: "generated",
        issue_date: "2026-09-20",
        total_amount: 10700,
        wht_amount: 300,
        net_payable: 10400,
        amount_received: 10400,
      }),
    ]);
    expect(summary.whtWithheld).toBe(300);
    expect(summary.whtActual).toBe(300);
  });

  it("does not report WHT from draft or voided receipts", () => {
    const { summary } = run([
      doc({ doc_type: "receipt", status: "draft", issue_date: "2026-09-20", wht_amount: 300 }),
      doc({ doc_type: "receipt", status: "voided", issue_date: "2026-09-20", wht_amount: 300 }),
    ]);
    expect(summary.whtActual).toBe(0);
  });
});

describe("computeWorkspaceFinancials — trend, delta and rate", () => {
  it("anchors the trend window on the selected month", () => {
    const { trend } = run([]);
    expect(trend).toHaveLength(12);
    expect(trend[trend.length - 1]).toMatchObject({ month: "09", year: 2026 });
    expect(trend[0]).toMatchObject({ month: "10", year: 2025 });
  });

  it("falls back to the current month when the period end is unusable", () => {
    const fallback = trendMonthsForPeriod("", 3, new Date("2026-03-04T00:00:00"));
    expect(fallback).toEqual([
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
      { year: 2026, month: 3 },
    ]);
    expect(trendMonthsForPeriod("2026-09-30", 2)).toEqual([
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
    ]);
  });

  it("reports a month dominated by credit notes as negative, without clamping", () => {
    const { trend } = run([
      doc({
        doc_type: "invoice",
        status: "sent",
        issue_date: "2026-09-02",
        total_amount: 100,
        net_payable: 100,
      }),
      doc({
        doc_type: "credit_note",
        status: "issued",
        issue_date: "2026-09-03",
        total_amount: 500,
        net_payable: 500,
      }),
    ]);
    const september = trend.find((m) => m.month === "09" && m.year === 2026);
    expect(september?.total).toBe(-400);
  });

  it("computes the period-over-period delta against the previous window", () => {
    const { revenueDelta } = run([
      doc({
        doc_type: "invoice",
        status: "sent",
        issue_date: "2026-09-10",
        total_amount: 1500,
        net_payable: 1500,
      }),
      doc({
        doc_type: "invoice",
        status: "sent",
        issue_date: "2026-08-10",
        total_amount: 1000,
        net_payable: 1000,
      }),
    ]);
    expect(revenueDelta).toBe(50);
  });

  it("returns no delta when the previous window had no revenue", () => {
    const { revenueDelta } = run([
      doc({
        doc_type: "invoice",
        status: "sent",
        issue_date: "2026-09-10",
        total_amount: 1500,
        net_payable: 1500,
      }),
    ]);
    expect(revenueDelta).toBeNull();
  });

  it("derives the collection rate from the same period", () => {
    const { collectionRate } = run([
      doc({
        doc_type: "invoice",
        status: "sent",
        total_amount: 1000,
        net_payable: 1000,
        amount_received: 250,
      }),
    ]);
    expect(collectionRate).toBeCloseTo(0.25);
  });
});

describe("computeWorkspaceFinancials — breakdowns", () => {
  it("groups period revenue by document type with adjustments folded in", () => {
    const { byType } = run([
      doc({ doc_type: "invoice", status: "sent", total_amount: 1000, net_payable: 1000 }),
      doc({
        doc_type: "credit_note",
        status: "issued",
        issue_date: "2026-09-08",
        total_amount: 200,
        net_payable: 200,
      }),
    ]);
    const invoice = byType.find((t) => t.docType === "invoice");
    const credit = byType.find((t) => t.docType === "credit_note");
    expect(invoice?.total).toBe(1000);
    expect(credit?.total).toBe(-200);
  });

  it("ranks customers by period revenue", () => {
    const { topCustomers } = run([
      doc({
        doc_type: "invoice",
        status: "sent",
        customer_id: "c1",
        customer: { name: "เล็ก" },
        total_amount: 100,
        net_payable: 100,
      }),
      doc({
        doc_type: "invoice",
        status: "sent",
        customer_id: "c2",
        customer: { name: "ใหญ่" },
        total_amount: 900,
        net_payable: 900,
      }),
    ]);
    expect(topCustomers.map((c) => c.customerId)).toEqual(["c2", "c1"]);
  });
});
