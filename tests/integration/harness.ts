import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "../../src/lib/supabase";

const TEST_EMAIL = "testcompany@gmail.com";
const TEST_PASSWORD = "test1234";

function loadServiceCredentials() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return { url, key };
  const raw = fs.readFileSync(path.join(process.cwd(), "supabase_key.md"), "utf8");
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const jwt = lines.find((l) => l.startsWith("eyJ"));
  const u = lines.find((l) => l.startsWith("http"));
  return { url: u!, key: jwt! };
}

const { url: ADMIN_URL, key: ADMIN_KEY } = loadServiceCredentials();

export const admin = createClient(ADMIN_URL, ADMIN_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// The app's anon client (singleton). Lib functions import this exact instance,
// so we sign IN on it — not on a separate client.
export const client = supabase;

let TEST_USER_ID: string | null = null;

export function getTestUserId(): string {
  if (!TEST_USER_ID) throw new Error("Test user not initialized. Call ensureTestUser() first.");
  return TEST_USER_ID;
}

export async function ensureTestUser(): Promise<{ id: string; email: string }> {
  const { data: existing } = await admin.auth.admin.listUsers();
  const found = (existing?.users || []).find((u) => u.email === TEST_EMAIL);
  let id: string;
  if (found) {
    id = found.id;
    // Self-heal: ensure known password + confirmed email so sign-in always works.
    await admin.auth.admin
      .updateUserById(id, { password: TEST_PASSWORD, email_confirm: true })
      .catch(() => {});
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { company_name: "Test Company Co., Ltd." },
    });
    if (error) throw error;
    id = data.user!.id;
    await admin.from("profiles").upsert({ id, role: "client" });
    await admin.from("client_profiles").upsert(
      {
        user_id: id,
        company_name_th: "บริษัท เทสท์ คอมปานี จำกัด",
        company_name_en: "Test Company Co., Ltd.",
        tax_id: "0105566000999",
        vat_registered: true,
        vat_rate: 7.0,
        default_wht_rate: "3",
        stock_deduct_trigger: "invoice",
        credit_term_days: 30,
        dev_mode_enabled: true,
        password_changed: true,
      },
      { onConflict: "user_id" },
    );
  }
  TEST_USER_ID = id;
  await ensureSequences();
  return { id, email: TEST_EMAIL };
}

const SEQ_TYPES: Array<[string, string]> = [
  ["quotation", "QT"],
  ["invoice", "INV"],
  ["delivery_note", "DN"],
  ["billing_note", "BN"],
  ["receipt", "RC"],
  ["tax_invoice_receipt", "IVR"],
];

// The app seeds doc-number sequences at signup; the test user created via admin
// has none, so create_deal_document / generate_doc_number would fail. Seed them.
export async function ensureSequences(): Promise<void> {
  const uid = getTestUserId();
  for (const [doc_type, prefix] of SEQ_TYPES) {
    await admin
      .from("doc_number_sequences")
      .upsert(
        {
          user_id: uid,
          doc_type: doc_type as any,
          prefix,
          reset_yearly: true,
          last_sequence: 0,
          start_sequence: 1,
        },
        { onConflict: "user_id,doc_type" },
      );
  }
}

export async function signInTestUser(): Promise<void> {
  const { error } = await client.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error) throw new Error(`Sign-in failed: ${error.message}`);
}

// Delete ALL data for the test user so each test starts clean.
// NOTE: documents are protected by a BEFORE DELETE trigger that checks
// client_workspace_can(... 'canDeleteDocuments'), which resolves via auth.uid().
// The service-role admin client has no auth.uid(), so deletes MUST go through
// the signed-in owner `client` (signInTestUser), not `admin`.
// Link tables reference documents with ON DELETE RESTRICT on invoice_id, so we
// remove the links first.
export async function resetWorkspace(): Promise<void> {
  if (!TEST_USER_ID) return;
  const del = client;
  const { data: docs } = await admin.from("documents").select("id").eq("user_id", TEST_USER_ID);
  const ids = (docs || []).map((d) => d.id);
  if (ids.length) {
    await del.from("invoice_delivery_notes").delete().in("invoice_id", ids);
    await del.from("invoice_delivery_notes").delete().in("delivery_note_id", ids);
    await del.from("billing_note_invoices").delete().in("invoice_id", ids);
    await del.from("billing_note_invoices").delete().in("billing_note_id", ids);
    await del.from("receipt_invoices").delete().in("invoice_id", ids);
    await del.from("receipt_invoices").delete().in("receipt_id", ids);
    await del.from("receipt_invoices").delete().in("source_billing_note_id", ids);
    await del.from("stock_movements").delete().in("document_id", ids);
    await del.from("document_line_items").delete().in("document_id", ids);
    await del.from("documents").delete().in("id", ids);
  }
  await del.from("deal_activities").delete().eq("user_id", TEST_USER_ID);
  await del.from("deal_notes").delete().eq("user_id", TEST_USER_ID);
  await del.from("deals").delete().eq("user_id", TEST_USER_ID);
  await del.from("customers").delete().eq("user_id", TEST_USER_ID);
  await del.from("items").delete().eq("user_id", TEST_USER_ID);
}
