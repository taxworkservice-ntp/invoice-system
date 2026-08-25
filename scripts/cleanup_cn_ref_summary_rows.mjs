// Removes ref-summary header rows ("ใบส่งของ DN-...", qty 0 / ฿0) that were
// wrongly copied into credit/debit notes from ref-mode invoices.
// Invoices themselves KEEP these rows — print templates need them for
// grouped rendering. Run dry first:  node scripts/cleanup_cn_ref_summary_rows.mjs
// Apply:                             node scripts/cleanup_cn_ref_summary_rows.mjs --apply
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

function readEnvFile(key) {
  if (process.env[key]) return process.env[key];
  for (const f of [".env", ".env.local", ".env.development"]) {
    try {
      const raw = fs.readFileSync(f, "utf8");
      const v = raw.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim();
      if (v) return v.replace(/^["']|["']$/g, "");
    } catch {}
  }
}

const apply = process.argv.includes("--apply");
const admin = createClient(
  readEnvFile("SUPABASE_URL"),
  readEnvFile("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: docs, error } = await admin
  .from("documents")
  .select("id, doc_number, doc_type, user_id")
  .in("doc_type", ["credit_note", "debit_note"]);
if (error) throw error;

// Copied summary rows lose their lineage fields (CreditNoteForm maps items
// fresh), so identify them by print-marker signature instead:
// name = source-doc header text AND every amount column is zero.
const isGarbage = (l) =>
  l.quantity === 0 &&
  l.unit_price === 0 &&
  l.line_total === 0 &&
  /^(ใบส่งของ|ใบเสนอราคา)\s/.test(l.item_name || "");

let removed = 0;
for (const doc of docs || []) {
  const { data: lines } = await admin
    .from("document_line_items")
    .select("id, item_name, quantity, unit_price, line_total, source_document_id, source_line_item_id")
    .eq("document_id", doc.id);
  const garbage = (lines || []).filter(isGarbage);
  if (!garbage.length) continue;
  console.log(
    `${doc.doc_number} (${doc.doc_type}): ${garbage.length} ref-summary row(s)` +
      garbage.map((l) => `\n   - "${l.item_name}" qty=${l.quantity} total=${l.line_total}`).join(""),
  );
  if (apply) {
    const { error: delErr } = await admin
      .from("document_line_items")
      .delete()
      .in("id", garbage.map((l) => l.id));
    if (delErr) throw delErr;
  }
  removed += garbage.length;
}

console.log(apply ? `Deleted ${removed} row(s).` : `Dry run — ${removed} row(s) would be deleted. Re-run with --apply.`);
