# 2026-09-23 — Modern font scaling + Classic v1 retirement

Branch: `feat/modern-font-scaling`. Not deployed.

## What shipped

**Phase 1 — Classic v1 retired** (`f40afed`)
- Only Modern + Classic V2 remain. `PrintDocumentClassic`, its renderers, v1-only CSS,
  fixture branch, regression variants, and 4 baselines removed.
- Feature-aware data remap: `classic → classic_v2` where `classic_v2_template` is
  enabled, else `modern`.
- The shared classic-family pagination key (`"classic"` in `pagination.ts` /
  `printRowHeight.ts`) is retained — Classic V2 depends on it. `print.ts` V2 PDF
  pagination intentionally keeps using it (no page-break change).

**Phase 2 — Modern font scaling** (`138499c` + this commit)
- Shared `pdf_*` font-scale columns (generalized from `classic_v2_*`); Classic V2 reads
  them with a `classic_v2_*` fallback, so its UI is unchanged.
- Modern's ~170 hardcoded sizes converted to `calc(Npx * var(--modern-fs-<slot>))`;
  `PrintDocument` injects the resolved multipliers inline.
- Modern pagination: text line scales (fixed padding stays); Modern fixed-block reserves
  added so scaled content never clips.
- Settings: "ขนาดตัวอักษร (โมเดิร์น)" card (Classic V2 card untouched).
- New unit test `tests/unit/modernFontScale.test.ts`.

## PENDING MANUAL MIGRATIONS (must be applied before this branch is deployed)

1. `sql/20260923_remove_pdf_template_classic.sql` — remap + tighten the `pdf_template`
   CHECK to `('modern','classic_v2')`.
2. `sql/20260923_add_pdf_font_scale.sql` — add `pdf_font_scale` /
   `pdf_section_font_scales` / `pdf_type_font_scales` + backfill from `classic_v2_*`.

The code tolerates the migrations being absent (V2 reads `pdf_* ?? classic_v2_*`; the
Settings save strips `pdf_*` on schema-lag errors and still writes `classic_v2_*`), but
Modern font settings only persist to `pdf_*` after migration 2.

## Verification (this environment)

- `npm run build` ✅
- unit + payroll: 217 ✅ (incl. 4 new Modern-scale tests)
- integration: 58 ✅
- `pagination.many.check` ✅
- e2e print specs (receipt-print-purity, billing-note, credit-note, invoice-from-quotation):
  7 passed, 1 failed — the `credit-note` "void & reissue" failure is **pre-existing on
  `main`** (confirmed via stash control).
- Modern scale-1 output **byte-identical** to pre-change (before/after actual-PNG hash
  compare). Classic V2 print-layout diff counts match `main` exactly.
- Manual render check: Modern item font 10px → 17.33px and doc title 22px → 38.13px at
  the `xxxlarge` preset.

## Notes / follow-ups

- `npm run test:print-layout` baselines are stale in this environment (Modern ~2.6%,
  V2 ~0.15% diff vs committed baselines, identical on `main`), so scale-1 identity was
  proven by before/after actual-PNG comparison instead. Refresh baselines on the
  canonical machine before relying on them.
- `npm run lint` unavailable locally (ESLint not installed in the partial node_modules).
- Classic V2 `classic_v2_*` columns are retained; drop them in a later cleanup migration
  once this is verified in production.
