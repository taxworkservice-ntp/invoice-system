import { supabase } from "./supabase";

export interface PriceHistoryRow {
  unitPrice: number;
  quantity: number;
  unit: string;
  discountPercent: number;
  documentId: string;
  docNumber: string | null;
  docType: string;
  /** Null for documents not attached to any deal (rare). */
  dealId: string | null;
  issueDate: string | null;
  createdAt: string;
  customerId: string | null;
  customerName: string | null;
}

export interface FetchPriceHistoryOptions {
  /** When set, only rows sold to this customer (server-side filter). */
  customerId?: string | null;
  limit?: number;
  /** Skip lines of the draft currently being edited. */
  excludeDocumentId?: string | null;
}

/** Short Thai badge label per doc type for history rows. */
export function priceHistoryDocTypeLabel(docType: string): string {
  switch (docType) {
    case "quotation":
      return "เสนอราคา";
    case "invoice":
      return "แจ้งหนี้";
    case "delivery_note":
      return "ส่งของ";
    default:
      return docType;
  }
}

interface RawHistoryDoc {
  doc_number: string | null;
  doc_type: string;
  deal_id: string | null;
  issue_date: string | null;
  customer_id: string | null;
  customers: { name: string | null } | { name: string | null }[] | null;
}

interface RawHistoryRow {
  document_id: string;
  unit_price: number | string | null;
  quantity: number | string | null;
  unit: string | null;
  discount_percent: number | string | null;
  created_at: string;
  documents: RawHistoryDoc | RawHistoryDoc[] | null;
}

/**
 * Past selling prices of one catalog item, newest first.
 * Reads the per-save snapshots on document_line_items (never the live
 * catalog price), skipping voided documents and non-price doc types
 * (credit notes / billing notes carry no selling price).
 */
export async function fetchPriceHistory(
  userId: string,
  itemId: string,
  options: FetchPriceHistoryOptions = {},
): Promise<PriceHistoryRow[]> {
  const { customerId = null, limit = 20, excludeDocumentId = null } = options;

  // NOTE: document_line_items has TWO FKs to documents (document_id and
  // source_document_id), so the embed must name the constraint explicitly.
  // The select hint keeps the response key as `documents`, and filters use
  // that alias.
  const DOC_HINT = "documents:document_line_items_document_id_fkey";
  const DOC = "documents";
  let query = supabase
    .from("document_line_items")
    .select(
      `document_id, unit_price, quantity, unit, discount_percent, created_at, ${DOC_HINT}!inner(doc_number, doc_type, deal_id, issue_date, status, customer_id, customers(name))`,
    )
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .neq(`${DOC}.status`, "voided")
    .not(`${DOC}.doc_type`, "in", "(credit_note,billing_note)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (customerId) {
    query = query.eq(`${DOC}.customer_id`, customerId);
  }
  if (excludeDocumentId) {
    query = query.neq("document_id", excludeDocumentId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data || []) as RawHistoryRow[]).flatMap((row) => {
    const doc = Array.isArray(row.documents) ? row.documents[0] : row.documents;
    if (!doc) return [];
    const customer = Array.isArray(doc.customers) ? doc.customers[0] : doc.customers;
    return [
      {
        unitPrice: Number(row.unit_price) || 0,
        quantity: Number(row.quantity) || 0,
        unit: row.unit || "ชิ้น",
        discountPercent: Number(row.discount_percent) || 0,
        documentId: row.document_id,
        docNumber: doc.doc_number,
        docType: doc.doc_type,
        dealId: doc.deal_id,
        issueDate: doc.issue_date,
        createdAt: row.created_at,
        customerId: doc.customer_id,
        customerName: customer?.name || null,
      },
    ];
  });
}
