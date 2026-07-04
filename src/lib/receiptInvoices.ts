import type { Document, ReceiptInvoice } from "../types";
import { supabase } from "./supabase";

export type ReceiptInvoiceSource = Pick<
  Document,
  "id" | "doc_number" | "issue_date" | "subtotal" | "vat_amount" | "total_amount" | "net_payable"
>;

export async function getReceiptInvoiceSources(sourceDocument: Document, userId: string) {
  if (sourceDocument.doc_type === "billing_note") {
    const { data: links, error: linkError } = await supabase
      .from("billing_note_invoices")
      .select("invoice_id")
      .eq("billing_note_id", sourceDocument.id);
    if (linkError) throw linkError;

    const invoiceIds = (links || []).map((link) => link.invoice_id).filter(Boolean);
    if (invoiceIds.length === 0) return [];

    const { data: invoices, error: invoiceError } = await supabase
      .from("documents")
      .select("id, doc_number, issue_date, subtotal, vat_amount, total_amount, net_payable")
      .eq("user_id", userId)
      .in("id", invoiceIds)
      .in("doc_type", ["invoice", "tax_invoice_receipt"])
      .order("issue_date", { ascending: true });
    if (invoiceError) throw invoiceError;

    return (invoices || []) as ReceiptInvoiceSource[];
  }

  if (sourceDocument.doc_type === "invoice" || sourceDocument.doc_type === "tax_invoice_receipt") {
    return [sourceDocument as ReceiptInvoiceSource];
  }

  return [];
}

export function buildReceiptInvoiceRecords({
  receiptId,
  userId,
  sourceDocument,
  invoices,
}: {
  receiptId: string;
  userId: string;
  sourceDocument: Document;
  invoices: ReceiptInvoiceSource[];
}): Omit<ReceiptInvoice, "id" | "created_at">[] {
  const sourceBillingNoteId = sourceDocument.doc_type === "billing_note" ? sourceDocument.id : null;
  return invoices.map((invoice) => ({
    receipt_id: receiptId,
    invoice_id: invoice.id,
    source_billing_note_id: sourceBillingNoteId,
    user_id: userId,
    invoice_number: invoice.doc_number || invoice.id.slice(0, 8),
    issue_date: invoice.issue_date || null,
    subtotal: invoice.subtotal || 0,
    vat_amount: invoice.vat_amount || 0,
    total_amount: invoice.total_amount || 0,
    paid_amount: invoice.net_payable || invoice.total_amount || 0,
  }));
}
