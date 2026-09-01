// E2E verification: admin "Clear Documents & Numbering" trial reset.
//
// Runs against the throwaway integration workspace testcompany-vitest@gmail.com:
//   1. Baseline-clean the workspace
//   2. Seed mock trial data (real customer/catalog + mock deals/documents/stock/WHT)
//   3. Verify generate_deal_number is collision-safe (counter reset while deals exist)
//   4. Run admin_reset_client_documents (the exact RPC the admin panel calls)
//   5. Assert: trial data gone, setup data preserved, stock restored, counters
//      zeroed, audit row written, numbering restarts, RPC idempotent
//
// Usage: node scripts/test-admin-reset.mjs
// Credentials: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env, supabase_key.md, or .env.local

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const TEST_EMAIL = "testcompany-vitest@gmail.com";

function loadServiceCredentials() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  }
  const keyFile = path.join(process.cwd(), "supabase_key.md");
  if (fs.existsSync(keyFile)) {
    const lines = fs.readFileSync(keyFile, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
    return { url: lines.find((l) => l.startsWith("http")), key: lines.find((l) => l.startsWith("eyJ")) };
  }
  const envLocal = [".env.development", ".env.local", ".env"]
    .map((f) => path.join(process.cwd(), f))
    .filter((f) => fs.existsSync(f))
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n");
  const pick = (name) => (envLocal.match(new RegExp(`^${name}="?([^"\\r\\n]+)"?`, "m")) || [])[1];
  return { url: pick("SUPABASE_URL"), key: pick("SUPABASE_SERVICE_ROLE_KEY") };
}

const { url, key } = loadServiceCredentials();
if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0;
let fail = 0;
const failures = [];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${label}  (${JSON.stringify(actual)})`);
  } else {
    fail += 1;
    failures.push(label);
    console.log(`  FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        actual:   ${JSON.stringify(actual)}`);
  }
}

function checkTrue(label, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${label}${detail ? `  (${detail})` : ""}`);
  } else {
    fail += 1;
    failures.push(label);
    console.log(`  FAIL  ${label}  ${detail}`);
  }
}

async function count(table, column = "user_id", value = userId) {
  const { count, error } = await admin.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  if (error) throw new Error(`count(${table}): ${error.message}`);
  return count;
}

async function findTestUser() {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 500 });
  if (error) throw error;
  const found = (data?.users || []).find((u) => u.email === TEST_EMAIL);
  if (!found) throw new Error(`Test user ${TEST_EMAIL} not found`);
  return found;
}

const user = await findTestUser();
const userId = user.id;
console.log(`Workspace: ${TEST_EMAIL} (${userId})`);

// ---------------------------------------------------------------------------
// 1. Baseline clean
// ---------------------------------------------------------------------------
console.log("\n[1] Baseline clean");
for (const table of [
  "receipt_invoices",
  "invoice_delivery_notes",
  "billing_note_invoices",
  "document_line_items",
  "stock_movements",
  "deal_activities",
  "deal_notes",
  "deals",
  "documents",
  "wht_records",
  "wht_vendors",
  "customers",
  "items",
]) {
  const { error } = await admin.from(table).delete().eq("user_id", userId);
  if (error && !/Could not find the table|does not exist|schema cache/i.test(error.message)) {
    throw new Error(`baseline ${table}: ${error.message}`);
  }
}
const SEQ_TYPES = [
  ["quotation", "QT"], ["invoice", "INV"], ["delivery_note", "DN"],
  ["billing_note", "BN"], ["receipt", "RC"], ["tax_invoice_receipt", "IVR"],
];
for (const [doc_type, prefix] of SEQ_TYPES) {
  const { error } = await admin.from("doc_number_sequences").upsert(
    { user_id: userId, doc_type, prefix, reset_yearly: true, last_sequence: 0, start_sequence: 1 },
    { onConflict: "user_id,doc_type" },
  );
  if (error) throw new Error(`seq upsert ${doc_type}: ${error.message}`);
}
{
  const year = new Date().getFullYear();
  const { error } = await admin.from("deal_number_sequences").upsert(
    { user_id: userId, last_year: year, last_month: 0, last_sequence: 0 },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`deal seq upsert: ${error.message}`);
}
console.log("  done");

// ---------------------------------------------------------------------------
// 2. Seed mock trial data
// ---------------------------------------------------------------------------
console.log("\n[2] Seed mock data");
const { data: customer } = await admin.from("customers").insert({ user_id: userId, name: "ลูกค้าจริง A (real)", is_active: true }).select().single();
if (!customer) throw new Error("customer insert failed");

const { data: itemA } = await admin.from("items").insert({ user_id: userId, name: "สินค้า A", item_type: "product", base_unit: "ชิ้น", stock_count: 100, avg_cost: 20, stock_value: 2000, unit_price: 50 }).select().single();
const { data: itemB } = await admin.from("items").insert({ user_id: userId, name: "สินค้า B", item_type: "product", base_unit: "ชิ้น", stock_count: 100, avg_cost: 10, stock_value: 1000, unit_price: 30 }).select().single();
if (!itemA || !itemB) throw new Error("item insert failed");

const { data: deal1 } = await admin.from("deals").insert({ user_id: userId, customer_id: customer.id, title: "Mock deal 1", is_active: true }).select().single();
const { data: deal2 } = await admin.from("deals").insert({ user_id: userId, customer_id: customer.id, title: "Mock deal 2", is_active: true }).select().single();
if (!deal1?.deal_number || !deal2?.deal_number) throw new Error("deal_number not assigned by trigger");
console.log(`  deals: ${deal1.deal_number}, ${deal2.deal_number}`);

const { data: docNumber, error: docNumErr } = await admin.rpc("generate_doc_number", { p_user_id: userId, p_doc_type: "invoice", p_issue_date: new Date().toISOString().slice(0, 10) });
if (docNumErr) throw docNumErr;
console.log(`  invoice doc_number: ${docNumber}`);
const { data: document, error: docErr } = await admin.from("documents").insert({
  user_id: userId, deal_id: deal1.id, customer_id: customer.id,
  doc_type: "invoice", doc_number: docNumber, status: "issued",
  issue_date: new Date().toISOString().slice(0, 10),
  vat_registered: true, subtotal: 1000, vat_amount: 70, total_amount: 1070, net_payable: 1070,
}).select().single();
if (docErr) throw docErr;
const { error: lineErr } = await admin.from("document_line_items").insert({
  document_id: document.id, user_id: userId, item_id: itemA.id,
  item_name: "สินค้า A", item_type: "product", unit: "ชิ้น",
  unit_price: 100, quantity: 10, line_total: 1000,
});
if (lineErr) throw lineErr;

// Mirror the app (src/lib/stock.ts): doc-driven movement updates items + inserts
// a signed movement with document_id; then a REAL manual stock-in (document_id null).
const { error: mv1Err } = await admin.from("stock_movements").insert({
  item_id: itemA.id, user_id: userId, movement_type: "auto_out", qty_base: -10,
  balance_after: 90, unit_cost: 20, movement_value: -200, balance_value_after: 1800,
  reason: "ตัดสต็อกจากใบแจ้งหนี้ (mock)", document_id: document.id,
});
if (mv1Err) throw mv1Err;
await admin.from("items").update({ stock_count: 90, stock_value: 1800 }).eq("id", itemA.id);
const { error: mv2Err } = await admin.from("stock_movements").insert({
  item_id: itemA.id, user_id: userId, movement_type: "manual_in", qty_base: 5,
  balance_after: 95, unit_cost: 20, movement_value: 100, balance_value_after: 1900,
  reason: "รับเข้าสต็อกจริง (manual)",
});
if (mv2Err) throw mv2Err;
await admin.from("items").update({ stock_count: 95, stock_value: 1900 }).eq("id", itemA.id);

const { data: whtVendor } = await admin.from("wht_vendors").insert({ user_id: userId, name: "ผู้รับจ้างจริง ก" }).select().single();
const { error: whtErr } = await admin.from("wht_records").insert({
  user_id: userId, vendor_id: whtVendor.id, form_type: "pnd3",
  issue_date: new Date().toISOString().slice(0, 10),
  amount: 5000, wht_rate: 3, wht_amount: 150, certificate_no: "6809001",
});
if (whtErr) throw whtErr;
const { error: actErr } = await admin.from("deal_activities").insert({
  deal_id: deal1.id, user_id: userId, event_type: "document_created",
  description: "สร้างเอกสารและออกเอกสาร",
});
if (actErr) throw actErr;
console.log("  seeded: 1 customer, 2 items, 2 deals, 1 invoice, 2 stock movements, 1 WHT record, 1 deal activity");

// ---------------------------------------------------------------------------
// 3. Collision-safety: counter reset while deals still exist (archive-workspace case)
// ---------------------------------------------------------------------------
console.log("\n[3] generate_deal_number collision safety");
{
  const { error } = await admin.from("deal_number_sequences").update({ last_sequence: 0, last_month: 0 }).eq("user_id", userId);
  if (error) throw error;
  const { data: next, error: genErr } = await admin.rpc("generate_deal_number", { p_user_id: userId });
  if (genErr) throw genErr;
  const year = new Date().getFullYear();
  const expected = `DL-${year}-00003`; // max existing = 2, counter = 0 → must skip past both
  check("next deal number skips archived numbers", next, expected);
}

// ---------------------------------------------------------------------------
// 4. Run the reset RPC (exact function the admin panel calls)
// ---------------------------------------------------------------------------
console.log("\n[4] admin_reset_client_documents");
const { data: actor } = await admin.from("profiles").select("id").eq("role", "admin").limit(1).maybeSingle();
const actorId = actor?.id || userId;
const { data: summary, error: resetErr } = await admin.rpc("admin_reset_client_documents", {
  p_target_user_id: userId,
  p_actor_user_id: actorId,
});
if (resetErr) throw resetErr;
console.log("  summary:", JSON.stringify(summary, null, 2));

check("summary.documents_deleted", summary.documents_deleted, 1);
check("summary.deals_deleted", summary.deals_deleted, 2);
check("summary.line_items_deleted", summary.line_items_deleted, 1);
check("summary.stock_movements_deleted", summary.stock_movements_deleted, 2);
check("summary.wht_records_deleted", summary.wht_records_deleted, 1);
check("summary.items_stock_restored", summary.items_stock_restored, 1);
checkTrue("summary.doc_sequences_reset >= 1", summary.doc_sequences_reset >= 1, String(summary.doc_sequences_reset));
check("summary.deal_sequences_reset", summary.deal_sequences_reset, 1);
check("summary.r2_keys", summary.r2_keys, []);

// ---------------------------------------------------------------------------
// 5. Verify database state after reset
// ---------------------------------------------------------------------------
console.log("\n[5] Post-reset state");
check("documents deleted", await count("documents"), 0);
check("deals deleted", await count("deals"), 0);
check("document_line_items deleted", await count("document_line_items"), 0);
check("stock_movements deleted", await count("stock_movements"), 0);
check("wht_records deleted", await count("wht_records"), 0);
check("deal_activities cascade-deleted", await count("deal_activities"), 0);
check("customers preserved", await count("customers"), 1);
check("items preserved", await count("items"), 2);
check("wht_vendors preserved (master data)", await count("wht_vendors"), 1);

const { data: itemAAfter } = await admin.from("items").select("stock_count, avg_cost, stock_value").eq("id", itemA.id).single();
check("item A stock restored to pre-trial (95 current − (−10 doc-linked))", Number(itemAAfter.stock_count), 105);
check("item A stock_value recomputed from avg_cost", Number(itemAAfter.stock_value), 105 * 20);
const { data: itemBAfter } = await admin.from("items").select("stock_count").eq("id", itemB.id).single();
check("item B untouched", Number(itemBAfter.stock_count), 100);

const { data: seqs } = await admin.from("doc_number_sequences").select("doc_type, last_sequence").eq("user_id", userId);
checkTrue("doc counters zeroed", (seqs || []).every((s) => Number(s.last_sequence) === 0), JSON.stringify(seqs?.map((s) => s.last_sequence)));
const { data: dealSeq } = await admin.from("deal_number_sequences").select("last_sequence").eq("user_id", userId).single();
check("deal counter zeroed", Number(dealSeq.last_sequence), 0);
checkTrue("sequence config preserved (prefix/reset_yearly/start)", (seqs || []).length >= 6, `${seqs?.length} rows`);

const { count: auditCount } = await admin.from("client_permission_audit").select("id", { count: "exact", head: true }).eq("workspace_user_id", userId).eq("action", "reset-documents");
checkTrue("audit row written", (auditCount || 0) >= 1, `${auditCount} entries`);

// ---------------------------------------------------------------------------
// 6. Numbering restarts + idempotency + negative case
// ---------------------------------------------------------------------------
console.log("\n[6] Numbering restart");
const { data: nextInv, error: invErr } = await admin.rpc("generate_doc_number", { p_user_id: userId, p_doc_type: "invoice", p_issue_date: new Date().toISOString().slice(0, 10) });
if (invErr) throw invErr;
const year = new Date().getFullYear();
const month = String(new Date().getMonth() + 1).padStart(2, "0");
check("next invoice number restarts", nextInv, `INV-${year}-${month}-001`);

const { data: restartDeal } = await admin.from("deals").insert({ user_id: userId, customer_id: customer.id, title: "Post-reset real deal", is_active: true }).select().single();
check("next deal number restarts", restartDeal.deal_number, `DL-${year}-00001`);
await admin.from("deals").delete().eq("id", restartDeal.id);
await admin.from("deal_number_sequences").update({ last_sequence: 0, last_month: 0 }).eq("user_id", userId);

console.log("\n[7] Idempotency + negative case");
const { data: summary2, error: reset2Err } = await admin.rpc("admin_reset_client_documents", { p_target_user_id: userId, p_actor_user_id: actorId });
if (reset2Err) throw reset2Err;
check("second run: documents_deleted", summary2.documents_deleted, 0);
check("second run: deals_deleted", summary2.deals_deleted, 0);
check("second run: items_stock_restored", summary2.items_stock_restored, 0);

const { error: notFoundErr } = await admin.rpc("admin_reset_client_documents", {
  p_target_user_id: "00000000-0000-0000-0000-000000000000",
  p_actor_user_id: actorId,
});
checkTrue("missing client raises 'Client not found'", Boolean(notFoundErr?.message?.includes("Client not found")), notFoundErr?.message || "no error");

// ---------------------------------------------------------------------------
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
if (failures.length) {
  console.log("Failures:", failures.join(" | "));
  process.exit(1);
}
console.log("ALL CHECKS PASSED — trial reset behaves correctly.");
