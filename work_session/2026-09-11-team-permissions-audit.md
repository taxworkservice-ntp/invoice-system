# Team & permissions audit + hardening — Session Record

_Session date: 2026-09-11. Full audit (3 parallel tracks: permission
model+RLS, client route guards, admin powers) then all-phase hardening.
Fears confirmed: officers could open /payroll (salary leak) and exfiltrate
reports; admin_reset RPC lacked REVOKE; most view/manage permissions were
UI-only._

## ✅ MIGRATION APPLIED (2026-09-11, via Management API)

- **`sql/20260911_team_permissions_hardening.sql`** — applied, all
  verified live (10/10 checks): function has payroll branch +
  custom-role merge + bypass preserved; is_workspace_owner exists;
  line-item gap closed; admin_reset guarded; 1 manager backfilled,
  0 missing; all 6 admin payroll policies SELECT-only (0 leftover
  ALL); WITH CHECK present; admin_reset EXECUTE limited to
  postgres/authenticated/service_role (anon+public revoked).
- Deploy order now satisfied (migration before frontend).
- `schema.sql` was synced for fresh builds (same bodies).

## What shipped (code, verified tsc + build + node --check)

- `canManagePayroll` permission end-to-end: `lib/permissions.ts`
  (key + Finance section + Thai labels), server mirror, manager
  template in `settings/team.tsx`. Routes (`App.tsx`), pages
  (`payroll/index`, `payroll/employees` defense-in-depth denied screens),
  nav (`AppShell`, `BottomNav` — payroll was unfiltered there).
- Reports: Excel export gated on `canExportReports`.
- Catalog CSVs mask cost columns for viewers.
- `SettingsTabs` hides team tab for non-owners.
- Deal page: unlink/revert/copy/change-customer/manual-stage get
  void/edit toast-guards.
- Server: `requireClientTarget` (client-role only) on all destructive
  admin actions; audit rows for password/status/delete-client/member-
  password-reset/client-created; Thai labels added to admin audit map.
- `schema.sql`: is_workspace_owner def, guarded toggle_dev_mode,
  payroll WITH CHECK + admin SELECT policies.

## Residual risks (accepted, documented)

- Customer/catalog/WHT/settings view-manage stay UI-gated (small-shop
  tradeoff); money/salary paths are now server-enforced.
- WHT has a SQL branch but no RLS role checks yet.
- Impersonation is banner-only (no workspace switch) — safe as-is.
- Revoke/rotate the sbp_ Management API token (pasted in chat, now 401).
