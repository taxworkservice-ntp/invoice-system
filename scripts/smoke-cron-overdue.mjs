// Post-deploy smoke test for the overdue cron endpoint (api/cron/overdue.js).
//
// Verifies against the DEPLOYED site:
//   1. unauthenticated request  → must be rejected (401)
//   2. authenticated request with CRON_SECRET Bearer header → must return 200
//      and actually run mark_overdue_billing_notes
//
// Usage:
//   node scripts/smoke-cron-overdue.mjs https://your-app.vercel.app
// CRON_SECRET is read from process.env or the local env files.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function readEnvFile(key) {
  if (process.env[key]) return process.env[key];
  for (const file of [".env", ".env.local", ".env.development"]) {
    try {
      const raw = fs.readFileSync(path.resolve(file), "utf8");
      const value = raw.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim();
      if (value) return value.replace(/^["']|["']$/g, "");
    } catch {}
  }
  return undefined;
}

const base = (process.argv[2] || "").replace(/\/+$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("Usage: node scripts/smoke-cron-overdue.mjs <deployed-base-url>");
  process.exit(1);
}

const secret = readEnvFile("CRON_SECRET");
if (!secret) {
  console.error(
    "MISSING CRON_SECRET — set it in the environment or an env file first " +
      "(same value as the Vercel project variable).",
  );
  process.exit(1);
}

const endpoint = `${base}/api/cron/overdue`;
let failures = 0;

console.log(`[1/2] unauthorized request must be rejected`);
{
  const res = await fetch(endpoint);
  if (res.status === 401) {
    console.log(`PASS ${res.status} — endpoint is protected`);
  } else {
    failures += 1;
    console.error(`FAIL expected 401, got ${res.status}`);
  }
}

console.log(`[2/2] authenticated request with CRON_SECRET must succeed`);
{
  const res = await fetch(endpoint, {
    headers: { authorization: `Bearer ${secret}` },
  });
  const body = await res.text();
  if (res.ok && body.includes("success")) {
    console.log(`PASS ${res.status} ${body.slice(0, 80)} — mark_overdue_billing_notes ran`);
  } else {
    failures += 1;
    console.error(`FAIL ${res.status} ${body.slice(0, 200)}`);
    if (res.status === 500 && /CRON_SECRET/i.test(body)) {
      console.error("Hint: CRON_SECRET is not configured in the Vercel project env.");
    }
    if (res.status === 401) {
      console.error("Hint: local CRON_SECRET differs from the Vercel project value.");
    }
  }
}

if (failures > 0) {
  process.exitCode = 1;
  console.error(`${failures} smoke check(s) failed.`);
} else {
  console.log("Cron smoke test passed.");
}
