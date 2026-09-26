# 2026-09-26 — Admin client control center redesign (Phase 1: tabs + overview)

## What shipped
- `/admin/clients/:id` (was a 2,324-line scroll) is now a thin tab
  orchestrator (~250 lines): sticky header + deep-linkable pill nav
  (`?tab=`, default ภาพรวม) + per-tab render.
- Tabs: ภาพรวม / ฟีเจอร์ / ทีม / เอกสาร / รายงาน / กิจกรรม / การจัดการ.
- New `src/hooks/useAdminClientDetail.ts`: all fetched collections, loading,
  account on/off — single parallel load, unchanged behavior.
- New `src/components/admin/client/`: OverviewTab (client-info card verbatim
  + new KPI strip + quick actions), FeaturesTab (toggles + payroll visibility,
  own busy states/handlers), TeamTab (members, permission editor, 4 modals,
  audit list), DocumentsTab (sortable table, local sort state), ActivityTab
  (local filter state), ManageTab (account/dev-mode + fenced โซนอันตราย card
  + backup history + 6 modals), ReportsTab (Phase 2 shell: month selector +
  disabled report inventory), shared.tsx (AUDIT_ACTION_LABELS, SectionHeader,
  tab registry).
- All handlers/modals moved verbatim; only additions are overview
  composition, tab nav, danger-zone fence (`!border-danger/30`), and the
  reports shell. Thai-first headings via SectionHeader (CARD_LABEL retired).

## Verification
- tsc clean (via build), design-system check passed, Prettier clean.
- Full suite: 47 files, 344/344 passed. No admin tests exist (gap noted).
- Production build OK. No migration. Uncommitted; awaiting review/commit.

## Manual checklist (test workspace, admin role)
1. Each tab renders with identical data/actions as the old scroll.
2. `?tab=team` etc. deep-link; invalid tab falls back to overview.
3. Toggle a feature + payroll visibility from ฟีเจอร์ (round-trips).
4. Member add/role/password/delete + permission editor from ทีม.
5. Open each การจัดการ modal (previews load); do NOT confirm destructive ones.
6. Mobile: tab nav scrolls horizontally; tables scroll within cards.
