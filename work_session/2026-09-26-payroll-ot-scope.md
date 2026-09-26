# 2026-09-26 — OT-round scope lock + history/month-plan clarity (professional grade)

## Problem
OT rounds (e.g. OT 1–6) rendered the full-salary table: full base pay,
recurring salary allowances, day counts — and finalizing one paid base
salary a second time through totals, bank/SSO/WHT exports, payslips, WHT sync.

## What shipped
- **Engine** (`calculations.ts`): new `PayrollScope` (`full` | `ot-only`) threaded
  through `calculateGross`/`calculateNet`/`calculateBreakdown` as an optional
  5th param (backward compatible). `ot-only` locks base and absences to zero;
  hourly rate still derives from base salary (Thai LPA) so OT math is unchanged.
- **Recurring suppression** (`rows.ts`): `resolveEffectiveLineItem` accepts
  `includeRecurring: false` (OT rounds); `buildPayrollCalcRows` takes
  `calcOpts` + `includeRecurring`.
- **Page** (`payroll/index.tsx`): `isOtRun` scopes `getEffectiveItem` +
  `calcLineItem` (fixes table, totals, save, finalize in one stroke); `วันทำงาน`
  column hidden; base cell locked `—`; amber explainer banner; AttendancePanel
  hidden for OT runs; copy-from-previous copies OT entries only (+ OT toast);
  detail modal + slip preview scoped.
- **Exports**: `exportRun` bundle + `payslipBatch` zip derive scope from
  `run.batch_type`; PDF slip hides the zero-base line (OT slips show OT only).
- **History panel**: selected month only + single `รอบเดือนก่อนหน้า (N รอบ)`
  `<details>` expander; contextual count; no scroll box.
- **Month plan**: two lanes — `รอบเงินเดือน` / `รอบ OT` section headers.
- No third OT tab (matches Gusto/Rippling/HumanSoft: run-type taxonomy +
  unified month-close, not navigation split).

## Verification
- vitest tests/payroll: 9 files, 94/94 (new: ot-only calc ×2, rows ×2).
- tsc clean; design-system check passed; production build OK.

## Notes / caveats
- Already-finalized OT rounds keep old numbers (history immutable).
- No migration (no schema change). Prettier reflowed exportRun/payslipPdf.
- Uncommitted; awaiting review/commit decision.
