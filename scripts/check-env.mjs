// Validates that every environment variable the app and API routes need
// is present in one of the local env files (or process.env), and that no
// secret is defined under a VITE_-prefixed name (Vite would inline it
// into the client bundle). Run before deploys:
//   npm run check:env
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ENV_FILES = [".env", ".env.local", ".env.development"];

function readEnvFiles() {
  const found = new Map();
  for (const file of ENV_FILES) {
    const full = path.resolve(file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
      if (!match) continue;
      if (!found.has(match[1])) found.set(match[1], file);
    }
  }
  return found;
}

const REQUIRED = [
  { name: "VITE_SUPABASE_URL", usedBy: "client supabase init" },
  { name: "VITE_SUPABASE_ANON_KEY", usedBy: "client supabase init" },
  { name: "SUPABASE_URL", usedBy: "api functions" },
  { name: "SUPABASE_ANON_KEY", usedBy: "api functions" },
];

// These two are only required when the API runs with the real credentials.
// DEV_STORAGE_DIR switches storage to disk and lets the API fall back to the
// caller's own session (RLS), so a local checkout can run without them.
const SERVER_ONLY = [
  { name: "SUPABASE_SERVICE_ROLE_KEY", usedBy: "api functions / cron / scripts" },
  { name: "CRON_SECRET", usedBy: "vercel cron → server/handlers/cron/overdue" },
];

const R2_REQUIRED = ["R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT"];

// Secrets must never exist under a VITE_-prefixed name.
const FORBIDDEN_PREFIXES = ["VITE_SUPABASE_SERVICE_ROLE_KEY", "VITE_R2_"];

const env = readEnvFiles();
let failures = 0;
let warnings = 0;

for (const { name, usedBy } of REQUIRED) {
  if (process.env[name] || env.has(name)) {
    console.log(`PASS ${name} (${usedBy})`);
  } else {
    failures += 1;
    console.error(`MISSING ${name} — needed by ${usedBy}`);
  }
}

const localMode = Boolean(process.env.DEV_STORAGE_DIR || env.has("DEV_STORAGE_DIR"));

for (const { name, usedBy } of SERVER_ONLY) {
  if (process.env[name] || env.has(name)) {
    console.log(`PASS ${name} (${usedBy})`);
  } else if (localMode) {
    warnings += 1;
    console.warn(
      `WARN ${name} not set — local mode: the API runs caller-scoped (RLS). ` +
        `Needed for ${usedBy}.`,
    );
  } else {
    failures += 1;
    console.error(`MISSING ${name} — needed by ${usedBy}`);
  }
}

const r2Missing = R2_REQUIRED.filter((name) => !process.env[name] && !env.has(name));
if (r2Missing.length === 0) {
  console.log("PASS R2_* storage variables");
} else if (localMode) {
  console.log("PASS storage — local disk backend (DEV_STORAGE_DIR), R2 credentials not needed");
} else {
  warnings += 1;
  console.warn(
    `WARN R2 variables missing locally: ${r2Missing.join(", ")}` +
      " — set them in Vercel if storage uploads are enabled.",
  );
}

for (const prefix of FORBIDDEN_PREFIXES) {
  const hit = [...env.keys()].find((name) => name.startsWith(prefix));
  if (hit || process.env[hit ?? ""]) {
    failures += 1;
    console.error(
      `FORBIDDEN ${hit} — Vite inlines VITE_* into the client bundle; rename without the prefix.`,
    );
  } else {
    console.log(`PASS no ${prefix}* variable`);
  }
}

if (failures > 0) {
  process.exitCode = 1;
  console.error(`${failures} required env var(s) missing. See .env.example.`);
} else if (warnings > 0) {
  console.log(`Env check passed with ${warnings} warning(s).`);
} else {
  console.log("Env check passed.");
}
