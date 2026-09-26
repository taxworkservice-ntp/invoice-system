# 2026-09-26 — Admin view-as-client workspace access

## What shipped
- Session-scoped impersonation, no DB/auth changes: `src/lib/viewAs.ts`
  (tab-scoped sessionStorage id, UUID-validated, storage-injectable).
- `useAuth`: admin sessions with an override resolve as the target workspace
  (`role: client`, owner-equivalent, `viewing_as: true`); stale ids fail
  closed; `enterViewAs`/`exitViewAs` re-resolve; override cleared on logout.
- `ViewAsBanner` (amber, above all routes): workspace name + exit back to
  the admin client page. Entry: เปิด workspace ลูกค้า in Overview
  quick actions → lands on /home as owner.
- Audit: enter/exit logged (`admin_view_as_enter/exit`, entity
  `client_profile` = workspace id, admin email in details); in-workspace
  mutations inherit the admin identity via existing `is_admin()` RLS.
- Labels added to `getActionLabel`. `Profile.viewing_as` session-only flag.

## Verification
- 3 viewAs unit tests; full run 121 passed. tsc clean, design check passed,
  production build OK. No migration. Uncommitted; awaiting review/commit.

## Manual checklist (admin role, test workspace)
1. Overview → เปิด workspace ลูกค้า → full client app as owner, banner visible.
2. Mutate something trivial (e.g. draft edit) → audit shows admin identity.
3. Exit → back on the admin client page, admin session intact.
4. Reload mid-view → session persists per tab; logout clears override.
5. Stale id (deleted client) → fails closed to admin tree.
