/**
 * Receivable primitives — one definition of *what* a receivable is, shared by
 * every page that reports "ค้างชำระ".
 *
 * The app previously had four independent definitions
 * (`dealFinancials.ts`, `customers/[id].tsx`, `useDeals.ts`,
 * `reports/financialModel.ts`) which disagreed on the document types that
 * count, the statuses that count, and whether an adjustment note reduces a debt
 * by its gross or its net. They now share these ingredients; only the
 * aggregation granularity differs (a deal picks one source document, a customer
 * or the workspace sums every open document).
 */

/** Only documents that represent money to collect. A receipt is cash, never AR. */
export const RECEIVABLE_DOC_TYPES = ["invoice", "tax_invoice_receipt", "billing_note"] as const;

/** A receivable is open in these statuses. `in_billing` is not: the billing note carries it. */
export const RECEIVABLE_STATUSES = ["sent", "overdue", "partially_paid"] as const;

/** Adjustment notes in these statuses have no effect on money. */
export const INACTIVE_ADJUSTMENT_STATUSES = ["draft", "voided"] as const;

/** Documents that can carry a deal's collection amount. */
export const COLLECTION_DOC_TYPES = ["billing_note", "invoice", "tax_invoice_receipt"] as const;

export const ADJUSTMENT_DOC_TYPES = ["credit_note", "debit_note"] as const;

export interface ReceivableDocLike {
  doc_type: string;
  status: string;
  total_amount?: number | null;
  net_payable?: number | null;
  amount_received?: number | null;
}

export function isReceivableDoc(doc: ReceivableDocLike): boolean {
  return (
    (RECEIVABLE_DOC_TYPES as readonly string[]).includes(doc.doc_type) &&
    (RECEIVABLE_STATUSES as readonly string[]).includes(doc.status)
  );
}

export function isActiveAdjustmentNote(doc: ReceivableDocLike): boolean {
  return (
    (ADJUSTMENT_DOC_TYPES as readonly string[]).includes(doc.doc_type) &&
    !(INACTIVE_ADJUSTMENT_STATUSES as readonly string[]).includes(doc.status)
  );
}

/**
 * What the customer still owes on this document, in cash.
 *
 * Always net of WHT and of anything already received — a receivable is settled
 * in cash after tax is withheld, so `net_payable` is the right basis.
 */
export function receivableAmount(doc: ReceivableDocLike): number {
  return Math.max(0, (doc.net_payable ?? 0) - (doc.amount_received ?? 0));
}

/**
 * Net effect of a single adjustment note on money owed.
 *
 * Credit notes release their **own** WHT, so only their net reduces the debt
 * (`total_amount` would over-reduce). Debits add their net. Matches
 * `dealFinancials.ts` (`afterAdjustment = netPayable + debitNet − creditNet`).
 */
export function adjustmentNet(doc: ReceivableDocLike): number {
  if (!isActiveAdjustmentNote(doc)) return 0;
  const net = doc.net_payable ?? 0;
  return doc.doc_type === "credit_note" ? -net : net;
}

export function netAdjustmentTotal(docs: ReceivableDocLike[]): number {
  return docs.reduce((sum, doc) => sum + adjustmentNet(doc), 0);
}

/**
 * Outstanding balance for one deal's documents.
 *
 * Collection documents are the billing notes when the deal has any (they
 * supersede the individual invoices), otherwise its invoices. Credit and debit
 * notes are then netted on their net amounts. Voided documents are ignored.
 */
export function dealOutstanding(docs: ReceivableDocLike[]): number {
  const active = docs.filter((doc) => doc.status !== "voided");
  const billingNotes = active.filter((doc) => doc.doc_type === "billing_note");
  const collectionDocs =
    billingNotes.length > 0
      ? billingNotes
      : active.filter((doc) => (COLLECTION_DOC_TYPES as readonly string[]).includes(doc.doc_type));

  const gross = collectionDocs.reduce(
    (sum, doc) => (isReceivableDoc(doc) ? sum + receivableAmount(doc) : sum),
    0,
  );

  return Math.max(0, gross + netAdjustmentTotal(active));
}
