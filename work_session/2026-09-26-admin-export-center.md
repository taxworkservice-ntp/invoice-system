# 2026-09-26 — Admin export center (always-anytime)

## What shipped
- Shared engine: payroll page's month computation extracted to
  `computeMonthData` in `monthClose.ts` (pure, tested); page refactored to a
  thin wrapper — identical numbers, one implementation for client + admin.
- New `src/lib/adminPayrollExport.ts`: `fetchAdminMonthBundle` (month runs,
  month-eligible employees, line items, recurring, settings, profile) +
  `buildAdminCalcRows` (per-run scope + draft attribution, matching the
  client table).
- Reports tab full build: month selector + 5 working downloads
  (สปส.1-10 with scope line, joiners, leavers, roster, summary single/ZIP)
  with company-slug filenames. Always-anytime: finalized at stored numbers,
  drafts at saved working values, informational copy (no gates, sole admin).
- Silent audit per download (report + month + draft rounds).
- 1-10 workbook gained optional `scopeNote` line.

## Verification
- vitest tests/payroll: 120 passed (incl. computeMonthData end-to-end).
- tsc clean, design check passed, production build OK. No migration.
