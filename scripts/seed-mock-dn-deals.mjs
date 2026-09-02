// ============================================================
// SEED: 20 mock deals, each with exactly 1 delivery note,
// all for the same customer (testcompany@gmail.com workspace).
//
// Usage:  node scripts/seed-mock-dn-deals.mjs
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

// env
for (const f of [".env.local", ".env"]) {
  try {
    readFileSync(f, "utf8").split(/\r?\n/).forEach((l) => {
      const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
    });
  } catch {}
}

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL = "testcompany@gmail.com";
const VAT_RATE = 7;
const DEAL_COUNT = 20;
const MONTH = "09";
const YEAR = "2026";
const dnNumber = (seq) => `DN-${YEAR}-${MONTH}-${String(seq).padStart(3, "0")}`;

const round2 = (n) => Math.round(n * 100) / 100;
const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

async function main() {
  // 1. user + customer + catalog + sequences
  const { data: users } = await sb.auth.admin.listUsers();
  const user = (users?.users || []).find((u) => u.email === EMAIL);
  if (!user) { console.error(`FAIL: ${EMAIL} not found`); process.exit(1); }
  const userId = user.id;

  const { data: custList, error: custErr } = await sb.from("customers").select("id, name").eq("user_id", userId).limit(1);
  if (custErr || !custList?.length) { console.error("FAIL: no customer —", custErr?.message || "run seed-testcompany first"); process.exit(1); }
  const customerId = custList[0].id;

  const { data: catalog, error: itemErr } = await sb.from("items").select("id, name, sku, unit_price, base_unit, item_type").eq("user_id", userId);
  if (itemErr || !catalog?.length) { console.error("FAIL: no catalog items —", itemErr?.message || "run seed-testcompany first"); process.exit(1); }

  const { data: seq } = await sb.from("doc_number_sequences").select("last_sequence").eq("user_id", userId).eq("doc_type", "delivery_note").single();
  let dnSeq = Math.max(seq?.last_sequence || 0, 14) + 1; // continue after existing numbers

  const { data: profile } = await sb.from("client_profiles").select("vat_registered").eq("user_id", userId).single();
  const vatRegistered = profile?.vat_registered !== false;

  console.log(`workspace: ${EMAIL} | customer: ${custList[0].name} | DN starts at ${dnNumber(dnSeq)} | VAT: ${vatRegistered}`);

  // 2. build 20 deals + 20 DNs (+ line items)
  const deals = [];
  const dnDocs = [];
  const allLines = [];
  for (let i = 1; i <= DEAL_COUNT; i++) {
    const dealId = randomUUID();
    deals.push({
      id: dealId,
      user_id: userId,
      customer_id: customerId,
      title: `Mock DN deal ${i} — ${dnNumber(dnSeq)}`,
      is_active: true,
    });

    const dnId = randomUUID();
    const issueDay = String(((i - 1) % 28) + 1).padStart(2, "0");
    const issueDate = `${YEAR}-${MONTH}-${issueDay}`;

    const lineCount = 3 + (i % 4); // 3–6 items per DN
    const lines = [];
    for (let j = 0; j < lineCount; j++) {
      const item = catalog[(i + j) % catalog.length];
      const quantity = 1 + ((i + j) % 5);
      const unit_price = item.unit_price;
      lines.push({
        id: randomUUID(),
        document_id: dnId,
        user_id: userId,
        item_id: item.id,
        item_name: item.name,
        item_sku: item.sku,
        item_type: item.item_type || "product",
        unit: item.base_unit || "ชิ้น",
        unit_price,
        quantity,
        base_quantity: quantity,
        discount_percent: 0,
        discount_amount: 0,
        line_total: round2(unit_price * quantity),
        sort_order: j + 1,
      });
    }
    allLines.push(...lines);

    const subtotal = round2(lines.reduce((s, l) => s + l.line_total, 0));
    const vat_amount = round2(subtotal * (VAT_RATE / 100));
    const total_amount = round2(subtotal + vat_amount);

    dnDocs.push({
      id: dnId,
      user_id: userId,
      deal_id: dealId,
      customer_id: customerId,
      doc_type: "delivery_note",
      doc_number: dnNumber(dnSeq),
      status: "draft",
      issue_date: issueDate,
      due_date: null,
      vat_registered: vatRegistered,
      vat_rate: VAT_RATE,
      wht_rate: 0,
      discount_percent: 0,
      discount_amount: 0,
      subtotal,
      vat_amount,
      total_amount,
      wht_amount: 0,
      net_payable: total_amount,
      note: `Mock delivery note #${i} (deal ${i})`,
      created_at: `${issueDate}T00:00:00Z`,
      updated_at: `${issueDate}T00:00:00Z`,
    });

    dnSeq++;
  }

  // 3. insert
  const { error: dealErr } = await sb.from("deals").insert(deals);
  if (dealErr) { console.error("FAIL deals:", dealErr.message); process.exit(1); }
  console.log("deals inserted:", deals.length);

  for (const [i, part] of chunk(dnDocs, 100).entries()) {
    const { error } = await sb.from("documents").insert(part);
    if (error) { console.error(`FAIL documents (chunk ${i + 1}):`, error.message); process.exit(1); }
  }
  console.log("delivery notes inserted:", dnDocs.length);

  for (const [i, part] of chunk(allLines, 200).entries()) {
    const { error } = await sb.from("document_line_items").insert(part);
    if (error) { console.error(`FAIL line items (chunk ${i + 1}):`, error.message); process.exit(1); }
  }
  console.log("line items inserted:", allLines.length);

  // 4. bump DN sequence
  const { error: seqErr } = await sb.from("doc_number_sequences").update({ last_sequence: dnSeq - 1 }).eq("user_id", userId).eq("doc_type", "delivery_note");
  if (seqErr) { console.error("FAIL sequence bump:", seqErr.message); process.exit(1); }
  console.log("DN sequence bumped to", dnSeq - 1);

  // 5. verify
  const dealIds = deals.map((d) => d.id);
  const { count: dealCount } = await sb.from("deals").select("*", { count: "exact", head: true }).in("id", dealIds);
  const { count: docCount } = await sb.from("documents").select("*", { count: "exact", head: true }).in("deal_id", dealIds);
  const { data: statusCheck } = await sb.from("documents").select("status").in("deal_id", dealIds);
  const statuses = {};
  for (const s of statusCheck) statuses[s.status] = (statuses[s.status] || 0) + 1;
  console.log("\n=============================================");
  console.log("  Seeded", dealCount, "deals /", docCount, "delivery notes");
  console.log("  statuses:", JSON.stringify(statuses));
  console.log("  numbers:", dnNumber(dnSeq - DEAL_COUNT), "→", dnNumber(dnSeq - 1));
  console.log("=============================================");
}

main();
