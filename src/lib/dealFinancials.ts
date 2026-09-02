
/**
 * Structural subset used by the money math — full Document rows and
 * narrower dashboard picks both satisfy it.
 */
export interface FinancialsDocLike {
  status: string;
  doc_type: string;
  total_amount?: number | null;
  vat_amount?: number | null;
  wht_amount?: number | null;
  net_payable?: number | null;
  amount_received?: number | null;
}

export interface DealFinancialSummary {
  /** Invoice total incl. VAT (ยอดรวม) */
  grossAmount: number;
  /** Source-document amount before VAT (ยอดก่อน VAT) */
  subtotalBeforeVat: number;
  /** Source-document VAT amount */
  vatAmount: number;
  /** Invoice net payable after WHT (ยอดสุทธิตามเอกสาร) */
  netPayable: number;
  /** Cash actually received per receipts / source documents */
  amountReceived: number;
  /** Unpaid portion after adjustments */
  outstanding: number;
  /** Net payable + debit nets − credit nets */
  afterAdjustment: number;
  /** Active credit-note totals incl. VAT */
  creditTotal: number;
  /** Active credit-note totals NET of their own WHT — the real cash effect */
  creditNet: number;
  /** WHT stated on active credit notes (released back to the customer) */
  creditWht: number;
  /** Active debit-note totals incl. VAT */
  debitTotal: number;
  /** Active debit-note totals NET of their own WHT */
  debitNet: number;
  /** WHT stated on active debit notes */
  debitWht: number;
  /** Cash received beyond what remains due (refundable/offsettable) */
  customerCredit: number;
  /** WHT accumulated from actual receipts (proportional) */
  whtAmount: number;
  /** WHT stated on the source invoice */
  expectedWhtAmount: number;
  /** doc_type of the document the amounts come from (null = no documents) */
  sourceDocType: string | null;
  /** A real collection document exists (billing note / invoice) */
  hasCollectionDoc: boolean;
  receiptCount: number;
}

const COLLECTION_TYPES = ["billing_note", "invoice"];
const RECEIPT_STATUSES = ["generated", "issued", "paid"];
const ADJUSTMENT_STATUSES_EXCLUDED = ["draft"];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Order-independent money reconciliation for a deal.
 *
 *   due after adjustment = net payable + debits − credits
 *   outstanding          = unpaid portion of that
 *   customer credit      = cash received beyond it (e.g. a credit note
 *                          issued against a fully-paid invoice)
 *
 * Callers may pass every document of the deal; voided rows are ignored here.
 * `fallbackSource` is the deal's display-amount document used when no
 * collection document exists yet.
 */
export function computeDealFinancialSummary(
  documents: FinancialsDocLike[],
  fallbackSource?: FinancialsDocLike | null,
): DealFinancialSummary {
  const active = documents.filter((doc) => doc.status !== "voided");

  const collectionDocs = active.filter((doc) =>
    COLLECTION_TYPES.includes(doc.doc_type),
  );
  const creditNoteDocs = active.filter(
    (doc) => doc.doc_type === "credit_note" && !ADJUSTMENT_STATUSES_EXCLUDED.includes(doc.status),
  );
  const debitNoteDocs = active.filter(
    (doc) => doc.doc_type === "debit_note" && !ADJUSTMENT_STATUSES_EXCLUDED.includes(doc.status),
  );
  const creditTotal = creditNoteDocs.reduce((sum, d) => sum + (d.total_amount || 0), 0);
  const creditNet = creditNoteDocs.reduce((sum, d) => sum + (d.net_payable || 0), 0);
  const creditWht = creditNoteDocs.reduce((sum, d) => sum + (d.wht_amount || 0), 0);
  const debitTotal = debitNoteDocs.reduce((sum, d) => sum + (d.total_amount || 0), 0);
  const debitNet = debitNoteDocs.reduce((sum, d) => sum + (d.net_payable || 0), 0);
  const debitWht = debitNoteDocs.reduce((sum, d) => sum + (d.wht_amount || 0), 0);

  const source =
    collectionDocs.find((d) => d.doc_type === "billing_note") ||
    collectionDocs.find((d) => d.doc_type === "invoice") ||
    fallbackSource ||
    null;

  const grossAmount = source?.total_amount || 0;
  const vatAmount = source?.vat_amount || 0;
  const subtotalBeforeVat = round2(grossAmount - vatAmount);
  const netPayable = source?.net_payable || 0;

  const receipts = active.filter(
    (doc) => doc.doc_type === "receipt" && RECEIPT_STATUSES.includes(doc.status),
  );
  const receiptReceived = receipts.reduce((sum, d) => sum + (d.amount_received || 0), 0);

  const sourceGroup = collectionDocs.some((d) => d.doc_type === "billing_note")
    ? collectionDocs.filter((d) => d.doc_type === "billing_note")
    : collectionDocs.filter((d) => d.doc_type === "invoice");
  const sourceReceived = sourceGroup.reduce((sum, d) => sum + (d.amount_received || 0), 0);

  const amountReceived = Math.max(receiptReceived, sourceReceived);
  const expectedWhtAmount = source?.wht_amount || 0;
  // Recalculate accumulated WHT from the source document and collected amount
  // so legacy receipts do not distort the completed-deal summary.
  const whtAmount =
    expectedWhtAmount > 0 && netPayable > 0
      ? Math.min(expectedWhtAmount, round2((expectedWhtAmount * amountReceived) / netPayable))
      : 0;

  // Adjustment notes are reconciled on their NET amounts (gross incl. VAT
  // minus the WHT they release), matching the invoice's net basis:
  //   a CN of gross 139,100 with WHT 3,900 reduces the due by 135,200.
  const afterAdjustment = round2(netPayable + debitNet - creditNet);
  const dueAfterAdjustment = Math.max(0, afterAdjustment);
  const outstanding = Math.max(0, dueAfterAdjustment - amountReceived);
  const customerCredit = Math.max(0, round2(amountReceived - dueAfterAdjustment));

  return {
    grossAmount,
    subtotalBeforeVat,
    vatAmount,
    netPayable,
    amountReceived,
    outstanding,
    afterAdjustment,
    creditTotal,
    creditNet,
    creditWht,
    debitTotal,
    debitNet,
    debitWht,
    customerCredit,
    whtAmount,
    expectedWhtAmount,
    sourceDocType: source?.doc_type ?? null,
    hasCollectionDoc: collectionDocs.length > 0,
    receiptCount: receipts.length,
  };
}
