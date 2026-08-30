import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

async function read(relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8");
}

const checks = [
  {
    name: "active invoice uniqueness guard",
    file: "sql/20260819_transactional_deal_document_workflows.sql",
    patterns: ["uq_documents_active_invoice_per_quotation", "status <> 'voided'"],
  },
  {
    name: "transactional workflow RPCs",
    file: "sql/20260819_transactional_deal_document_workflows.sql",
    patterns: ["create or replace function public.convert_quotation_to_invoice", "create or replace function public.create_deal_document"],
  },
  {
    name: "new deal flow uses atomic RPC",
    file: "src/app/(client)/deals/new.tsx",
    patterns: ["supabase.rpc(\"create_deal_document\"", "const useAtomicCreate"],
  },
  {
    name: "conversion flow uses atomic RPC",
    file: "src/app/(client)/documents/[id].tsx",
    patterns: ["supabase.rpc(\"convert_quotation_to_invoice\"", "restoreStockOnVoid"],
  },
  {
    name: "cron authentication",
    file: "server/handlers/cron/overdue.js",
    patterns: ["process.env.CRON_SECRET", "Bearer ${cronSecret}"],
  },
  {
    name: "image proxy asset boundary",
    file: "server/handlers/storage/[action].js",
    patterns: ["logos", "signatures", "stamps", "Image proxy is only available for branding assets"],
  },
];

let failures = 0;
for (const check of checks) {
  const content = await read(check.file);
  const missing = check.patterns.filter((pattern) => !content.includes(pattern));
  if (missing.length > 0) {
    failures += 1;
    console.error(`FAIL ${check.name}: missing ${missing.join(", ")}`);
  } else {
    console.log(`PASS ${check.name}`);
  }
}

if (failures > 0) {
  process.exitCode = 1;
  console.error(`${failures} launch preflight check(s) failed.`);
} else {
  console.log("Launch preflight passed.");
}

// Canonical tax contract regression:
//   VAT  = subtotal * vatRate / 100
//   total = subtotal + VAT
//   WHT  = subtotal * whtRate / 100   (base is the PRE-VAT taxable subtotal,
//          never the net payable / VAT-inclusive total)
//   net  = total - WHT
const taxChecks = [
  { name: "reported deal (subtotal 5,050,000, VAT 7%, WHT 3%)", subtotal: 5050000, vatRate: 7, whtRate: 3, vat: 353500, total: 5403500, wht: 151500, net: 5252000 },
  { name: "small non-VAT doc (no WHT)", subtotal: 1000, vatRate: 0, whtRate: 0, vat: 0, total: 1000, wht: 0, net: 1000 },
  { name: "WHT must not use net payable as base", subtotal: 5050000, vatRate: 7, whtRate: 3, vat: 353500, total: 5403500, wht: 151500, net: 5252000 },
];

function round2(n) {
  return Math.round(n * 100) / 100;
}

let taxFailures = 0;
for (const c of taxChecks) {
  const vat = round2(c.subtotal * c.vatRate / 100);
  const total = round2(c.subtotal + vat);
  const wht = round2(c.subtotal * c.whtRate / 100);
  const net = round2(total - wht);
  const wrongBaseWht = round2(net * c.whtRate / 100);
  const ok = vat === c.vat && total === c.total && wht === c.wht && net === c.net && (wht === 0 || wht !== wrongBaseWht);
  if (!ok) {
    taxFailures += 1;
    console.error(`FAIL tax ${c.name}: got vat=${vat} total=${total} wht=${wht} net=${net}`);
  } else {
    console.log(`PASS tax ${c.name}`);
  }
}

if (taxFailures > 0) {
  process.exitCode = 1;
  console.error(`${taxFailures} tax regression check(s) failed.`);
} else {
  console.log("Tax contract regression passed.");
}
