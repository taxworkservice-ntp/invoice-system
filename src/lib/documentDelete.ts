import { supabase } from "./supabase";
import { deleteDocumentFiles, deleteFromR2 } from "./r2";

/**
 * Deletes a DRAFT document and cleans up everything it owns.
 *
 * For billing-note drafts, linked invoices are released back to `sent`
 * ONLY from `in_billing` — so an invoice that was already paid while
 * sitting in a stale draft is never downgraded. Every draft-delete path
 * (document list, document detail, billing note form) must go through
 * this function.
 */
export async function deleteDraftDocument(doc: {
  id: string;
  doc_type: string;
}): Promise<void> {
  if (doc.doc_type === "billing_note") {
    const { data: links } = await supabase
      .from("billing_note_invoices")
      .select("invoice_id")
      .eq("billing_note_id", doc.id);
    const invoiceIds = (links || []).map((l) => l.invoice_id).filter(Boolean);
    if (invoiceIds.length > 0) {
      await supabase
        .from("documents")
        .update({ status: "sent" })
        .in("id", invoiceIds)
        .eq("status", "in_billing");
    }
    await supabase.from("billing_note_invoices").delete().eq("billing_note_id", doc.id);
  }

  // Best-effort cleanup of per-line example photos (R2 keys stored on lines).
  const { data: imageLines } = await supabase
    .from("document_line_items")
    .select("image_url")
    .eq("document_id", doc.id)
    .not("image_url", "is", null);
  for (const line of imageLines || []) {
    if (line.image_url) await deleteFromR2(line.image_url).catch(() => undefined);
  }

  await supabase.from("document_line_items").delete().eq("document_id", doc.id);
  await deleteDocumentFiles(doc.id);
  await supabase.from("documents").delete().eq("id", doc.id);
}
