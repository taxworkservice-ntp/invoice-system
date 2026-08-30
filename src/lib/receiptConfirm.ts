import { supabase } from "./supabase";

/**
 * Confirms a DRAFT receipt via the transactional RPC (see
 * supabase/migrations/20260830142000_confirm_draft_receipt_rpc.sql):
 *  1. Accumulate amount_received on the source document and flip it
 *     paid/partially_paid
 *  2. Sync linked invoices when the source is a billing note
 *  3. Create receipt_invoices links (drafts store none)
 *  4. Mark the receipt "generated"
 *
 * All four steps commit together or not at all, and the receipt + source are
 * row-locked so concurrent confirmations cannot double-count a payment.
 */
export async function confirmDraftReceipt(
  receiptId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase.rpc("confirm_draft_receipt", {
    p_receipt_id: receiptId,
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
}
