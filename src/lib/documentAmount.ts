import type { Document } from "../types";

type AmountDoc = Pick<Document, "doc_type" | "total_amount" | "net_payable">;

export function getDocumentAmount(doc: AmountDoc): number {
  if (
    doc.doc_type === "quotation" ||
    doc.doc_type === "invoice" ||
    doc.doc_type === "delivery_note"
  ) {
    return doc.total_amount;
  }
  return doc.net_payable;
}
