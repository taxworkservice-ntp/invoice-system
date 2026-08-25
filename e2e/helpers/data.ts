import { uid, api, admin } from "./env";

export { uid };

let _userId: string | null = null;
export async function getUserId(): Promise<string> {
  if (_userId) return _userId;
  const { data } = await admin().auth.admin.listUsers();
  const { TEST_EMAIL } = await import("./env");
  const found = (data?.users || []).find((u) => u.email === TEST_EMAIL);
  if (!found) throw new Error("test user missing");
  _userId = found.id;
  return _userId;
}

function client() {
  return api();
}

export async function createCustomer(name: string) {
  const { data, error } = await (await client())
    .from("customers")
    .insert({ id: uid(), user_id: await getUserId(), name, is_active: true })
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

export async function createDeal(customerId: string, title = "E2E Deal") {
  const { data, error } = await (await client())
    .from("deals")
    .insert({ id: uid(), user_id: await getUserId(), customer_id: customerId, title, is_active: true })
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

export async function createDocument(doc: Record<string, any>) {
  const { data, error } = await (await client())
    .from("documents")
    .insert({ user_id: await getUserId(), ...doc })
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

export async function createLineItems(lines: Record<string, any>[]) {
  if (!lines.length) return;
  const { error } = await (await client()).from("document_line_items").insert(lines);
  if (error) throw error;
}

export async function deleteDealCascade(dealId: string) {
  const adminClient = admin();
  const { data: docs } = await adminClient.from("documents").select("id").eq("deal_id", dealId);
  const ids = (docs || []).map((d) => d.id);
  if (ids.length) {
    for (const table of [
      "invoice_delivery_notes",
      "billing_note_invoices",
      "receipt_invoices",
      "document_line_items",
      "stock_movements",
    ]) {
      for (const col of ["invoice_id", "document_id", "billing_note_id", "receipt_id", "delivery_note_id"]) {
        await adminClient.from(table).delete().in(col, ids).then(() => undefined, () => undefined);
      }
    }
    await adminClient.from("documents").delete().in("id", ids);
  }
  await adminClient.from("deals").delete().eq("id", dealId);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}
