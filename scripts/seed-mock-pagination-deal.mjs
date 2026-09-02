// ============================================================
// SEED: Mock pagination deal for testcompany@gmail.com
//
// One deal containing:
//   • 5 delivery notes with 7/14/26/37/50 line items → converted into 1 invoice
//   • 1 billing note covering 5 invoices with 7/114/26/37/50 line items
//
// Usage:  node scripts/seed-mock-pagination-deal.mjs
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

// env
for (const f of [".env.local", ".env"]) {
  try {
    readFileSync(f, "utf8").split(/\r?\n/).forEach((l) => {
      const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    });
  } catch {}
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL = "testcompany@gmail.com";
const VAT_RATE = 7;
const DN_COUNTS = [7, 14, 26, 37, 50];
const BN_INVOICE_COUNTS = [7, 114, 26, 37, 50];
const MONTH = "09";
const YEAR = "2026";
const num = (prefix, seq) => `${prefix}-${YEAR}-${MONTH}-${String(seq).padStart(3, "0")}`;

let step = 0;
const log = (label, ...args) => console.log(`[${++step}] ${label}`, ...args);
const fail = (label, error) => {
  console.error(`FAIL: ${label} — ${error.message || error}`);
  if (error.details) console.error("  details:", error.details);
  process.exit(1);
};
const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};
const round2 = (n) => Math.round(n * 100) / 100;

function makeLineRows(documentId, userId, count, catalog, sortOffset, source) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const item = catalog[(i + sortOffset) % catalog.length];
    const quantity = 1 + (i % 4);
    const unit_price = item.unit_price;
    const row = {
      id: randomUUID(),
      document_id: documentId,
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
      sort_order: sortOffset + i + 1,
    };
    if (source) {
      row.source_document_id = source.documentId;
      row.source_line_item_id = source.lineId(i);
      row.source_delivered_qty = quantity;
      row.source_unit_price = unit_price;
    }
    rows.push(row);
  }
  return rows;
}

function docTotals(lines) {
  const subtotal = round2(lines.reduce((s, l) => s + l.line_total, 0));
  const vat_amount = round2(subtotal * (VAT_RATE / 100));
  const total_amount = round2(subtotal + vat_amount);
  return { subtotal, vat_amount, total_amount };
}

function docRow({ id, userId, dealId, customerId, docType, docNumber, status, issueDate, totals, vatRegistered, dueDate, note }) {
  return {
    id,
    user_id: userId,
    deal_id: dealId,
    customer_id: customerId,
    doc_type: docType,
    doc_number: docNumber,
    status,
    issue_date: issueDate,
    due_date: dueDate,
    vat_registered: vatRegistered,
    vat_rate: VAT_RATE,
    wht_rate: 0,
    discount_percent: 0,
    discount_amount: 0,
    subtotal: totals.subtotal,
    vat_amount: totals.vat_amount,
    total_amount: totals.total_amount,
    wht_amount: 0,
    net_payable: totals.total_amount,
    note: note || null,
    created_at: `${issueDate}T00:00:00Z`,
    updated_at: `${issueDate}T00:00:00Z`,
  };
}

async function insertChunked(table, rows, label) {
  for (const [i, part] of chunk(rows, 200).entries()) {
    const { error } = await sb.from(table).insert(part);
    if (error) fail(`${label} (chunk ${i + 1})`, error);
  }
  log(label, rows.length);
}

async function main() {
  // 1. user
  const { data: users } = await sb.auth.admin.listUsers();
  const user = (users?.users || []).find((u) => u.email === EMAIL);
  if (!user) fail("find user", { message: `${EMAIL} not found — run scripts/seed-testcompany.mjs first` });
  const userId = user.id;
  log("user", EMAIL, userId);

  // 2. profile + customer + catalog
  const { data: profile, error: profileErr } = await sb.from("client_profiles").select("vat_registered, vat_rate").eq("user_id", userId).single();
  if (profileErr) fail("profile", profileErr);
  const vatRegistered = profile.vat_registered;
  const { data: custList, error: custErr } = await sb.from("customers").select("id, name").eq("user_id", userId).limit(1);
  if (custErr || !custList?.length) fail("customer", custErr || { message: "no customers" });
  const customerId = custList[0].id;
  const { data: catalog, error: itemErr } = await sb.from("items").select("id, name, sku, unit_price, base_unit, item_type").eq("user_id", userId);
  if (itemErr || !catalog?.length) fail("items", itemErr || { message: "no items — run scripts/seed-testcompany.mjs first" });
  log("customer", custList[0].name, "| catalog items:", catalog.length);

  // 3. deal
  const dealId = randomUUID();
  const { error: dealErr } = await sb.from("deals").insert({
    id: dealId,
    user_id: userId,
    customer_id: customerId,
    title: "Mock pagination — DN 7/14/26/37/50 → INV · 5 INV (7/114/26/37/50) → BN",
    is_active: true,
  });
  if (dealErr) fail("deal.insert", dealErr);
  log("deal created", dealId);

  // 4. chain A — 5 delivery notes → 1 invoice
  const dnDocs = [];
  const dnAllLines = [];
  let dnSeq = 10; // DN-2026-09-010…
  let issueDay = 1;
  for (const count of DN_COUNTS) {
    const dnId = randomUUID();
    const docNumber = num("DN", dnSeq++);
    const lines = makeLineRows(dnId, userId, count, catalog, 0);
    const totals = docTotals(lines);
    const issueDate = `${YEAR}-${MONTH}-0${issueDay++}`;
    dnDocs.push(docRow({ id: dnId, userId, dealId, customerId, docType: "delivery_note", docNumber: docNumber, status: "converted", issueDate, totals, vatRegistered, note: `Mock DN — ${count} line items` }));
    dnAllLines.push({ dnId, docNumber, lines, totals, issueDate });
  }
  await insertChunked("documents", dnDocs, "delivery notes");
  for (const { dnId, lines } of dnAllLines) {
    await insertChunked("document_line_items", lines, `DN line items (${dnId.slice(0, 8)})`);
  }

  // invoice aggregating the 5 DNs
  const invMainId = randomUUID();
  const invMainNumber = num("INV", 6);
  const invMainTotals = docTotals(dnAllLines.flatMap((d) => d.lines));
  const invMainIssue = `${YEAR}-${MONTH}-06`;
  await insertChunked("documents", [docRow({
    id: invMainId, userId, dealId, customerId, docType: "invoice", docNumber: invMainNumber,
    status: "sent", issueDate: invMainIssue, dueDate: `${YEAR}-10-06`, totals: invMainTotals,
    vatRegistered, note: "Mock invoice — aggregated from 5 delivery notes (7/14/26/37/50)",
  })], "invoice (from DNs)");
  const invMainLines = [];
  let sort = 0;
  for (const dn of dnAllLines) {
    for (const line of dn.lines) {
      sort++;
      invMainLines.push({
        ...line,
        id: randomUUID(),
        document_id: invMainId,
        sort_order: sort,
        source_document_id: dn.dnId,
        source_line_item_id: line.id,
        source_delivered_qty: line.quantity,
        source_unit_price: line.unit_price,
      });
    }
  }
  await insertChunked("document_line_items", invMainLines, "invoice line items (from DNs)");
  const idnRows = dnAllLines.map((dn) => ({
    invoice_id: invMainId,
    delivery_note_id: dn.dnId,
    user_id: userId,
    delivery_note_number: dn.docNumber,
    issue_date: dn.issueDate,
    subtotal: dn.totals.subtotal,
    vat_amount: dn.totals.vat_amount,
    total_amount: dn.totals.total_amount,
    released_at: null,
  }));
  await insertChunked("invoice_delivery_notes", idnRows, "invoice ↔ delivery-note links");
  log("invoice totals", `subtotal ${invMainTotals.subtotal} + VAT ${invMainTotals.vat_amount} = ${invMainTotals.total_amount}`);

  // 5. chain B — 5 invoices → 1 billing note
  const bnInvDocs = [];
  const bnInvLines = [];
  let invSeq = 7; // INV-2026-09-007…
  issueDay = 10;
  for (const count of BN_INVOICE_COUNTS) {
    const invId = randomUUID();
    const docNumber = num("INV", invSeq++);
    const lines = makeLineRows(invId, userId, count, catalog, 0);
    const totals = docTotals(lines);
    const issueDate = `${YEAR}-${MONTH}-${String(issueDay).padStart(2, "0")}`;
    issueDay += 1;
    bnInvDocs.push(docRow({
      id: invId, userId, dealId, customerId, docType: "invoice", docNumber: docNumber,
      status: "in_billing", issueDate, dueDate: `${YEAR}-10-${String(issueDay).padStart(2, "0")}`,
      totals, vatRegistered, note: `Mock invoice — ${count} line items (bundled in BN)`,
    }));
    bnInvLines.push({ invId, docNumber, lines, totals, issueDate });
  }
  await insertChunked("documents", bnInvDocs, "billing-note invoices");
  for (const { invId, lines } of bnInvLines) {
    await insertChunked("document_line_items", lines, `BN invoice line items (${invId.slice(0, 8)})`);
  }

  // billing note
  const bnId = randomUUID();
  const bnNumber = num("BN", 4);
  const bnTotals = docTotals(bnInvLines.flatMap((b) => b.lines));
  const bnIssue = `${YEAR}-${MONTH}-15`;
  await insertChunked("documents", [docRow({
    id: bnId, userId, dealId, customerId, docType: "billing_note", docNumber: bnNumber,
    status: "sent", issueDate: bnIssue, dueDate: `${YEAR}-10-15`, totals: bnTotals,
    vatRegistered, note: "Mock billing note — 5 invoices (7/114/26/37/50) + cheque date field",
  })], "billing note");
  const bnLinkRows = bnInvLines.map((b) => ({
    billing_note_id: bnId,
    invoice_id: b.invId,
    user_id: userId,
    invoice_number: b.docNumber,
    issue_date: b.issueDate,
    subtotal: b.totals.subtotal,
    vat_amount: b.totals.vat_amount,
    total_amount: b.totals.total_amount,
    released_at: null,
  }));
  await insertChunked("billing_note_invoices", bnLinkRows, "billing-note ↔ invoice links");
  log("billing note totals", `subtotal ${bnTotals.subtotal} + VAT ${bnTotals.vat_amount} = ${bnTotals.total_amount}`);

  // 6. bump doc number sequences
  for (const [docType, last] of [["delivery_note", dnSeq - 1], ["invoice", invSeq - 1], ["billing_note", 4]]) {
    const { error } = await sb.from("doc_number_sequences").update({ last_sequence: last }).eq("user_id", userId).eq("doc_type", docType);
    if (error) fail("sequences.update", error);
  }
  log("sequences bumped", "DN→14, INV→11, BN→4");

  // 7. verification
  const { count: docCount } = await sb.from("documents").select("*", { count: "exact", head: true }).eq("deal_id", dealId);
  const { count: liCount } = await sb.from("document_line_items").select("*", { count: "exact", head: true }).in("document_id", [invMainId, ...dnDocs.map((d) => d.id), ...bnInvDocs.map((d) => d.id)]);
  console.log("\n=============================================");
  console.log("  Mock pagination deal seeded");
  console.log("=============================================");
  console.log("  deal:", dealId);
  console.log("  documents in deal:", docCount, "(5 DN + 1 INV + 5 INV + 1 BN)");
  console.log("  line items:", liCount);
  console.log("  chain A: 5 DN (7/14/26/37/50) →", invMainNumber);
  console.log("  chain B:", bnNumber, "← 5 INV (7/114/26/37/50)");
}

main();
