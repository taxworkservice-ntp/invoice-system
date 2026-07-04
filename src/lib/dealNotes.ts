import { supabase } from "./supabase";

export async function insertDealNote(dealId: string, userId: string, content: string) {
  if (!dealId || !userId || !content) return;
  await supabase.from("deal_notes").insert({
    deal_id: dealId,
    user_id: userId,
    content,
  }).then(({ error }) => {
    if (error) console.warn("[dealNotes] auto-note insert failed:", error.message);
  });
}

export function formatDocActionNote(docType: string, docNumber: string | null, action: string): string {
  const typeLabel = docType === "invoice" ? "ใบแจ้งหนี้"
    : docType === "quotation" ? "ใบเสนอราคา"
    : docType === "billing_note" ? "ใบวางบิล"
    : docType === "delivery_note" ? "ใบส่งของ"
    : docType === "receipt" ? "ใบเสร็จรับเงิน"
    : docType === "tax_invoice_receipt" ? "ใบกำกับภาษี/ใบเสร็จ"
    : docType === "credit_note" ? "ใบลดหนี้"
    : docType;
  const num = docNumber || "ใหม่";
  return `${typeLabel} ${num} ${action}`;
}
