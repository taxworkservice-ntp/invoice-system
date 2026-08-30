import type { Document, DocumentStatus } from "../types";
import { restoreStockOnVoid, reverseStockOnCreditNoteVoid } from "./stock";
import { supabase } from "./supabase";

type VoidableDocument = Pick<Document, "id" | "doc_type" | "converted_from_id">;

export async function voidDocumentWithSideEffects(
  document: VoidableDocument,
  userId: string,
  reason?: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .update({
      status: "voided" as DocumentStatus,
      voided_at: new Date().toISOString(),
      voided_reason: reason || null,
    })
    .eq("id", document.id);

  if (error) throw error;

  await restoreStockOnVoid(document.id, userId);

  if (document.doc_type === "credit_note") {
    // A credit note returned stock at issue time; voiding reverses that return.
    // (restoreStockOnVoid above is a no-op here — credit notes never had auto_out.)
    await reverseStockOnCreditNoteVoid(document.id, userId);
  }

  if (document.doc_type === "billing_note") {
    await releaseInvoicesFromBillingNote(document.id);
  }

  if (document.doc_type === "receipt") {
    await releaseInvoicesFromReceipt(document.id);
  }

  if (document.doc_type === "invoice") {
    // Restore every source (quotations/DNs traced via line items, links and
    // converted_from_id) — transactional RPC, see
    // supabase/migrations/20260830144000_revert_invoice_sources_rpc.sql.
    const { error: revertError } = await supabase.rpc("revert_invoice_sources", {
      p_invoice_id: document.id,
      p_user_id: userId,
    });
    if (revertError) throw revertError;
  }
}

async function releaseInvoicesFromReceipt(receiptId: string): Promise<void> {
  const { data: links, error } = await supabase
    .from("receipt_invoices")
    .select("invoice_id, source_billing_note_id")
    .eq("receipt_id", receiptId);

  if (error) throw error;

  const invoiceIds = (links || [])
    .map((link) => link.invoice_id)
    .filter(Boolean);
  if (invoiceIds.length === 0) return;

  const billingNoteIds = Array.from(new Set(
    (links || [])
      .map((link) => link.source_billing_note_id)
      .filter(Boolean),
  ));

  const invoiceStatus = billingNoteIds.length > 0 ? "in_billing" : "sent";
  const { error: invoiceError } = await supabase
    .from("documents")
    .update({ status: invoiceStatus as DocumentStatus, paid_at: null })
    .in("id", invoiceIds)
    .in("status", ["paid", "partially_paid"]);

  if (invoiceError) throw invoiceError;

  if (billingNoteIds.length > 0) {
    const { error: billingError } = await supabase
      .from("documents")
      .update({ status: "sent" as DocumentStatus, paid_at: null })
      .in("id", billingNoteIds)
      .in("status", ["paid", "partially_paid"]);

    if (billingError) throw billingError;
  }
}

async function releaseInvoicesFromBillingNote(billingNoteId: string): Promise<void> {
  const { data: links, error } = await supabase
    .from("billing_note_invoices")
    .select("invoice_id")
    .eq("billing_note_id", billingNoteId);

  if (error) throw error;

  const invoiceIds = (links || [])
    .map((link) => link.invoice_id)
    .filter(Boolean);

  if (invoiceIds.length === 0) return;

  // Release this billing note's links so the invoice can be re-billed
  // (the DB guard only blocks invoices that still have an active link).
  const { error: releaseError } = await supabase
    .from("billing_note_invoices")
    .update({ released_at: new Date().toISOString() })
    .eq("billing_note_id", billingNoteId);

  if (releaseError) throw releaseError;

  const { error: updateError } = await supabase
    .from("documents")
    .update({ status: "sent" as DocumentStatus })
    .in("id", invoiceIds)
    .eq("status", "in_billing");

  if (updateError) throw updateError;
}
