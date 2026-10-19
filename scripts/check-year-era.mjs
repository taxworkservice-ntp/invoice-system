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
  // Admin tooling: the platform's own screens, which belong to no workspace and
  // therefore have no era to follow (they show timestamps, not document dates).
  /app[\\/]\(admin\)[\\/]/,
  /components[\\/]admin[\\/]/,
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
    name: "hand-built date string",
    // `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}` — a local
    // formatter composing a date from raw parts, which is how the WHT
    // certificate printed ค.ศ. Because the literal interpolates getFullYear()
    // AND uses a "/" separator, plain date arithmetic
    // (`new Date(d.getFullYear(), d.getMonth() + 1)`) is not caught.
    re: /`[^`]*\/[^`]*\$\{[^}]*getFullYear\(\)[^}]*\}[^`]*`/,
    hint: "use useDocDate() / formatDocNumericDate(value, era)",
  },
];

// The year in JSX text or in a Thai year label — multi-line, because
// `<option …>\n {year}\n</option>` and `\u0e1b\u0e35 ${filters.year}` are the two shapes that slipped
// through while the year filter and the filter chip printed \u0e04.\u0e28.
const RENDERED_YEAR = [
  />\s*\{\s*(?:year|y|reportYear|currentYear|selectedYear|nowYear)\s*\}\s*</g,
  // A Thai year label interpolating a *bare* year value (`\u0e1b\u0e35 ${filters.year}`) —
  // a converted value (`\u0e1b\u0e35 ${yearLabel(year)}`) is a call and passes.
  /`[^`]*\u0e1b\u0e35[^`]*\$\{\s*(?:[\w$.]*\.)?(?:year|y|reportYear|currentYear|selectedYear|nowYear)\s*\}[^`]*`/g,
];

// Multi-line aware: a call's options object may span lines, which is exactly
// how `toLocaleDateString("th-TH", { … year … })` escaped the line rules.
const CALL_WITH_YEAR = /(toLocaleDateString|toLocaleTimeString|toLocaleString|Intl\.DateTimeFormat)\s*\(/g;

/** Text of the call whose "(" sits at `open`, paren-balanced. */
function callText(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) return { body: text.slice(open, i + 1), end: i };
    }
  }
  return { body: text.slice(open, open + 240), end: open + 240 };
}

/** Violations in one file's source: line rules + the multi-line call scan. */
function scanSource(file, source) {
  const found = [];
  const lineOf = (index) => source.slice(0, index).split("\n").length;

  source.split(/\r?\n/).forEach((line, index) => {
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      const match = rule.re.exec(line);
      if (match) {
        found.push({
          file,
          line: index + 1,
          rule: rule.name,
          match: match[0].trim().slice(0, 80),
          hint: rule.hint,
        });
      }
    }
  });

  CALL_WITH_YEAR.lastIndex = 0;
  let call;
  while ((call = CALL_WITH_YEAR.exec(source)) !== null) {
    const { body, end } = callText(source, call.index + call[0].length - 1);
    if (/\byear\b|dateStyle/.test(body)) {
      found.push({
        file,
        line: lineOf(call.index),
        rule: "Thai/foreign-locale date with a year",
        match: body.replace(/\s+/g, " ").slice(0, 80),
        hint: "use useDocDate() — a locale year is a fixed era (th-TH is always พ.ศ.)",
      });
    }
    CALL_WITH_YEAR.lastIndex = end;
  }

  for (const re of RENDERED_YEAR) {
    re.lastIndex = 0;
    let hit;
    while ((hit = re.exec(source)) !== null) {
      found.push({
        file,
        line: lineOf(hit.index),
        rule: "year rendered without the era",
        match: hit[0].replace(/\s+/g, " ").trim().slice(0, 80),
        hint: "wrap it: {toEraYear(year, era)} or use useDocDate()",
      });
      re.lastIndex = hit.index + hit[0].length;
    }
  }

  return found;
}

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
  const relative = path.relative(process.cwd(), file);
  violations.push(...scanSource(relative, fs.readFileSync(file, "utf8")));
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
