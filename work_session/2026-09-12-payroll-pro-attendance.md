# 2026-09-12 — Payroll Pro: Time & Leave + Typed Pay Items (HumanSoft adaptation)

## Intent
Stay an accountant-portal niche (no HRMS clone). Cherry-pick HumanSoft payroll strengths,
priority = time & leave input (user vote). Keep 2-page payroll UX, extend engine + UI surgically.

## What shipped (code)
- `src/lib/payroll/attendance.ts` (new, pure + tested): CSV/TSV import parser (Thai+EN statuses),
  per-employee summary (present/absent/leave/holiday + suggested OT >8h), mapping to
  `days_worked` (daily) / `absent_days` (monthly, paid-leave aware), leave balances,
  OT cut-off window describe/suggest.
- `src/lib/payroll/payItems.ts` (new, pure + tested): 9-kind taxonomy
  (allowance/overtime/bonus/commission/advance/loan/fund/welfare/other), Thai labels,
  advance/fund detectors, row validator, totals-by-kind.
- `src/types/index.ts`: `PayrollAddition/Deduction.kind?`, `PayrollRun.ot_start/ot_end`,
  `ClientPayrollSettings.ot_cutoff_days`, `paid_leave_days_per_year` (all optional/nullable-safe).
- `src/components/payroll/AttendancePanel.tsx` (new): draft-mode collapsible import strip —
  paste CSV → validate → preview per-code summary → one-click apply into line items.
  Unknown codes flagged, never applied. Daily/monthly mapping respected.
- `src/app/(client)/payroll/index.tsx`: AttendancePanel wired (derived OT window from
  run columns or `ot_cutoff_days` suggestion), `handleApplyAttendance` merge-save,
  create/edit run modals gain optional OT window fields (validated, pre-migration-safe),
  additions/deductions rows gain kind dropdowns (defaults allowance/advance).
- `src/app/(client)/settings/payroll.tsx`: + OT cut-off days (0–28), paid leave/year;
  save retries without new columns on 42703 (pre-migration deploy-safe).

## Schema — APPLIED 2026-09-12 via Management API (user-provided token)
- `sql/add_payroll_attendance_pro.sql` + `supabase/migrations/20260912000000_payroll_attendance_pro.sql`
- Adds `payroll_runs.ot_start/ot_end`, `client_payroll_settings.ot_cutoff_days`,
  `paid_leave_days_per_year`, `payroll_recurring_items.kind`, `payroll_attendance_imports` table + RLS.
- Verified via `POST /v1/projects/{ref}/database/query`: all 5 columns present,
  `payroll_attendance_imports` table exists (count=1). No app fallback needed anymore,
  though pre-migration guards remain harmless.

## Verification
- `npx vitest run tests/payroll` → 5 files, 57 tests pass (incl. new attendance 5 + payItems 4).
- `npx tsc --noEmit -p tsconfig.app.json` → clean.

## Deliberately NOT built
Recruitment/onboarding/KPI/LMS/AI/hardware clock-in/LINE OA/5-level approvals/mobile ESS —
out of niche. E-slip link, bank/government text files, loan balances remain Phase 3 candidates.

## Next
1. Apply migration manually, confirm OT columns persist.
2. Optional: persist attendance imports to `payroll_attendance_imports` for audit trail.
3. Optional: loan-balance ledger + bank/SCB-KBank text export.
