import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { Document, DocumentLineItem, BillingNoteInvoice, DocumentType, DocumentStatus } from "../types";

export function useDocuments(userId: string | undefined) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("documents")
      .select("*, customer:customer_id(name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      const docs = data as unknown as Document[];
      const docIds = docs.map((doc) => doc.id).filter(Boolean);

      if (docIds.length === 0) {
        setDocuments(docs);
        setLoading(false);
        return;
      }

      const { data: lineItems } = await supabase
        .from("document_line_items")
        .select("*")
        .in("document_id", docIds)
        .order("sort_order", { ascending: true });

      const lineItemsByDoc = new Map<string, DocumentLineItem[]>();
      for (const item of (lineItems || []) as DocumentLineItem[]) {
        const existing = lineItemsByDoc.get(item.document_id) || [];
        existing.push(item);
        lineItemsByDoc.set(item.document_id, existing);
      }

      setDocuments(
        docs.map((doc) => ({
          ...doc,
          line_items: lineItemsByDoc.get(doc.id) || [],
        })) as Document[],
      );
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { documents, loading, refetch: fetch };
}

export async function getDocumentDetail(documentId: string) {
  const { data, error } = await supabase
    .from("documents")
    .select("*, customer:customer_id(*)")
    .eq("id", documentId)
    .single();

  if (error) throw error;

  const doc = data as unknown as Document;

  const { data: lineItems } = await supabase
    .from("document_line_items")
    .select("*")
    .eq("document_id", documentId)
    .order("sort_order", { ascending: true });

  doc.line_items = (lineItems || []) as DocumentLineItem[];

  if (doc.line_items.length === 0 && doc.doc_type === "receipt" && doc.deal_id) {
    const { data: dealDocs } = await supabase
      .from("documents")
      .select("id, doc_type")
      .eq("deal_id", doc.deal_id)
      .order("created_at", { ascending: true });

    if (dealDocs) {
      const billingNote = dealDocs.find((d: any) => d.doc_type === "billing_note");
      const invoiceDoc = dealDocs.find((d: any) => d.doc_type === "invoice" || d.doc_type === "tax_invoice_receipt");

      let sourceIds: string[] = [];
      if (billingNote) {
        const { data: linked } = await supabase
          .from("billing_note_invoices")
          .select("invoice_id")
          .eq("billing_note_id", billingNote.id);
        sourceIds = [(linked || []).map((r: any) => r.invoice_id)].flat();
        if (sourceIds.length === 0) sourceIds = [billingNote.id];
      } else if (invoiceDoc) {
        sourceIds = [invoiceDoc.id];
      }

      if (sourceIds.length > 0) {
        const { data: sourceItems } = await supabase
          .from("document_line_items")
          .select("*")
          .in("document_id", sourceIds)
          .order("sort_order", { ascending: true });
        doc.line_items = (sourceItems || []) as DocumentLineItem[];
      }
    }
  }

  if (doc.doc_type === "billing_note") {
    const { data: invoices } = await supabase
      .from("billing_note_invoices")
      .select("*")
      .eq("billing_note_id", documentId);
    doc.billing_invoices = (invoices || []) as BillingNoteInvoice[];
  }

  return doc;
}

export async function saveDocument(doc: Partial<Document>): Promise<Document> {
  const { data, error } = doc.id
    ? await supabase.from("documents").update(doc).eq("id", doc.id).select("*").single()
    : await supabase.from("documents").insert(doc).select("*").single();

  if (error) throw error;
  return data as unknown as Document;
}

export async function saveLineItems(items: Partial<DocumentLineItem>[]) {
  const { error } = await supabase.from("document_line_items").insert(items);
  if (error) throw error;
}

export async function deleteLineItems(documentId: string) {
  const { error } = await supabase.from("document_line_items").delete().eq("document_id", documentId);
  if (error) throw error;
}
