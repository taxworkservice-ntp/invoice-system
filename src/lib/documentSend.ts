import type { Document, DocumentStatus } from "../types";
import { deductStockOnDocumentSent, restoreStockOnVoid, type StockWarning } from "./stock";
import { supabase } from "./supabase";

type SendableDocument = Pick<Document, "id" | "doc_type">;

export interface SendDocumentResult {
  status: DocumentStatus;
  warnings: StockWarning[];
}

interface SendDocumentOptions {
  issueDate?: string;
}

function getSentStatus(document: SendableDocument): DocumentStatus {
  return document.doc_type === "tax_invoice_receipt" ? "issued" : "sent";
}

function canCreateStockMovement(document: SendableDocument): boolean {
  return (
    document.doc_type === "invoice" ||
    document.doc_type === "delivery_note" ||
    document.doc_type === "tax_invoice_receipt"
  );
}

export async function sendDocumentWithSideEffects(
  document: SendableDocument,
  userId: string,
  options: SendDocumentOptions = {},
): Promise<SendDocumentResult> {
  const targetStatus = getSentStatus(document);
  const stockResult = canCreateStockMovement(document)
    ? await deductStockOnDocumentSent(document.id, userId)
    : { warnings: [], movementCreated: false };

  const { error } = await supabase
    .from("documents")
    .update({
      status: targetStatus,
      ...(options.issueDate ? { issue_date: options.issueDate } : {}),
      is_blank_form: false,
    })
    .eq("id", document.id);

  if (error) {
    if (stockResult.movementCreated) {
      await restoreStockOnVoid(document.id, userId);
    }
    throw error;
  }

  return { status: targetStatus, warnings: stockResult.warnings };
}
