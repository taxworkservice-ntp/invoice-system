// Billing cross-references — how a deal's documents connect to the invoice
// that billed them (source deals) and which source deals an invoice combined
// (billing-run deals). Mirrors the ERP pattern of bidirectional references:
// source shows "billed in X", invoice shows "covers Y, Z". Documents are
// never moved between deals; only referenced.
//
// Traceability sources:
//   * delivery notes → invoice via invoice_delivery_notes junction (covers
//     both line-level and reference-mode billing),
//   * quotations / any other source → invoice lines' source_document_id.

import { supabase } from "./supabase";

export interface BillingRef {
  /** Deal the invoice/billing note lives in (the billing-run deal). */
  dealId: string;
  dealNumber: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string;
  /**
   * How this deal's document was billed elsewhere:
   *  - "invoice": DN/QT combined into another deal's invoice (รวมใบส่งของ → ออกบิล)
   *  - "billing_note": this deal's invoice held by another deal's billing note (รวมใบแจ้งหนี้ → ใบวางบิล)
   */
  kind: "invoice" | "billing_note";
}

/** Active (non-voided, non-draft) invoice statuses worth showing. */
const BILLABLE_INVOICE_STATUSES = ["sent", "in_billing", "partially_paid", "paid", "overdue"];

export function invoicePaymentLabel(status: string): string {
  if (status === "paid") return "ชำระแล้ว";
  if (status === "partially_paid") return "ชำระบางส่วน";
  return "รอชำระ";
}

export function invoicePaymentTone(status: string): "paid" | "partial" | "waiting" {
  if (status === "paid") return "paid";
  if (status === "partially_paid") return "partial";
  return "waiting";
}

/**
 * Workspace-wide map: source document id → the active invoice that billed it.
 * One junction query + one invoices-with-lines query, so it is cheap enough
 * for the home dashboard and reusable on the deal detail page.
 */
export async function fetchWorkspaceBillingRefs(
  userId: string,
): Promise<Map<string, BillingRef>> {
  const [linksRes, invoicesRes] = await Promise.all([
    supabase
      .from("invoice_delivery_notes")
      .select("delivery_note_id, invoice_id")
      .eq("user_id", userId)
      .is("released_at", null),
    supabase
      .from("documents")
      .select(
        // document_line_items has TWO FKs to documents (document_id and
        // source_document_id) — without the explicit FK hint PostgREST fails
        // the whole query with PGRST201 "more than one relationship".
        "id, doc_number, status, deal_id, deals(deal_number), document_line_items!document_line_items_document_id_fkey(source_document_id)",
      )
      .eq("user_id", userId)
      .eq("doc_type", "invoice")
      .in("status", BILLABLE_INVOICE_STATUSES),
  ]);

  const invoices = (invoicesRes.data || []) as unknown as Array<{
    id: string;
    doc_number: string | null;
    status: string;
    deal_id: string | null;
    deals?: { deal_number: string | null } | Array<{ deal_number: string | null }> | null;
    document_line_items?: Array<{ source_document_id: string | null }> | null;
  }>;
  const invoiceById = new Map(invoices.map((inv) => [inv.id, inv]));

  const refs = new Map<string, BillingRef>();
  const put = (docId: string, inv: (typeof invoices)[number], kind: BillingRef["kind"]) => {
    if (!inv.deal_id || refs.has(docId)) return;
    const deals = Array.isArray(inv.deals) ? inv.deals[0] : inv.deals;
    refs.set(docId, {
      dealId: inv.deal_id,
      dealNumber: deals?.deal_number ?? null,
      invoiceNumber: inv.doc_number,
      invoiceStatus: inv.status,
      kind,
    });
  };

  for (const inv of invoices) {
    for (const line of inv.document_line_items || []) {
      if (line.source_document_id) put(line.source_document_id, inv, "invoice");
    }
  }
  for (const link of (linksRes.data || []) as Array<{
    delivery_note_id: string;
    invoice_id: string;
  }>) {
    const inv = invoiceById.get(link.invoice_id);
    if (inv) put(link.delivery_note_id, inv, "invoice");
  }

  // Invoice → billing-note references: invoices held by an ACTIVE billing
  // note (รวมใบแจ้งหนี้ → ใบวางบิล) live in another deal until the note is
  // paid (then the invoices flip to paid and these refs stop mattering).
  const [bnLinksRes, bnDocsRes] = await Promise.all([
    supabase
      .from("billing_note_invoices")
      .select("invoice_id, billing_note_id")
      .eq("user_id", userId)
      .is("released_at", null),
    supabase
      .from("documents")
      .select("id, doc_number, status, deal_id, deals(deal_number)")
      .eq("user_id", userId)
      .eq("doc_type", "billing_note")
      .neq("status", "voided"),
  ]);
  const bnById = new Map(
    ((bnDocsRes.data || []) as unknown as Array<{
      id: string;
      doc_number: string | null;
      status: string;
      deal_id: string | null;
      deals?: { deal_number: string | null } | Array<{ deal_number: string | null }> | null;
    }>).map((bn) => [bn.id, bn]),
  );
  for (const link of (bnLinksRes.data || []) as Array<{
    invoice_id: string;
    billing_note_id: string;
  }>) {
    const bn = bnById.get(link.billing_note_id);
    if (bn) put(link.invoice_id, bn, "billing_note");
  }
  return refs;
}

/**
 * Source deals combined into a deal's invoice(s) — for billing-run deals.
 * Returns one entry per source deal (numbered deals only), excluding the
 * billing-run deal itself.
 */
export async function fetchSourceDealsForInvoices(
  userId: string,
  invoiceIds: string[],
  selfDealId: string | null,
): Promise<Array<{ dealId: string; dealNumber: string | null; invoiceNumber: string | null }>> {
  if (invoiceIds.length === 0) return [];

  const { data: lineRefs } = await supabase
    .from("document_line_items")
    .select("document_id, source_document_id")
    .in("document_id", invoiceIds)
    .not("source_document_id", "is", null);
  const sourceDocIds = Array.from(
    new Set((lineRefs || []).map((r) => r.source_document_id as string)),
  );
  if (sourceDocIds.length === 0) return [];

  const { data: sourceDocs } = await supabase
    .from("documents")
    .select("id, deal_id")
    .in("id", sourceDocIds)
    .eq("user_id", userId);
  const sourceDealIds = Array.from(
    new Set(
      (sourceDocs || [])
        .map((d) => (d as { deal_id: string | null }).deal_id)
        .filter((id): id is string => Boolean(id) && id !== selfDealId),
    ),
  );
  if (sourceDealIds.length === 0) return [];

  const [dealsRes, invoicesRes] = await Promise.all([
    supabase.from("deals").select("id, deal_number").in("id", sourceDealIds),
    supabase.from("documents").select("id, doc_number, deal_id").in("id", invoiceIds),
  ]);

  const dealNumberById = new Map(
    ((dealsRes.data || []) as Array<{ id: string; deal_number: string | null }>).map((d) => [
      d.id,
      d.deal_number,
    ]),
  );
  const invoiceNumberById = new Map(
    ((invoicesRes.data || []) as Array<{ id: string; doc_number: string | null; deal_id: string | null }>).map(
      (d) => [d.id, d.doc_number],
    ),
  );
  const docIdToInvoice = new Map(
    (lineRefs || []).map((r) => [r.source_document_id as string, r.document_id as string]),
  );

  const merged = new Map<
    string,
    { dealId: string; dealNumber: string | null; invoiceNumber: string | null }
  >();
  for (const dealId of sourceDealIds) {
    const docId = sourceDocIds.find((docId) => {
      const refDealId = (sourceDocs || []).find((d) => d.id === docId)?.deal_id;
      return refDealId === dealId;
    });
    const invoiceId = docId ? docIdToInvoice.get(docId) : undefined;
    merged.set(dealId, {
      dealId,
      dealNumber: dealNumberById.get(dealId) ?? null,
      invoiceNumber: invoiceId ? invoiceNumberById.get(invoiceId) ?? null : null,
    });
  }
  return Array.from(merged.values());
}
