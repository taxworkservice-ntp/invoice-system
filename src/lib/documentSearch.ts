import type { Document } from "../types";

/** Everything a user could reasonably type to find a document, lowercased. */
export function getDocumentSearchText(doc: Document): string {
  const customer = (doc as { customer?: { name?: string } }).customer?.name || "";
  const items = Array.isArray(doc.line_items)
    ? doc.line_items.map((item) => item.item_name).join(" ")
    : "";
  return [
    doc.doc_number,
    customer,
    doc.note,
    doc.customer_po_number,
    doc.task_name,
    items,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Every whitespace-separated term must appear somewhere in the document, so
 * "inv somchai" narrows the same way a user expects from a search box.
 */
export function matchesDocumentQuery(doc: Document, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = getDocumentSearchText(doc);
  return q.split(/\s+/).every((term) => haystack.includes(term));
}
