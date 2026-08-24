import type { DocumentStatus } from "../types";
import { supabase } from "./supabase";
import {
  buildReceiptInvoiceRecords,
  getReceiptInvoiceSources,
} from "./receiptInvoices";
import { getReceiptTotalsForDocument } from "./receiptTotals";

/**
 * Applies the financial side effects of confirming a DRAFT receipt:
 *  1. Accumulate amount_received on the source document and flip it
 *     paid/partially_paid
 *  2. Sync linked invoices when the source is a billing note
 *  3. Create receipt_invoices links (drafts store none)
 *  4. Mark the receipt "generated"
 *
 * The receipt keeps its doc number and payment details from draft time.
 */
export async function confirmDraftReceipt(
  receiptId: string,
  userId: string,
): Promise<void> {
  const { data: receipt, error: receiptError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", receiptId)
    .single();

  if (receiptError || !receipt) throw new Error("ไม่พบใบเสร็จ");
  if (receipt.doc_type !== "receipt") throw new Error("เอกสารนี้ไม่ใช่ใบเสร็จ");
  if (receipt.status !== "draft") throw new Error("ใบเสร็จนี้ถูกยืนยันไปแล้ว");

  const sourceId = receipt.converted_from_id as string | null;
  if (!sourceId) throw new Error("ใบเสร็จนี้ไม่มีเอกสารอ้างอิง");

  const { data: source, error: sourceError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", sourceId)
    .single();
  if (sourceError || !source) throw new Error("ไม่พบเอกสารอ้างอิงของใบเสร็จ");

  // Confirmed receipts only — drafts are promises, not money.
  const previousTotals = await getReceiptTotalsForDocument(source, userId);
  const previousTotal = previousTotals.preTaxAmount;
  const remaining = Math.max(0, (source.subtotal || 0) - previousTotal);
  const receiptPreTax = Number(receipt.subtotal) || 0;

  if (receiptPreTax > remaining + 0.01) {
    throw new Error(
      `ยอดในใบเสร็จเกินยอดค้างชำระ ฿${Math.max(0, remaining).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`,
    );
  }

  const newTotal = previousTotal + receiptPreTax;
  const isFullyPaid = newTotal >= ((source.subtotal || 0) - 0.01);
  const sourceStatus: DocumentStatus = isFullyPaid ? "paid" : "partially_paid";
  const paidAt = receipt.paid_at || new Date().toISOString();

  // 1. Source document accumulates the confirmed payment.
  const { error: sourceUpdateError } = await supabase
    .from("documents")
    .update({
      status: sourceStatus,
      paid_at: paidAt,
      payment_method: receipt.payment_method,
      bank_account_id: receipt.bank_account_id,
      amount_received: previousTotals.amountReceived + (receipt.net_payable || 0),
      wht_certificate_no: receipt.wht_certificate_no || null,
    })
    .eq("id", sourceId);
  if (sourceUpdateError) throw sourceUpdateError;

  // 2. Billing-note case: sync its linked invoices.
  if (source.doc_type === "billing_note") {
    const { data: linked } = await supabase
      .from("billing_note_invoices")
      .select("invoice_id")
      .eq("billing_note_id", sourceId);

    const linkedInvoiceIds = (linked || []).map((item: any) => item.invoice_id);
    if (linkedInvoiceIds.length > 0) {
      const { error: linkedUpdateError } = await supabase
        .from("documents")
        .update({ status: (isFullyPaid ? "paid" : "in_billing") as DocumentStatus, paid_at: paidAt })
        .in("id", linkedInvoiceIds);
      if (linkedUpdateError) throw linkedUpdateError;
    }
  }

  // 3. Receipt-invoice links (created here, not at draft time).
  const { data: existingLinks } = await supabase
    .from("receipt_invoices")
    .select("id")
    .eq("receipt_id", receiptId)
    .limit(1);

  if (!existingLinks || existingLinks.length === 0) {
    const invoiceSources = await getReceiptInvoiceSources(source, userId);
    if (invoiceSources.length > 0) {
      const { error: linkError } = await supabase.from("receipt_invoices").insert(
        buildReceiptInvoiceRecords({
          receiptId,
          userId,
          sourceDocument: source,
          invoices: invoiceSources,
          actualPaidAmount: Number(receipt.net_payable) || 0,
        }),
      );
      if (linkError) throw linkError;
    }
  }

  // 4. Confirm the receipt itself.
  const { error: confirmError } = await supabase
    .from("documents")
    .update({ status: "generated" as DocumentStatus })
    .eq("id", receiptId);
  if (confirmError) throw confirmError;
}
