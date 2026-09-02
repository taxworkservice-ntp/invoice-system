// Manual stage override for deals.
//
// Deal stages on the home page are derived from document state. When reality
// drifts (e.g. work moved on but no document event fired), officers can pin a
// deal to one of these stages manually; "done" is excluded because completion
// is factual, derived from document state only.

export const MANUAL_STAGES = [
  "wait_send",
  "wait_invoice",
  "wait_collect",
  "partial",
  "progress",
] as const;

export type ManualStage = (typeof MANUAL_STAGES)[number];

export const MANUAL_STAGE_LABELS: Record<ManualStage, string> = {
  wait_send: "รอส่งเอกสาร",
  wait_invoice: "รอออกใบแจ้งหนี้",
  wait_collect: "รอรับเงิน",
  partial: "ชำระบางส่วน",
  progress: "กำลังดำเนินการ",
};

export function isManualStage(value: unknown): value is ManualStage {
  return typeof value === "string" && (MANUAL_STAGES as readonly string[]).includes(value);
}

// Financial/delivery documents whose customer binding is tax- or
// delivery-relevant — once issued they lock the deal's customer.
const CUSTOMER_LOCKING_DOC_TYPES = [
  "quotation",
  "invoice",
  "delivery_note",
  "receipt",
  "billing_note",
  "credit_note",
] as const;

export type CustomerLockDoc = Pick<
  { doc_type: string; status: string; doc_number?: string | null },
  "doc_type" | "status"
> & { doc_number?: string | null };

export function findCustomerLockingDocs<T extends CustomerLockDoc>(docs: T[]): T[] {
  return docs.filter(
    (doc) =>
      (CUSTOMER_LOCKING_DOC_TYPES as readonly string[]).includes(doc.doc_type) &&
      !["draft", "voided"].includes(doc.status),
  );
}
