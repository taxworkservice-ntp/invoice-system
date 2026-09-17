/**
 * Pure money math for the reports page.
 *
 * Everything here is a deterministic function of the document rows — no
 * Supabase, no React, no clock other than an injected `today`. `useReports`
 * owns the queries; this module owns the arithmetic, so the numbers can be
 * unit-tested and so the screen and the Excel export are guaranteed to be
 * derived from one implementation.
 *
 * Basis decisions (deliberate, see `work_session/2026-09-17-reports-correctness.md`):
 *
 *   - Revenue is **accrual**: recognized on the tax invoice for every
 *     workspace, VAT-registered or not. Receipts are collections, not revenue.
 *   - Revenue and VAT adjustment notes use their **gross** amount
 *     (`total_amount`), because revenue is reported VAT-inclusive.
 *   - AR adjustment notes use their **net** amount (`net_payable`), because a
 *     receivable is settled in cash after WHT — a credit note releases its own
 *     WHT, so only its net reduces what the customer still owes. This matches
 *     `dealFinancials.ts` (`afterAdjustment = netPayable + debitNet - creditNet`).
 */

import { STATUS_LABELS } from "../../constants";

/** Statuses excluded from every report figure. */
const EXCLUDED_STATUSES = ["draft", "voided", "converted"];
/** Statuses that represent money the customer still owes. */
const RECEIVABLE_STATUSES = ["sent", "overdue", "partially_paid"];

/**
 * Structural subset of a `documents` row. The reports query selects exactly
 * these columns, so the pure functions stay decoupled from the full schema.
 */
export interface FinancialDocLike {
  id: string;
  deal_id?: string | null;
  doc_number?: string | null;
  doc_type: string;
  status: string;
  subtotal?: number | null;
  vat_amount?: number | null;
  total_amount?: number | null;
  net_payable?: number | null;
  amount_received?: number | null;
  wht_amount?: number | null;
  wht_rate?: number | null;
  wht_certificate_no?: string | null;
  paid_at?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  customer_id?: string | null;
  customer?: { name?: string | null; tax_id?: string | null; address?: string | null } | null;
}

export interface FinancialSummary {
  revenue: number;
  collected: number;
  /** WHT expected on the invoices issued in the period. */
  whtWithheld: number;
  /** WHT actually withheld, per the receipts issued in the period. */
  whtActual: number;
  outstanding: number;
  vatCollected: number;
  docCount: number;
}

export interface RevenueByType {
  docType: string;
  label: string;
  count: number;
  total: number;
}

export interface MonthlyRevenue {
  month: string;
  year: number;
  total: number;
}

export interface TopCustomer {
  customerId: string;
  name: string;
  total: number;
  count: number;
}

export interface ARAgingBucket {
  label: string;
  total: number;
  count: number;
}

export interface ARByCustomer {
  customerId: string;
  name: string;
  total: number;
  count: number;
  oldestDue: string | null;
  daysOverdue: number;
}

export interface ARDetail {
  customerName: string;
  dealNumber: string | null;
  docNumber: string;
  docType: string;
  netPayable: number;
  dueDate: string | null;
  daysOverdue: number;
}

export interface WorkspaceFinancials {
  summary: FinancialSummary;
  trend: MonthlyRevenue[];
  arAging: ARAgingBucket[];
  arByCustomer: ARByCustomer[];
  arDetails: ARDetail[];
  byType: RevenueByType[];
  topCustomers: TopCustomer[];
  revenueDelta: number | null;
  collectionRate: number;
  /**
   * Credit balances owed back to customers: credit notes that exceeded the
   * customer's open receivables. Not AR — reported separately so it never
   * silently offsets outstanding.
   */
  customerCreditTotal: number;
  customerCreditByCustomer: { customerId: string; total: number }[];
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export function getMonthRange(year: number, month: number) {
  const m = String(month).padStart(2, "0");
  const start = `${year}-${m}-01`;
  const end = `${year}-${m}-${new Date(year, month, 0).getDate()}`;
  return { start, end };
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * The `count` months ending at `(year, month)` — the trend window follows the
 * selected period instead of always ending at today.
 */
export function monthsEndingAt(year: number, month: number, count: number) {
  const months: { year: number; month: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return months;
}

/**
 * Trend window for a report period: the `count` months ending at the period
 * end. Falls back to today when `end` is not a usable date, so a malformed
 * period can never yield a garbage chart.
 */
export function trendMonthsForPeriod(end: string, count: number, today = new Date()) {
  const anchor = new Date(`${end}T00:00:00`);
  const base = Number.isNaN(anchor.getTime()) ? today : anchor;
  return monthsEndingAt(base.getFullYear(), base.getMonth() + 1, count);
}

export function getPreviousPeriodRange(
  from: string,
  to: string,
): { start: string; end: string } | null {
  const f = new Date(`${from}T00:00:00`);
  const t = new Date(`${to}T00:00:00`);
  if (isNaN(f.getTime()) || isNaN(t.getTime()) || t < f) return null;
  const spanDays = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
  const prevEnd = new Date(f.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (spanDays - 1) * 86400000);
  return { start: toISODate(prevStart), end: toISODate(prevEnd) };
}

/**
 * Thai caption for the period-over-period delta ("vs เดือนก่อน" etc.) derived
 * from the selected range so exports and reused callers (month / quarter / YTD /
 * year in download-center) label it correctly.
 */
export function deltaCaptionForRange(from: string, to: string): string {
  const f = new Date(`${from}T00:00:00`);
  const t = new Date(`${to}T00:00:00`);
  if (isNaN(f.getTime()) || isNaN(t.getTime()) || t < f) return "vs ช่วงก่อน";
  const sameMonth = f.getFullYear() === t.getFullYear() && f.getMonth() === t.getMonth();
  if (sameMonth) return "vs เดือนก่อน";
  const fullYear =
    f.getMonth() === 0 && f.getDate() === 1 && t.getMonth() === 11 && t.getDate() === 31;
  if (fullYear) return "vs ปีก่อน";
  const spanDays = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
  if (spanDays >= 89 && spanDays <= 93) return "vs ไตรมาสก่อน";
  return "vs ช่วงก่อน";
}

// ---------------------------------------------------------------------------
// Document predicates
// ---------------------------------------------------------------------------

/** Revenue is recognized on the tax invoice, for every workspace. */
export function isRecognizedSalesDocument(doc: FinancialDocLike): boolean {
  return doc.doc_type === "invoice" && !EXCLUDED_STATUSES.includes(doc.status);
}

export function getRecognitionDate(doc: FinancialDocLike): string {
  if (doc.doc_type === "invoice") {
    return (doc.issue_date || doc.paid_at || "").slice(0, 10);
  }
  return (doc.paid_at || doc.issue_date || "").slice(0, 10);
}

export function isReceivableDoc(doc: FinancialDocLike): boolean {
  return RECEIVABLE_STATUSES.includes(doc.status);
}

/** What the customer still owes on this document, in cash (after WHT). */
export function receivableAmount(doc: FinancialDocLike): number {
  if (doc.status === "partially_paid") {
    return Math.max(0, (doc.net_payable || 0) - (doc.amount_received || 0));
  }
  return doc.net_payable || 0;
}

export function getTransactionStatusLabel(doc: FinancialDocLike): string {
  if (doc.doc_type === "receipt") {
    return STATUS_LABELS[doc.status as keyof typeof STATUS_LABELS] || doc.status;
  }
  const statusLabels: Record<string, string> = {
    paid: "ชำระแล้ว",
    generated: "รอชำระ",
    issued: "รอชำระ",
    sent: "รอชำระ",
    overdue: "เกินกำหนด",
  };
  return (
    statusLabels[doc.status] ||
    STATUS_LABELS[doc.status as keyof typeof STATUS_LABELS] ||
    doc.status
  );
}

export function docTypeLabels(vatRegistered: boolean): Record<string, string> {
  return {
    quotation: "ใบเสนอราคา",
    invoice: vatRegistered ? "ใบกำกับภาษี" : "ใบแจ้งหนี้",
    billing_note: "ใบวางบิล",
    receipt: "ใบเสร็จรับเงิน",
    delivery_note: "ใบส่งของ",
    credit_note: "ใบลดหนี้",
    debit_note: "ใบเพิ่มหนี้",
  };
}

/**
 * Receipts carrying WHT in the period — the row set behind both the WHT sheet
 * and the "หักจริง" figure, so they cannot drift apart.
 */
export function selectWhtReceipts(
  docs: FinancialDocLike[],
  start: string,
  end: string,
): FinancialDocLike[] {
  return docs.filter(
    (d) =>
      (d.wht_amount || 0) > 0 &&
      d.doc_type === "receipt" &&
      !EXCLUDED_STATUSES.includes(d.status) &&
      inRange(d.issue_date, start, end),
  );
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function inRange(date: string | null | undefined, start: string, end: string): boolean {
  const d = (date || "").slice(0, 10);
  return d >= start && d <= end;
}

const gross = (d: FinancialDocLike) => d.total_amount || 0;
const net = (d: FinancialDocLike) => d.net_payable || 0;

/**
 * Receivables the workspace is owed: sent / overdue / partially-paid invoices
 * and billing notes. Invoices already bundled into a billing note are excluded
 * — the note carries the receivable, so counting both would double it.
 */
function receivableDocs(
  docs: FinancialDocLike[],
  invoiceIdsInBillingNote: ReadonlySet<string>,
): FinancialDocLike[] {
  return docs.filter(
    (d) => isReceivableDoc(d) && !(d.doc_type === "invoice" && invoiceIdsInBillingNote.has(d.id)),
  );
}

/**
 * Net adjustment per customer (credit notes minus debit notes, both on their
 * net amount) and the resulting per-document write-down, allocated oldest due
 * first.
 *
 * Returns:
 *  - `adjustedAmount` — receivable per document after allocation
 *  - `customerCredit` — credit beyond a customer's open AR; there is no open
 *    document to absorb it, so it is reported as a credit balance, not AR
 *  - `netDebit` — the mirror case (debits exceed credits): a receivable with no
 *    document to attach to, so it must be added on top
 */
function allocateAdjustments(
  docs: FinancialDocLike[],
  arDocs: FinancialDocLike[],
): {
  adjustedAmount: Map<string, number>;
  customerCredit: Map<string, number>;
  netDebit: Map<string, number>;
} {
  const netByCustomer = new Map<string, number>();
  for (const d of docs) {
    if (d.doc_type !== "credit_note" && d.doc_type !== "debit_note") continue;
    const cid = d.customer_id;
    if (!cid) continue;
    const sign = d.doc_type === "credit_note" ? 1 : -1;
    netByCustomer.set(cid, (netByCustomer.get(cid) || 0) + sign * net(d));
  }

  const byCustomer = new Map<string, FinancialDocLike[]>();
  for (const d of arDocs) {
    if (!d.customer_id) continue;
    const list = byCustomer.get(d.customer_id) || [];
    list.push(d);
    byCustomer.set(d.customer_id, list);
  }

  const adjustedAmount = new Map<string, number>();
  const customerCredit = new Map<string, number>();
  const netDebit = new Map<string, number>();

  for (const [cid, customerDocs] of byCustomer) {
    let remaining = netByCustomer.get(cid) || 0;
    for (const d of [...customerDocs].sort((a, b) =>
      (a.due_date || "9999-12-31").localeCompare(b.due_date || "9999-12-31"),
    )) {
      let amount = receivableAmount(d);
      if (remaining > 0 && amount > 0) {
        const applied = Math.min(remaining, amount);
        amount -= applied;
        remaining -= applied;
      }
      adjustedAmount.set(d.id, amount);
    }
    if (remaining > 0) customerCredit.set(cid, remaining);
  }

  for (const [cid, value] of netByCustomer) {
    if (value >= 0) {
      // Credit for a customer with no open receivable: it cannot reduce anyone
      // else's AR (that was the old global-subtraction bug), so it is reported
      // as a credit balance instead of disappearing.
      if (value > 0 && !byCustomer.has(cid)) customerCredit.set(cid, value);
      continue;
    }
    // Net debit: a receivable with no document to attach to, so it must be
    // added on top rather than silently dropped.
    netDebit.set(cid, -value);
  }

  return { adjustedAmount, customerCredit, netDebit };
}

// ---------------------------------------------------------------------------
// Public computation
// ---------------------------------------------------------------------------

export interface WorkspaceFinancialsInput {
  /** Every non-quotation document row the report queries (already filtered). */
  docs: FinancialDocLike[];
  /** Invoices bundled into an active billing note. */
  invoiceIdsInBillingNote: ReadonlySet<string>;
  /** Selected period, inclusive ISO dates. */
  start: string;
  end: string;
  /** Trend window, usually `monthsEndingAt(selected year, month, 12)`. */
  trendMonths: { year: number; month: number }[];
  /** Deal number lookup for AR / register rows. */
  dealNumberByDealId?: ReadonlyMap<string, string | null>;
  /** Injected for deterministic tests. */
  today?: Date;
  vatRegistered?: boolean;
}

export function computeWorkspaceFinancials(input: WorkspaceFinancialsInput): WorkspaceFinancials {
  const {
    docs,
    invoiceIdsInBillingNote,
    start,
    end,
    trendMonths,
    dealNumberByDealId,
    vatRegistered = false,
  } = input;

  const now = input.today ?? new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const creditNotes = docs.filter((d) => d.doc_type === "credit_note");
  const debitNotes = docs.filter((d) => d.doc_type === "debit_note");
  const recognized = docs.filter(isRecognizedSalesDocument);
  const inPeriod = (d: FinancialDocLike) => inRange(getRecognitionDate(d), start, end);
  const adjustmentsIn = (list: FinancialDocLike[]) =>
    list.filter((d) => inRange(d.issue_date, start, end));

  const periodDocs = recognized.filter(inPeriod);
  const periodCredits = adjustmentsIn(creditNotes);
  const periodDebits = adjustmentsIn(debitNotes);

  // --- period summary ------------------------------------------------------
  const revenueGross = periodDocs.reduce((sum, d) => sum + (d.total_amount || net(d)), 0);
  // `amount_received` is NULL until a receipt is confirmed and only ever
  // accumulates actual receipts, so it must coalesce to 0.
  const collected = periodDocs.reduce((sum, d) => sum + (d.amount_received || 0), 0);
  const whtWithheld = periodDocs.reduce((sum, d) => sum + (d.wht_amount || 0), 0);
  const vatCollected = periodDocs.reduce((sum, d) => sum + (d.vat_amount || 0), 0);
  const creditGross = periodCredits.reduce((sum, d) => sum + gross(d), 0);
  const creditVat = periodCredits.reduce((sum, d) => sum + (d.vat_amount || 0), 0);
  const debitGross = periodDebits.reduce((sum, d) => sum + gross(d), 0);
  const debitVat = periodDebits.reduce((sum, d) => sum + (d.vat_amount || 0), 0);

  // Reported unclamped: a period dominated by credit notes is genuinely
  // negative, and a floor made the KPI disagree with the register.
  const revenue = revenueGross - creditGross + debitGross;
  const adjustedVat = vatCollected - creditVat + debitVat;

  // --- WHT actually withheld (receipts) ------------------------------------
  const whtDocs = selectWhtReceipts(docs, start, end);
  const whtActual = whtDocs.reduce((sum, d) => sum + (d.wht_amount || 0), 0);

  // --- AR ------------------------------------------------------------------
  const arDocs = receivableDocs(docs, invoiceIdsInBillingNote);
  const { adjustedAmount, customerCredit, netDebit } = allocateAdjustments(docs, arDocs);
  const adjustedArAmount = (d: FinancialDocLike) => adjustedAmount.get(d.id) ?? receivableAmount(d);

  const netDebitTotal = [...netDebit.values()].reduce((sum, v) => sum + v, 0);
  const arTotal = arDocs.reduce((sum, d) => sum + adjustedArAmount(d), 0);
  // `customerCredit` is a credit balance, not a receivable, so it does not
  // reduce the AR total here — it is reported separately by the caller.
  const outstanding = arTotal + netDebitTotal;

  const summary: FinancialSummary = {
    revenue,
    collected,
    whtWithheld,
    whtActual,
    outstanding,
    vatCollected: adjustedVat,
    docCount: periodDocs.length,
  };

  // --- aging ---------------------------------------------------------------
  const buckets: ARAgingBucket[] = [
    { label: "ยังไม่ถึงกำหนด", total: 0, count: 0 },
    { label: "1-30 วัน", total: 0, count: 0 },
    { label: "31-60 วัน", total: 0, count: 0 },
    { label: "61-90 วัน", total: 0, count: 0 },
    { label: "90+ วัน", total: 0, count: 0 },
  ];
  for (const d of arDocs) {
    const amount = adjustedArAmount(d);
    if (amount <= 0) continue;
    // A missing due date must never read as 90+ days overdue, and not-yet-due
    // receivables must not vanish: both belong in the current bucket. This also
    // keeps Σ(buckets) equal to `outstanding`.
    let bucket = 0;
    if (d.due_date) {
      const diffDays = Math.floor(
        (today.getTime() - new Date(d.due_date).getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diffDays > 0) bucket = diffDays <= 30 ? 1 : diffDays <= 60 ? 2 : diffDays <= 90 ? 3 : 4;
    }
    buckets[bucket].total += amount;
    buckets[bucket].count++;
  }
  if (netDebitTotal > 0) {
    buckets[0].total += netDebitTotal;
    buckets[0].count += netDebit.size;
  }

  // --- AR by customer ------------------------------------------------------
  type ArRow = Omit<ARByCustomer, "daysOverdue">;
  const arMap = new Map<string, ArRow>();
  for (const d of arDocs) {
    if (!d.customer_id) continue;
    const existing = arMap.get(d.customer_id) || {
      customerId: d.customer_id,
      name: d.customer?.name || "ไม่ระบุ",
      total: 0,
      count: 0,
      oldestDue: d.due_date || null,
    };
    existing.total += adjustedArAmount(d);
    existing.count++;
    if (d.due_date && (!existing.oldestDue || d.due_date < existing.oldestDue)) {
      existing.oldestDue = d.due_date;
    }
    arMap.set(d.customer_id, existing);
  }
  for (const [cid, amount] of netDebit) {
    const existing = arMap.get(cid);
    if (existing) {
      existing.total += amount;
      continue;
    }
    arMap.set(cid, {
      customerId: cid,
      name: docs.find((d) => d.customer_id === cid)?.customer?.name || "ไม่ระบุ",
      total: amount,
      count: 0,
      oldestDue: null,
    });
  }
  const arByCustomer: ARByCustomer[] = [...arMap.values()]
    .map((c) => {
      const daysOverdue = c.oldestDue
        ? Math.floor((today.getTime() - new Date(c.oldestDue).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      return { ...c, daysOverdue: daysOverdue > 0 ? daysOverdue : 0 };
    })
    .sort((a, b) => b.total - a.total);

  // --- AR detail (per document) -------------------------------------------
  const labels = docTypeLabels(vatRegistered);
  const arDetails: ARDetail[] = arDocs
    .map((d) => {
      const dueDate = d.due_date || null;
      const daysOverdue = dueDate
        ? Math.max(
            0,
            Math.floor((today.getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24)),
          )
        : 0;
      return {
        customerName: d.customer?.name || "ไม่ระบุ",
        dealNumber: d.deal_id ? (dealNumberByDealId?.get(d.deal_id) ?? null) : null,
        docNumber: d.doc_number || "-",
        docType: labels[d.doc_type] || d.doc_type,
        netPayable: adjustedArAmount(d),
        dueDate,
        daysOverdue,
      };
    })
    .sort((a, b) => b.netPayable - a.netPayable);

  // --- trend ---------------------------------------------------------------
  const trend: MonthlyRevenue[] = trendMonths.map((m) => {
    const { start: ms, end: me } = getMonthRange(m.year, m.month);
    const monthGross = recognized
      .filter((d) => inRange(getRecognitionDate(d), ms, me))
      .reduce((sum, d) => sum + (d.total_amount || net(d)), 0);
    const monthCredits = adjustmentsIn(creditNotes)
      .filter((d) => inRange(d.issue_date, ms, me))
      .reduce((sum, d) => sum + gross(d), 0);
    const monthDebits = adjustmentsIn(debitNotes)
      .filter((d) => inRange(d.issue_date, ms, me))
      .reduce((sum, d) => sum + gross(d), 0);
    return {
      month: `${m.month}`.padStart(2, "0"),
      year: m.year,
      total: monthGross - monthCredits + monthDebits,
    };
  });

  // --- revenue by type -----------------------------------------------------
  const typeMap = new Map<string, { count: number; total: number }>();
  const bump = (type: string, count: number, total: number) => {
    const existing = typeMap.get(type) || { count: 0, total: 0 };
    existing.count += count;
    existing.total += total;
    typeMap.set(type, existing);
  };
  for (const d of periodDocs) bump(d.doc_type, 1, d.total_amount || net(d));
  for (const d of periodCredits) bump(d.doc_type, 1, -gross(d));
  for (const d of periodDebits) bump(d.doc_type, 1, gross(d));
  const byType: RevenueByType[] = [...typeMap.entries()]
    .map(([docType, { count, total }]) => ({
      docType,
      label: labels[docType] || docType,
      count,
      total,
    }))
    .sort((a, b) => b.total - a.total);

  // --- top customers -------------------------------------------------------
  const custMap = new Map<string, TopCustomer>();
  for (const d of periodDocs) {
    const cid = d.customer_id;
    if (!cid) continue;
    const existing = custMap.get(cid) || {
      customerId: cid,
      name: d.customer?.name || "ไม่ระบุ",
      total: 0,
      count: 0,
    };
    existing.total += d.total_amount || net(d);
    existing.count++;
    custMap.set(cid, existing);
  }
  const topCustomers = [...custMap.values()].sort((a, b) => b.total - a.total);

  // --- period-over-period delta -------------------------------------------
  const prevWindow = getPreviousPeriodRange(start, end);
  let revenueDelta: number | null = null;
  if (prevWindow) {
    const prevDocs = recognized.filter((d) =>
      inRange(getRecognitionDate(d), prevWindow.start, prevWindow.end),
    );
    const prevRevenue =
      prevDocs.reduce((sum, d) => sum + (d.total_amount || net(d)), 0) -
      adjustmentsIn(creditNotes)
        .filter((d) => inRange(d.issue_date, prevWindow.start, prevWindow.end))
        .reduce((sum, d) => sum + gross(d), 0) +
      adjustmentsIn(debitNotes)
        .filter((d) => inRange(d.issue_date, prevWindow.start, prevWindow.end))
        .reduce((sum, d) => sum + gross(d), 0);
    // A percentage change from a zero or negative base is not meaningful.
    revenueDelta = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;
  }

  // Share of this period's invoicing that has actually been collected.
  const collectionRate = revenue > 0 ? collected / revenue : 0;

  return {
    summary,
    trend,
    arAging: buckets,
    arByCustomer,
    arDetails,
    byType,
    topCustomers,
    revenueDelta,
    collectionRate,
    customerCreditTotal: [...customerCredit.values()].reduce((sum, v) => sum + v, 0),
    customerCreditByCustomer: [...customerCredit.entries()].map(([customerId, total]) => ({
      customerId,
      total,
    })),
  };
}
