import { randomUUID } from "node:crypto";
import { admin, client, getTestUserId } from "./harness";

export function uid(): string {
  return crypto.randomUUID();
}

// Small, int32-safe, unique-per-run document number. Avoids Date.now()-style
// numeric suffixes, which break generate_doc_number's `substring(...)'[0-9]+)$'
// ::int` parsing (integer out-of-range) once documents accumulate.
let _docSeq = 0;
export function docNum(prefix: string): string {
  _docSeq += 1;
  return `${prefix}-T${_docSeq}`;
}

// Inserts go through the SIGNED-IN anon client so the permission trigger
// (client_workspace_can) sees auth.uid() = owner and allows the write — this
// mirrors exactly how the app's forms create documents.
export async function createCustomer(name = "QA Customer") {
  const { data, error } = await client
    .from("customers")
    .insert({ id: uid(), user_id: getTestUserId(), name, is_active: true })
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

export async function createDeal(customerId: string, title = "QA Deal") {
  const { data, error } = await client
    .from("deals")
    .insert({ id: uid(), user_id: getTestUserId(), customer_id: customerId, title, is_active: true })
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

export async function createDocument(doc: Record<string, any>) {
  const { data, error } = await client
    .from("documents")
    .insert({ user_id: getTestUserId(), ...doc })
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

export async function createLineItems(lines: Record<string, any>[]) {
  if (!lines.length) return;
  const { error } = await client.from("document_line_items").insert(lines);
  if (error) throw error;
}

export async function createDeliveryNoteLink(link: Record<string, any>) {
  const { error } = await client.from("invoice_delivery_notes").insert(link);
  if (error) throw error;
}

// Reads use the admin (service-role) client to inspect raw DB state without RLS.
export async function getDocumentAdmin(id: string) {
  const { data, error } = await admin
    .from("documents")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as any;
}

export async function getLineItems(docId: string) {
  const { data, error } = await admin
    .from("document_line_items")
    .select("*")
    .eq("document_id", docId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data as any[];
}

export async function createItem(stock = 100, name = "QA Item") {
  const { data, error } = await client
    .from("items")
    .insert({
      id: uid(),
      user_id: getTestUserId(),
      name,
      item_type: "product",
      base_unit: "piece",
      stock_count: stock,
      unit_price: 10,
    })
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

export async function getItem(id: string) {
  const { data, error } = await admin.from("items").select("*").eq("id", id).single();
  if (error) throw error;
  return data as any;
}

export async function listDocuments() {
  const { data, error } = await admin
    .from("documents")
    .select("*")
    .eq("user_id", getTestUserId());
  if (error) throw error;
  return data as any[];
}
