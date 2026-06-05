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
      setDocuments(data as unknown as Document[]);
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