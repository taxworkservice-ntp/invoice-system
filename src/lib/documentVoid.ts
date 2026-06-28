import type { Document, DocumentStatus } from "../types";
import { restoreStockOnVoid } from "./stock";
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

  if (document.doc_type === "billing_note") {
    await releaseInvoicesFromBillingNote(document.id);
  }

  if (document.doc_type === "invoice" && document.converted_from_id) {
    await releaseDeliveryNoteFromInvoice(document.converted_from_id);
  }

  if (document.doc_type === "invoice") {
    await releaseDeliveryNotesFromInvoice(document.id);
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

  const { error: updateError } = await supabase
    .from("documents")
    .update({ status: "sent" as DocumentStatus })
    .in("id", invoiceIds)
    .eq("status", "in_billing");

  if (updateError) throw updateError;
}

async function releaseDeliveryNoteFromInvoice(deliveryNoteId: string): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .update({ status: "sent" as DocumentStatus })
    .eq("id", deliveryNoteId)
    .eq("doc_type", "delivery_note")
    .eq("status", "converted");

  if (error) throw error;
}

async function releaseDeliveryNotesFromInvoice(invoiceId: string): Promise<void> {
  const { data: links, error } = await supabase
    .from("invoice_delivery_notes")
    .select("delivery_note_id")
    .eq("invoice_id", invoiceId)
    .is("released_at", null);

  if (error) throw error;

  const deliveryNoteIds = (links || [])
    .map((link) => link.delivery_note_id)
    .filter(Boolean);

  if (deliveryNoteIds.length === 0) return;

  const releasedAt = new Date().toISOString();
  const { error: linkError } = await supabase
    .from("invoice_delivery_notes")
    .update({ released_at: releasedAt })
    .eq("invoice_id", invoiceId)
    .is("released_at", null);

  if (linkError) throw linkError;

  const { error: docError } = await supabase
    .from("documents")
    .update({ status: "sent" as DocumentStatus })
    .in("id", deliveryNoteIds)
    .eq("doc_type", "delivery_note")
    .eq("status", "converted");

  if (docError) throw docError;
}
