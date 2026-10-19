/**
 * Form-routing conformance check.
 *
 * The decision "which screen creates a document type" lives in exactly one
 * place: `src/lib/docCreation.ts`. Hand-built creation URLs are what produced
 * the two bugs this check prevents from coming back:
 *   - `/deals/new?type=invoice_from_delivery_notes` — not a DB enum value, so
 *     the rendered form could never save;
 *   - `/deals/new?type=billing_note` — a second, divergent billing-note
 *     implementation reachable from the customer page only.
 *
 * Rule: no file under `src/` may hardcode a creation URL. Use
 * `creationPath()` or the `useCreateDocument()` hook instead.
 *
 *   node scripts/check-form-routing.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "src");

/** The module that owns the URL shape (and the only place allowed to build it). */
const OWNERS = [/lib[\\/]docCreation\.ts$/];

const RULES = [
  {
    name: "hand-built creation URL",
    re: /["'`]\/(?:deals|documents)\/new\?type=/g,
    hint: 'use creationPath() / useCreateDocument() from src/lib/docCreation.ts',
  },
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const violations = [];

for (const file of walk(ROOT)) {
  if (OWNERS.some((re) => re.test(file))) continue;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      const match = rule.re.exec(line);
      if (match) {
        violations.push({
          file: path.relative(process.cwd(), file),
          line: index + 1,
          rule: rule.name,
          match: match[0],
          hint: rule.hint,
        });
      }
    }
  });
}

if (violations.length === 0) {
  console.log("Form-routing check passed — one URL owner.");
  process.exit(0);
}

console.error(`\nForm-routing check failed — ${violations.length} violation(s):\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  ${v.rule}`);
  console.error(`    ${v.match}  →  ${v.hint}`);
}
console.error("");
process.exit(1);
