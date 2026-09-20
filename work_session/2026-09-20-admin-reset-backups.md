# 2026-09-20 — Professional admin control: reset backups, preview, reason

## Rollback

- Not yet committed (work tree only). To discard:
  `git checkout -- scripts/test-admin-reset.mjs server/handlers/admin/clients/\[id\]/index.js server/routes.js 'src/app/(admin)/clients/[id].tsx' src/lib/adminApi.ts`
  and delete the two new files below.
- **Migration pending & required**: `supabase/migrations/20260920000000_admin_reset_backups.sql`
  must be applied manually (Supabase SQL editor / Management API) before the reset works.
  Until applied, the admin panel still calls the old 2-arg RPC (unchanged) — the
  new preview/download just fall back / error gracefully.

## What changed

Hardened the existing "Clear Documents & Numbering" (`reset-documents`) action only.
No role model change (single-admin app), no approvals, no notifications.

- **Migration** `20260920000000_admin_reset_backups.sql`:
  - New table `admin_reset_backups` (workspace, actor, action, reason, summary,
    payload, created_at, downloaded_at) + index + RLS (admin/owner read) +
    revoke/grants.
  - `admin_reset_client_documents(uuid, uuid, text default null)` rewritten:
    writes a full JSON snapshot (documents, document_line_items, deals,
    stock_movements, wht_records, files, both sequence tables) BEFORE deleting,
    in the same transaction; records pre-reset counts in
    `client_permission_audit.before`; stores reason; returns `backup_id` +
    `files_deleted` + `reason`. Delete/restore/numbering semantics unchanged.
  - New read-only `admin_preview_reset_client_documents(uuid)` returns counts +
    per-item stock before→after + preserved counts.
  - Old 2-arg RPC dropped first (signature change) — `create or replace` 3-arg
    with default keeps existing 2-arg callers working.

- **Server**:
  - `server/handlers/admin/clients/[id]/index.js`: `handleResetDocuments` takes
    `reason`; new `handlePreviewResetDocuments`; new `reset-documents-preview`
    action.
  - New `server/handlers/admin/clients/[id]/reset-backups.js`: GET list, or
    `?backupId=` → JSON attachment + stamps `downloaded_at`.
  - `server/routes.js`: route `admin/clients/[id]/reset-backups`.

- **Frontend**:
  - `src/lib/adminApi.ts`: extended `ResetDocumentsSummary` (`backup_id`,
    `files_deleted`, `reason`), new `ResetDocumentsPreview` /
    `AdminResetBackup` types and `previewClientDocumentReset`,
    `resetClientDocuments(id, reason?)`, `listAdminResetBackups`,
    `fetchAdminResetBackupBlob`.
  - `src/app/(admin)/clients/[id].tsx`: modal now shows a dry-run preview
    (counts + stock deltas), a required reason field, and the existing typed-name
    confirm; new "ประวัติการล้างข้อมูล (Reset backups)" card lists backups with
    download buttons and a "ใหม่" marker for the just-created backup.

- **Tests**: `scripts/test-admin-reset.mjs` extended — preview counts/stock
  deltas, `summary.reason`/`backup_id`, `audit.before` + `after.reason`/
  `after.backup_id`, and the persisted backup payload contents.

## Verification

- `tsc -b`: clean.
- `node scripts/check-design-system.mjs`: passed.
- NOT run: `npm run lint` — **eslint binary is not installed** in this
  environment (`node_modules/.bin/eslint` missing). Design check ran standalone.
- NOT run: `node scripts/test-admin-reset.mjs` — needs the pending migration
  applied to the integration project.

## Follow-ups

- Apply the migration, then run `node scripts/test-admin-reset.mjs`.
- Backup stores file metadata for attachments but not R2 object bytes (as
  agreed). If physical file backup is wanted later, add a copy-to-backup-prefix
  step before the best-effort R2 delete.
- R2 object deletion remains best-effort after commit (unchanged).
