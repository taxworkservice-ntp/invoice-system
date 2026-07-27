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
  actualPaidAmount,
}: {
  receiptId: string;
  userId: string;
  sourceDocument: Document;
  invoices: ReceiptInvoiceSource[];
  actualPaidAmount: number;
}): Omit<ReceiptInvoice, "id" | "created_at">[] {
  const sourceBillingNoteId = sourceDocument.doc_type === "billing_note" ? sourceDocument.id : null;
  const totalInvoiceAmounts = invoices.reduce((sum, inv) => sum + (inv.net_payable || inv.total_amount || 0), 0);
  return invoices.map((invoice, i) => {
    const invoiceTotal = invoice.net_payable || invoice.total_amount || 0;
    const ratio = totalInvoiceAmounts > 0 ? invoiceTotal / totalInvoiceAmounts : 1 / invoices.length;
    const allocated = i === invoices.length - 1
      ? actualPaidAmount - invoices.slice(0, -1).reduce((s, inv, j) => {
          const it = inv.net_payable || inv.total_amount || 0;
          return s + Math.round((actualPaidAmount * it / totalInvoiceAmounts) * 100) / 100;
        }, 0)
      : Math.round((actualPaidAmount * ratio) * 100) / 100;
    return {
      receipt_id: receiptId,
      invoice_id: invoice.id,
      source_billing_note_id: sourceBillingNoteId,
      user_id: userId,
      invoice_number: invoice.doc_number || invoice.id.slice(0, 8),
      issue_date: invoice.issue_date || null,
      subtotal: invoice.subtotal || 0,
      vat_amount: invoice.vat_amount || 0,
      total_amount: invoice.total_amount || 0,
      paid_amount: Math.max(0, allocated),
    };
  });
}
