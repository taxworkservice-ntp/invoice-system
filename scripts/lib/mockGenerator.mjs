// ============================================================
// Mock data generator core — shared by scripts/seed-mock.mjs
//
// Generates [MOCK]-tagged deals/documents on the test workspace with
// sequence-safe numbering. Chains: dn, dn-inv, inv-bn, dn-inv-bn, random.
// cleanMockData removes ONLY [MOCK]/Mock-tagged data.
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

export const MOCK_TITLE_PREFIX = "[MOCK]";
export const MOCK_NOTE_PREFIX = "[MOCK]";

export function makeAdmin() {
  const env = {};
  for (const f of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !(m[1] in env)) env[m[1]] = m[2].trim();
      }
    } catch {}
  }
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const round2 = (n) => Math.round(n * 100) / 100;
const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pad3 = (n) => String(n).padStart(3, "0");
const yyyy = (y) => String(y);
const isoDate = (d) => d.toISOString().slice(0, 10);
const addDays = (d, days) => new Date(d.getTime() + days * 86400000);

export async function loadWorkspace(sb) {
  const { data: users } = await sb.auth.admin.listUsers();
  const user = (users?.users || []).find((u) => u.email === "testcompany@gmail.com");
  if (!user) throw new Error("testcompany@gmail.com not found — run scripts/seed-testcompany.mjs first");
  const userId = user.id;

  const { data: profile, error: profileErr } = await sb
    .from("client_profiles")
    .select("vat_registered")
    .eq("user_id", userId)
    .single();
  if (profileErr) throw profileErr;

  const { data: customers, error: custErr } = await sb
    .from("customers")
    .select("id, name")
    .eq("user_id", userId)
    .order("created_at");
  if (custErr || !customers?.length) throw (custErr || new Error("No customers — run scripts/seed-testcompany.mjs first"));

  const { data: catalog, error: itemErr } = await sb
    .from("items")
    .select("id, name, sku, unit_price, base_unit, item_type")
    .eq("user_id", userId);
  if (itemErr || !catalog?.length) throw (itemErr || new Error("No catalog items — run scripts/seed-testcompany.mjs first"));

  const { data: seqs } = await sb
    .from("doc_number_sequences")
    .select("doc_type, prefix, last_sequence")
    .eq("user_id", userId);
  const sequences = {};
  for (const s of seqs || []) sequences[s.doc_type] = { prefix: s.prefix, last: s.last_sequence || 0 };

  return { userId, vatRegistered: profile?.vat_registered !== false, customers, catalog, sequences };
}

function makeNumberer(sb, userId, sequences) {
  const counters = {};
  return {
    /** Reserve `count` numbers for docType up-front (persists immediately —
     *  failed generations leave sequence gaps, never number collisions). */
    async reserve(docType, count) {
      const seq = sequences[docType] || { prefix: docType.slice(0, 3).toUpperCase(), last: 0 };
      counters[docType] = (counters[docType] ?? seq.last) + count;
      const { error } = await sb
        .from("doc_number_sequences")
        .update({ last_sequence: counters[docType] })
        .eq("user_id", userId)
        .eq("doc_type", docType);
      if (error) throw new Error(`reserve numbers ${docType}: ${error.message}`);
      return seq;
    },
    next(docType) {
      const seq = sequences[docType] || { prefix: docType.slice(0, 3).toUpperCase(), last: 0 };
      counters[docType] = (counters[docType] ?? seq.last) + 1;
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      return { number: `${seq.prefix}-${yyyy(now.getFullYear())}-${mm}-${pad3(counters[docType])}` };
    },
  };
}

function docTotals(lines) {
  const subtotal = round2(lines.reduce((s, l) => s + l.line_total, 0));
  const vat_amount = round2(subtotal * 0.07);
  return { subtotal, vat_amount, total_amount: round2(subtotal + vat_amount) };
}

function makeLines(documentId, userId, count, catalog, offset) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const item = catalog[(i + offset) % catalog.length];
    const quantity = 1 + ((i + offset) % 4);
    rows.push({
      id: randomUUID(),
      document_id: documentId,
      user_id: userId,
      item_id: item.id,
      item_name: item.name,
      item_sku: item.sku,
      item_type: item.item_type || "product",
      unit: item.base_unit || "ชิ้น",
      unit_price: item.unit_price,
      quantity,
      base_quantity: quantity,
      discount_percent: 0,
      discount_amount: 0,
      line_total: round2(item.unit_price * quantity),
      sort_order: i + 1,
    });
  }
  return rows;
}

function pickChain(chainOpt) {
  if (chainOpt !== "random") return chainOpt;
  const all = ["dn", "dn-inv", "inv-bn", "dn-inv-bn"];
  return all[Math.floor(Math.random() * all.length)];
}

const docStatus = (docType, statusMode) => {
  const table = {
    draft: { delivery_note: "draft", invoice: "draft", billing_note: "draft" },
    issued: { delivery_note: "issued", invoice: "sent", billing_note: "sent" },
  };
  if (statusMode === "random") {
    return Math.random() < 0.5 ? table.draft[docType] : table.issued[docType];
  }
  return (table[statusMode] || table.draft)[docType];
};

/**
 * Generate [MOCK]-tagged deals + documents.
 * options: { deals, chain: "dn"|"dn-inv"|"inv-bn"|"dn-inv-bn"|"random",
 *            itemsMin, itemsMax, customerMode: "same"|"random"|"index",
 *            customerIndex?, statusMode: "draft"|"issued"|"random" }
 */
export async function generateMockData(sb, workspace, options) {
  const { userId, vatRegistered, customers, catalog, sequences } = workspace;
  const numberer = makeNumberer(sb, userId, sequences);
  const today = new Date();
  const opts = {
    deals: Math.max(1, options.deals || 10),
    chain: options.chain || "dn",
    itemsMin: Math.max(1, options.itemsMin ?? 3),
    itemsMax: Math.max(options.itemsMin ?? 3, options.itemsMax ?? 8),
    customerMode: options.customerMode || "same",
    customerIndex: options.customerIndex || 1,
    statusMode: options.statusMode || "draft",
  };

  // Reserve number ranges up-front (like the app: sequences bump before save —
  // failed generations leave gaps, never number collisions).
  const perDealDocs = {
    dn: { delivery_note: 1 },
    "dn-inv": { delivery_note: 1, invoice: 1 },
    "inv-bn": { invoice: 1, billing_note: 1 },
    "dn-inv-bn": { delivery_note: 1, invoice: 1, billing_note: 1 },
  };
  const reserveCounts =
    opts.chain === "random"
      ? { delivery_note: opts.deals * 3, invoice: opts.deals * 3, billing_note: opts.deals * 3 }
      : Object.fromEntries(
          Object.entries(perDealDocs[opts.chain] || {}).map(([t, n]) => [t, n * opts.deals]),
        );
  for (const [docType, count] of Object.entries(reserveCounts)) {
    await numberer.reserve(docType, count);
  }

  const deals = [];
  const documents = [];
  const allLines = [];
  const idnLinks = [];
  const bnLinks = [];
  const numbers = { DN: [], INV: [], BN: [] };
  let itemOffset = 0;

  for (let i = 1; i <= opts.deals; i++) {
    const dealId = randomUUID();
    const customer =
      opts.customerMode === "random"
        ? customers[Math.floor(Math.random() * customers.length)]
        : opts.customerMode === "index"
          ? customers[(opts.customerIndex - 1) % customers.length]
          : customers[0];
    const chain = pickChain(opts.chain);
    const issueDate = isoDate(addDays(today, i - 1));
    const dueDate = isoDate(addDays(today, i - 1 + 30));
    const lineCount = randInt(opts.itemsMin, opts.itemsMax);
    const note = `${MOCK_NOTE_PREFIX} ${chain}`;

    const deal = {
      id: dealId,
      user_id: userId,
      customer_id: customer.id,
      title: `${MOCK_TITLE_PREFIX} deal ${i} — ${chain} (${customer.name})`,
      is_active: true,
    };
    deals.push(deal);

    const dnId = randomUUID();
    const invId = randomUUID();
    const bnId = randomUUID();
    const needDn = chain === "dn" || chain === "dn-inv" || chain === "dn-inv-bn";
    const needInv = chain !== "dn";
    const needBn = chain !== "dn" && chain !== "dn-inv";

    let dnLines = null;
    let dnTotals = null;
    let invTotals = null;
    let bnTotals = null;
    if (needDn) {
      const dn = numberer.next("delivery_note");
      numbers.DN.push(dn.number);
      dnLines = makeLines(dnId, userId, lineCount, catalog, itemOffset);
      itemOffset += lineCount;
      allLines.push(...dnLines);
      dnTotals = docTotals(dnLines);
      documents.push({
        id: dnId, user_id: userId, deal_id: dealId, customer_id: customer.id,
        doc_type: "delivery_note", doc_number: dn.number, status: docStatus("delivery_note", opts.statusMode),
        issue_date: issueDate, vat_registered: vatRegistered, vat_rate: 7, wht_rate: 0,
        discount_percent: 0, discount_amount: 0, ...dnTotals, wht_amount: 0, net_payable: dnTotals.total_amount,
        note, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
    }

    if (needInv) {
      const inv = numberer.next("invoice");
      numbers.INV.push(inv.number);
      const lines = needDn
        ? dnLines.map((l) => ({
            ...l,
            id: randomUUID(),
            document_id: invId,
            source_document_id: dnId,
            source_line_item_id: l.id,
            source_delivered_qty: l.quantity,
            source_unit_price: l.unit_price,
          }))
        : makeLines(invId, userId, lineCount, catalog, itemOffset);
      if (!needDn) itemOffset += lineCount;
      allLines.push(...lines);
      invTotals = docTotals(lines);
      documents.push({
        id: invId, user_id: userId, deal_id: dealId, customer_id: customer.id,
        doc_type: "invoice", doc_number: inv.number, status: docStatus("invoice", opts.statusMode),
        issue_date: issueDate, due_date: dueDate, vat_registered: vatRegistered, vat_rate: 7, wht_rate: 0,
        discount_percent: 0, discount_amount: 0, ...invTotals, wht_amount: 0, net_payable: invTotals.total_amount,
        note, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      if (needDn) {
        idnLinks.push({
          invoice_id: invId, delivery_note_id: dnId, user_id: userId,
          delivery_note_number: numbers.DN[numbers.DN.length - 1], issue_date: issueDate,
          subtotal: invTotals.subtotal, vat_amount: invTotals.vat_amount,
          total_amount: invTotals.total_amount, released_at: null,
        });
      }
    }

    if (needBn) {
      const bn = numberer.next("billing_note");
      numbers.BN.push(bn.number);
      bnTotals = invTotals ?? { subtotal: 0, vat_amount: 0, total_amount: 0 };
      documents.push({
        id: bnId, user_id: userId, deal_id: dealId, customer_id: customer.id,
        doc_type: "billing_note", doc_number: bn.number, status: docStatus("billing_note", opts.statusMode),
        issue_date: issueDate, due_date: dueDate, vat_registered: vatRegistered, vat_rate: 7, wht_rate: 0,
        discount_percent: 0, discount_amount: 0, ...bnTotals, wht_amount: 0, net_payable: bnTotals.total_amount,
        note, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      if (needInv) {
        bnLinks.push({
          billing_note_id: bnId, invoice_id: invId, user_id: userId,
          invoice_number: numbers.INV[numbers.INV.length - 1], issue_date: issueDate,
          subtotal: invTotals.subtotal, vat_amount: invTotals.vat_amount,
          total_amount: invTotals.total_amount, released_at: null,
        });
      }
    }
  }

  // inserts — base lines first so source-ref lines (DN copies) never
  // reference rows across a chunk boundary
  await insertChunked(sb, "deals", deals);
  await insertChunked(sb, "documents", documents);
  const primaryLines = allLines.filter((l) => !l.source_line_item_id);
  const refLines = allLines.filter((l) => l.source_line_item_id);
  const primaryIds = new Set(primaryLines.map((l) => l.id));
  const dangling = refLines.filter((l) => !primaryIds.has(l.source_line_item_id));
  if (dangling.length) {
    throw new Error(
      `${dangling.length}/${refLines.length} ref lines point to non-existent base lines (e.g. ${dangling[0].source_line_item_id})`,
    );
  }
  await insertChunked(sb, "document_line_items", primaryLines);
  await insertChunked(sb, "document_line_items", refLines);
  if (idnLinks.length) await insertChunked(sb, "invoice_delivery_notes", idnLinks);
  if (bnLinks.length) await insertChunked(sb, "billing_note_invoices", bnLinks);

  return {
    deals: deals.length,
    documents: documents.length,
    lineItems: allLines.length,
    numbers,
    byChain: countByChain(deals),
  };
}

function countByChain(deals) {
  const out = {};
  for (const d of deals) {
    const key = (d.title.match(/— (\S+)/) || [])[1] || "?";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

/** Delete only [MOCK]/Mock-tagged deals and their documents. */
export async function cleanMockData(sb, userId) {
  const { data: deals } = await sb
    .from("deals")
    .select("id, title")
    .eq("user_id", userId)
    .ilike("title", "%mock%");
  const mockDeals = (deals || []).filter(
    (d) => d.title.startsWith(MOCK_TITLE_PREFIX) || /^Mock /.test(d.title),
  );
  const dealIds = mockDeals.map((d) => d.id);
  if (!dealIds.length) return { deals: 0, documents: 0, lineItems: 0 };

  const { data: docs } = await sb.from("documents").select("id").in("deal_id", dealIds);
  const docIds = (docs || []).map((d) => d.id);

  await sb.from("document_line_items").delete().in("document_id", docIds);
  await sb.from("invoice_delivery_notes").delete().in("invoice_id", docIds);
  await sb.from("invoice_delivery_notes").delete().in("delivery_note_id", docIds);
  await sb.from("billing_note_invoices").delete().in("billing_note_id", docIds);
  await sb.from("billing_note_invoices").delete().in("invoice_id", docIds);
  await sb.from("documents").delete().in("id", docIds);
  await sb.from("deals").delete().in("id", dealIds);

  return { deals: dealIds.length, documents: docIds.length };
}

async function insertChunked(sb, table, rows) {
  for (const [i, part] of chunk(rows, 200).entries()) {
    const { error } = await sb.from(table).insert(part);
    if (error) throw new Error(`${table} insert (chunk ${i + 1}, rows ${i * 200}+${part.length}): ${error.message} | details: ${error.details || "-"} | hint: ${error.hint || "-"}`);
  }
}
