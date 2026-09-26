# 2026-09-26 — Per-client payroll visibility (admin 3-state control)

## What shipped
- Admin can now set, per client, which payroll sections the client sees:
  ทั้งสองส่วน (both) / รอบเงินเดือนเท่านั้น (runs) / พนักงานเท่านั้น (employees).
- Storage reuses `client_features` with two sub-keys refining the master
  `payroll` flag: `payroll_runs`, `payroll_employees`.
- Read rule is fail-open: no rows → both tabs (existing clients unaffected,
  no backfill). Resolver falls back to both if resolution ever yields neither.
- Enforcement: `PayrollTabs` hides the switcher when one tab; `App.tsx`
  route guards redirect to the visible tab; sidebar/bottom-nav payroll link
  retargets to `/payroll/employees` for employees-only clients.
- Admin UI: "Payroll visibility" card on `/admin/clients/:id` below Business
  Features (segmented radio control, hints it applies when Payroll is ON).
- Framework note for future areas lives in `src/lib/payroll/visibility.ts`
  header (add key → extend check constraint → gate with hasFeature/resolver →
  absent = current behaviour → admin control).

## Files
- `src/lib/payroll/visibility.ts` (new), `tests/payroll/visibility.test.ts` (new, 6 tests)
- `src/types/index.ts` (keys), `src/components/payroll/PayrollTabs.tsx` (props)
- `src/app/(client)/payroll/index.tsx`, `src/app/(client)/payroll/employees.tsx`
- `src/App.tsx`, `src/components/layout/AppShell.tsx`, `src/components/layout/BottomNav.tsx`
- `src/app/(admin)/clients/[id].tsx` (control card)
- `supabase/migrations/20260926000000_payroll_tab_visibility.sql` (new), `schema.sql` (check line)

## Verification
- vitest tests/payroll: 8 files, 90/90 passed; tsc clean; design check passed; build OK.

## ✅ APPLIED — migration live (2026-09-26)
`supabase/migrations/20260926000000_payroll_tab_visibility.sql` applied to
project `fbhoqcpqqtbiorzbuqcl` via Management API (`POST /v1/projects/{ref}/database/query`).
Verified: `client_features_feature_key_check` now allows
`service_job_details, classic_v2_template, dn_appendix, payroll, payroll_runs, payroll_employees`.
`schema.sql` snapshot already updated for fresh setups.
