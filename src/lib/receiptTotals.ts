import type { Document } from "../types";
import { supabase } from "./supabase";

export interface ReceiptTotals {
  preTaxAmount: number;
  grossAmount: number;
  amountReceived: number;
  whtAmount: number;
}

export async function getReceiptTotalsForDocument(sourceDocument: Document, userId: string): Promise<ReceiptTotals> {
  const sourceIds = [sourceDocument.id];
  let invoiceIds: string[] = [];

  if (sourceDocument.doc_type === "billing_note") {
    const { data, error } = await supabase
      .from("billing_note_invoices")
      .select("invoice_id")
      .eq("billing_note_id", sourceDocument.id)
      .eq("user_id", userId);
    if (error) throw error;
    invoiceIds = (data || []).map((link) => link.invoice_id).filter(Boolean);
  } else if (sourceDocument.doc_type === "invoice" || sourceDocument.doc_type === "tax_invoice_receipt") {
    invoiceIds = [sourceDocument.id];
  }

  const receiptIds = new Set<string>();
  const { data: directReceipts, error: directError } = await supabase
    .from("documents")
    .select("id")
    .eq("user_id", userId)
    .in("converted_from_id", sourceIds)
    .eq("doc_type", "receipt")
    .neq("status", "voided");
  if (directError) throw directError;
  for (const receipt of directReceipts || []) receiptIds.add(receipt.id);

  if (invoiceIds.length > 0) {
    const { data: linkedReceipts, error: linkedError } = await supabase
      .from("receipt_invoices")
      .select("receipt_id")
      .eq("user_id", userId)
      .in("invoice_id", invoiceIds);
    if (linkedError) throw linkedError;
    for (const receipt of linkedReceipts || []) {
      if (receipt.receipt_id) receiptIds.add(receipt.receipt_id);
    }
  }

  if (receiptIds.size === 0) return { preTaxAmount: 0, grossAmount: 0, amountReceived: 0, whtAmount: 0 };

  const { data: receipts, error: receiptError } = await supabase
    .from("documents")
    .select("subtotal, total_amount, amount_received, wht_amount")
    .eq("user_id", userId)
    .in("id", Array.from(receiptIds))
    .eq("doc_type", "receipt")
    .neq("status", "voided");
  if (receiptError) throw receiptError;

  return (receipts || []).reduce(
    (totals, receipt) => ({
      preTaxAmount: totals.preTaxAmount + (receipt.subtotal || 0),
      grossAmount: totals.grossAmount + (receipt.total_amount || 0),
      amountReceived: totals.amountReceived + (receipt.amount_received || 0),
      whtAmount: totals.whtAmount + (receipt.wht_amount || 0),
    }),
    { preTaxAmount: 0, grossAmount: 0, amountReceived: 0, whtAmount: 0 },
  );
}
