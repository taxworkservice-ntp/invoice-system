/**
 * Year-era conformance check.
 *
 * One setting decides the year system every screen and every printed document
 * uses: `client_profiles.year_era`, resolved in exactly one place
 * (`src/lib/yearEra.ts`) and handed to screens through `useDocDate()`
 * (`src/components/YearEraProvider.tsx`). Formatting a year by hand is what
 * produced the inconsistency this work removed — the app showed ค.ศ. on some
 * screens and printed พ.ศ. on the same document's sub-tables.
 *
 * Rule: no file under `src/` may format a year itself. Use `useDocDate()` (or
 * the era-aware helpers in `src/lib/dates.ts` with an explicit era).
 *
 * Two groups are deliberately exempt (both recorded in the work session):
 *   - admin tooling, which has no workspace era of its own;
 *   - the SSO government filing export, which Thai law fixes to พ.ศ.
 *
 *   node scripts/check-year-era.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "src");

/** Files allowed to format a year by hand (see the note above). */
const ALLOWED = [
  /lib[\\/]dates\.ts$/, // the owner of era-aware formatting
  /lib[\\/]payroll[\\/]ssoExport\.ts$/, // government filing, fixed to พ.ศ.
  /app[\\/]\(admin\)[\\/]clients\.tsx$/,
  /components[\\/]admin[\\/]client[\\/]OverviewTab\.tsx$/,
  /components[\\/]admin[\\/]client[\\/]ActivityTab\.tsx$/,
  /components[\\/]admin[\\/]client[\\/]ReportsTab\.tsx$/,
];

const RULES = [
  {
    name: "legacy Buddhist formatter",
    re: /formatBuddhist(?:Date|DateTime|Month)?\b|\btoBuddhistYear(?:Now)?\b|\bbeYear\(/,
    hint: "use useDocDate() (or formatDocDate(value, era))",
  },
  {
    name: "hardcoded Buddhist offset",
    re: /\+\s*543\b/,
    hint: "use toEraYear(year, era) with the workspace era",
  },
  {
    name: "Thai-locale date (implicitly พ.ศ.)",
    // A Thai-locale date string with a year renders the Buddhist year even
    // though the source value is ค.ศ. Day/month-only formats are fine.
    re: /toLocaleDate(?:String|TimeString)\(\s*"th-TH"[^)]*\byear\b|toLocale(?:Date|Time)?String\(\s*"th-TH"[^)]*dateStyle/,
    hint: "use useDocDate() so the year follows the workspace era",
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
  if (ALLOWED.some((re) => re.test(file))) continue;
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
  console.log("Year-era check passed — one year system per workspace.");
  process.exit(0);
}

console.error(`\nYear-era check failed — ${violations.length} violation(s):\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  ${v.rule}`);
  console.error(`    ${v.match}  →  ${v.hint}`);
}
console.error("");
process.exit(1);
