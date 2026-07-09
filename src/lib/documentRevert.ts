import { supabase } from "./supabase";
import { voidDocumentWithSideEffects } from "./documentVoid";

export async function revertDeal(dealId: string, userId: string): Promise<void> {
  const { data: docs, error: fetchErr } = await supabase
    .from("documents")
    .select("id, status, doc_type, converted_from_id")
    .eq("deal_id", dealId);

  if (fetchErr || !docs || docs.length === 0) return;

  const docIds = docs.map((d) => d.id);

  for (const doc of docs) {
    if (doc.status !== "voided") {
      await voidDocumentWithSideEffects(doc, userId);
    }
  }

  await supabase.from("billing_note_invoices").delete().in("billing_note_id", docIds);
  await supabase.from("billing_note_invoices").delete().in("invoice_id", docIds);
  await supabase.from("receipt_invoices").delete().in("receipt_id", docIds);
  await supabase.from("receipt_invoices").delete().in("invoice_id", docIds);
  await supabase.from("invoice_delivery_notes").delete().in("delivery_note_id", docIds);
  await supabase.from("invoice_delivery_notes").delete().in("invoice_id", docIds);
  await supabase.from("stock_movements").delete().in("document_id", docIds);

  await supabase.from("documents").delete().in("id", docIds);

  await supabase.from("deals").delete().eq("id", dealId);
}
