/**
 * Design-system conformance check.
 *
 * Enforces the rules in `DESIGN-SYSTEM.md` that ESLint cannot express:
 *   - no arbitrary px font sizes          (text-[13px] → text-body)
 *   - no arbitrary hex colors             (text-[#888780] → text-ink-300)
 *   - one neutral ramp                    (gray/stone/slate/cool → ink)
 *   - flat surfaces                       (no shadow-sm/md/lg/xl/2xl)
 *   - role type tokens only               (no text-xs/sm/base/lg/xl/2xl)
 *   - one heading weight                  (no font-bold)
 *
 * The print layer (src/components/print/**, **\/print.tsx) is exempt — it has
 * its own pt-based type system.
 *
 *   node scripts/check-design-system.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "src");
const EXEMPT = [/components[\\/]print[\\/]/, /[\\/]print\.tsx$/];

const RULES = [
  { name: "arbitrary px font size", re: /text-\[[0-9.]+px\]/g, hint: "use text-label / text-body / text-title" },
  { name: "arbitrary hex color", re: /[a-z-]+-\[#[0-9A-Fa-f]{3,8}\]/g, hint: "use a design token (text-ink-*, bg-*, border-*)" },
  { name: "legacy neutral ramp", re: /\b(?:text|bg|border|ring|divide|from|to|via)-(?:gray|stone|slate|cool)-[0-9]+/g, hint: "use the ink ramp" },
  { name: "legacy shadow", re: /(?<![\w-])shadow(?:-(?:sm|md|lg|xl|2xl))?(?![\w-])/g, hint: "surfaces are flat; overlays use shadow-overlay" },
  { name: "legacy type size", re: /\btext-(?:3xs|2xs|xs|sm|base|lg|xl|2xl|3xl)\b/g, hint: "use role tokens (label/body/title/subtitle/display/page/hero)" },
  { name: "non-semibold heading", re: /\bfont-(?:bold|extrabold)\b/g, hint: "headings use font-semibold" },
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
  if (EXEMPT.some((re) => re.test(file))) continue;
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
  console.log("Design system check passed — no violations.");
  process.exit(0);
}

console.error(`Design system check failed — ${violations.length} violation(s):\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  ${v.match}  (${v.rule} → ${v.hint})`);
}
process.exit(1);
