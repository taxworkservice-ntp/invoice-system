# 2026-09-15 — documents.updated_at ignores render-only touches

## What
Follow-up to `2026-09-15-pdf-render-version.md`. The home "แก้ไขล่าสุด" column
still showed one timestamp across many deals because the previous fix was
incomplete: `20260915120000` moved the PDF-cache touch-triggers onto
`documents.render_updated_at`, but those functions still issue
`UPDATE public.documents ...`, which fired the generic
`trg_documents_updated_at` → `handle_updated_at()`, forcing
`updated_at = now()` on every touch.

Two concrete effects observed live:
- The `20260915120000` backfill itself (`UPDATE documents SET render_updated_at
  = updated_at`) stamped **all** documents with `2026-09-15 04:54:52.305283+00`
  (users `testco@gmail.com` 206 docs / `taxworkservice@gmail.com` 45 docs share
  exactly one `updated_at`).
- Any profile/customer/bank/source change kept bulk-bumping every document.

## Files
- `supabase/migrations/20260915130000_documents_updated_at_ignore_render_only.sql`
  (new) — adds `handle_document_updated_at()` and repoints
  `trg_documents_updated_at` at it. Bumps `updated_at` only when a column other
  than `render_updated_at` actually changes.
- `schema.sql` — same function added and `trg_documents_updated_at` updated.

## Applied
**APPLIED** to `taxwork invoice's Project` (`fbhoqcpqqtbiorzbuqcl`) on
2026-09-15 via the Supabase Management API (`/v1/projects/{ref}/database/query`).
Idempotent; safe to re-run.

## Verify
Live probe (self-rolling-back DO block) on a `testcompany@gmail.com` document:
- `before        = 2026-09-15 14:40:17.056011`
- `after_touch   = 2026-09-15 14:40:17.056011` (unchanged)
- `after_edit    = 2026-09-15 15:02:12.344519` (bumped)

So render-only touches (line items, profile, customer, bank, derivatives,
cache backfill) no longer move `updated_at`; real edits still do.

## Deferred
Historical bulk-stamped `updated_at` values were left as-is by decision (true
per-document edit times are unrecoverable). They self-correct as documents are
edited. If a full reset is wanted later, the least-misleading baseline is
`documents.created_at`.
