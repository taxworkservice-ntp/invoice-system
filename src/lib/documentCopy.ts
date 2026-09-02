// Shared "duplicate document as draft" logic used by the document page,
// documents list menus, and deal-cloning flows.
//
// Lineage fields (source_document_id / source_line_item_id) are stripped so
// clones never corrupt partial-billing remaining math of their sources.

import { supabase } from "./supabase";
import { resolveDocNumber } from "./docNumber";
import { localTodayString } from "./devDate";
import type { Document, DocumentLineItem, DocumentStatus } from "../types";

export type CopyDocumentOptions = {
  /** Business-day issue date for the new draft. Defaults to today. */
  issueDate?: string;
  /** Place the draft in a different deal than the source (deal cloning). */
  dealId?: string | null;
  docNumberOverride?: string;
  /** Tag the copy with copied_from_id for traceability. Default true. */
  setCopiedFromId?: boolean;
};

function shiftDueDate(doc: Document, issueDate: string): string | null {
  if (!doc.due_date || !doc.issue_date) return null;
  const start = new Date(`${doc.issue_date}T00:00:00`);
  const end = new Date(`${doc.due_date}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const termDays = Math.round((end.getTime() - start.getTime()) / 86400000);
  // Pure calendar arithmetic on the date string — timezone-safe.
  const [y, m, d] = issueDate.split("-").map(Number);
  const next = new Date(y, m - 1, d);
  next.setDate(next.getDate() + Math.max(0, termDays));
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

export async function copyDocumentAsDraft(
  doc: Document,
  userId: string,
  opts: CopyDocumentOptions = {},
): Promise<{ data: Document; error: Error | null }> {
  try {
    const issueDate = opts.issueDate || localTodayString();
    const docNumber = await resolveDocNumber(userId, doc.doc_type, issueDate, opts.docNumberOverride);

    const isDn = doc.doc_type === "delivery_note";

    const payload: Record<string, unknown> = {
      user_id: userId,
      deal_id: opts.dealId !== undefined ? opts.dealId : doc.deal_id,
      customer_id: doc.customer_id,
      doc_type: doc.doc_type,
      doc_number: docNumber,
      status: "draft" as DocumentStatus,
      issue_date: issueDate,
      due_date: shiftDueDate(doc, issueDate),
      vat_registered: doc.vat_registered,
      vat_rate: doc.vat_rate,
      wht_rate: doc.wht_rate,
      discount_percent: doc.discount_percent,
      discount_amount: doc.discount_amount,
      subtotal: doc.subtotal,
      vat_amount: doc.vat_amount,
      total_amount: doc.total_amount,
      wht_amount: doc.wht_amount,
      net_payable: doc.net_payable,
      note: doc.note,
      customer_po_number: doc.customer_po_number,
      task_name: doc.task_name,
      payment_method: null,
      amount_received: null,
      paid_at: null,
      wht_certificate_no: null,
    };
    if (opts.setCopiedFromId !== false) {
      payload.copied_from_id = doc.id;
    }
    if (isDn) {
      payload.hide_amounts_on_print = doc.hide_amounts_on_print;
      payload.is_blank_form = doc.is_blank_form;
      payload.show_full_totals = doc.show_full_totals;
    }

    const { data: copy, error: insertError } = await supabase
      .from("documents")
      .insert(payload)
      .select("*")
      .single();
    if (insertError) throw insertError;

    let lineItems: DocumentLineItem[] = doc.line_items ?? [];
    if (!doc.line_items) {
      const { data: fetched } = await supabase
        .from("document_line_items")
        .select("*")
        .eq("document_id", doc.id)
        .order("sort_order", { ascending: true });
      lineItems = (fetched || []) as DocumentLineItem[];
    }

    // Drop zero-quantity "section header" rows (e.g. "ใบส่งของ DN-…") that
    // group lines on invoices built from delivery notes — they reference the
    // old deal's DNs and are meaningless in a fresh copy.
    lineItems = lineItems.filter(
      (li) =>
        !(
          !li.source_line_item_id &&
          li.source_document_id &&
          (Number(li.quantity) || 0) === 0 &&
          (Number(li.unit_price) || 0) === 0
        ),
    );

    if (lineItems.length > 0) {
      const { error: lineError } = await supabase.from("document_line_items").insert(
        lineItems.map((li, idx) => ({
          document_id: copy.id,
          user_id: userId,
          item_id: li.item_id,
          item_name: li.item_name,
          line_note: li.line_note || null,
          item_sku: li.item_sku,
          item_type: li.item_type,
          unit: li.unit,
          unit_price: li.unit_price,
          quantity: li.quantity,
          base_quantity: li.base_quantity,
          discount_percent: li.discount_percent,
          discount_amount: li.discount_amount,
          qty_carton: li.qty_carton,
          carton_unit: li.carton_unit,
          line_total: li.line_total,
          image_url: li.image_url || null,
          hide_amounts_on_print: li.hide_amounts_on_print,
          sort_order: idx,
        })),
      );
      if (lineError) throw lineError;
    }

    if (doc.doc_type === "billing_note") {
      const { data: links } = await supabase
        .from("billing_note_invoices")
        .select("*")
        .eq("billing_note_id", doc.id);
      if (links?.length) {
        await supabase.from("billing_note_invoices").insert(
          links.map((link: any) => ({
            billing_note_id: copy.id,
            invoice_id: link.invoice_id,
            user_id: userId,
            invoice_number: link.invoice_number,
            issue_date: link.issue_date || null,
            subtotal: link.subtotal,
            vat_amount: link.vat_amount,
            total_amount: link.total_amount,
          })),
        );
      }
    }

    return { data: copy as Document, error: null };
  } catch (err: any) {
    return { data: null as unknown as Document, error: err instanceof Error ? err : new Error(String(err?.message || err)) };
  }
}
