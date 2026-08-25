import { STATUS_LABELS } from "../constants";

/** Structural doc subset — full Document rows and dashboard picks satisfy it. */
export interface StatusDocLike {
  id: string;
  doc_type: string;
  status: string;
  due_date?: string | null;
  updated_at?: string;
  created_at?: string;
}

function todayStart(): Date {
  return new Date(new Date().toISOString().slice(0, 10));
}

/**
 * THE overdue rule — single source used by home, deal page and documents list.
 * A document is overdue when its due date has passed while still collectible:
 * sent / in_billing / partially_paid, or the DB cron already flagged it `overdue`.
 */
export function isDocumentOverdue(
  doc: Pick<StatusDocLike, "status" | "due_date"> | null,
): boolean {
  if (!doc) return false;
  if (doc.status === "overdue") return true;
  if (!doc.due_date) return false;
  const pastDue = new Date(doc.due_date) < todayStart();
  if (!pastDue) return false;
  return ["sent", "in_billing", "partially_paid"].includes(doc.status);
}

/** Newest-first ordering shared by surfaces listing a deal's documents. */
export function sortDocsNewestFirst<T extends StatusDocLike>(documents: T[]): T[] {
  return [...documents].sort((a, b) => {
    const updated = (b.updated_at || "").localeCompare(a.updated_at || "");
    if (updated !== 0) return updated;
    const created = (b.created_at || "").localeCompare(a.created_at || "");
    if (created !== 0) return created;
    return b.id.localeCompare(a.id);
  });
}

const AMOUNT_DOC_ORDER = [
  "billing_note",
  "invoice",
  "tax_invoice_receipt",
  "quotation",
  "delivery_note",
];

/**
 * Which document headlines the deal's money. Order: BN > INV > TIR > QT > DN,
 * newest within each type. Used identically on home and the deal page so both
 * always show the same amount.
 */
export function pickAmountDocument<T extends StatusDocLike>(documents: T[]): T | null {
  const sorted = sortDocsNewestFirst(documents.filter((doc) => doc.status !== "voided"));
  for (const type of AMOUNT_DOC_ORDER) {
    const found = sorted.find((doc) => doc.doc_type === type);
    if (found) return found;
  }
  return null;
}

/** Deal-page status pill (label + color classes), with the overdue override. */
export function getStatusPill(
  doc:
    | (Pick<StatusDocLike, "doc_type" | "status" | "due_date"> & { id?: string })
    | null,
): { label: string; className: string } {
  if (!doc) return { label: "ยังไม่มีเอกสาร", className: "bg-stone-100 text-stone-500" };
  if (doc.status === "draft") return { label: "ร่าง", className: "bg-draft-bg text-draft-text" };
  if (doc.status === "paid") return { label: "ชำระแล้ว", className: "bg-paid-bg text-paid-text" };
  if (doc.status === "partially_paid")
    return { label: "ชำระบางส่วน", className: "bg-amber-100 text-amber-700" };
  if (isDocumentOverdue(doc)) return { label: "เกินกำหนด", className: "bg-overdue-bg text-overdue-text" };
  if (doc.doc_type === "quotation" && doc.status === "sent")
    return { label: "รอลูกค้าตอบ", className: "bg-amber-100 text-amber-700" };
  if (doc.doc_type === "invoice" && (doc.status === "sent" || doc.status === "in_billing"))
    return { label: "รอวางบิล", className: "bg-sent-bg text-sent-text" };
  if (doc.doc_type === "billing_note" && doc.status === "sent")
    return { label: "รอชำระ", className: "bg-sent-bg text-sent-text" };
  return {
    label: STATUS_LABELS[doc.status as keyof typeof STATUS_LABELS] || doc.status,
    className: "bg-stone-100 text-stone-600",
  };
}
