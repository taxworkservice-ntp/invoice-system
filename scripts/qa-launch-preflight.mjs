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
    file: "api/cron/overdue.js",
    patterns: ["process.env.CRON_SECRET", "Bearer ${cronSecret}"],
  },
  {
    name: "image proxy asset boundary",
    file: "api/storage/[action].js",
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
