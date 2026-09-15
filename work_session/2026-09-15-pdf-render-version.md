# 2026-09-15 — PDF render version separated from "last edited"

## What
The deal home "แก้ไขล่าสุด" column showed the same recent time on every row.
Root cause: `documents.updated_at` did double duty — user-facing "last edited"
AND PDF cache freshness. `20260913000001_pdf_cache_invalidation.sql` added
AFTER-UPDATE touch-triggers that bump `documents.updated_at` for every render
input, including **all documents of the workspace on any `client_profiles`
change** (`touch_documents_on_profile_change`) and all of a customer's documents
on any customer change. Saving Settings restamped every document.

Live evidence: all 171 documents for user `7871919e…` shared the exact same
`updated_at` minute.

Fix: give cache invalidation its own `documents.render_updated_at`. The touch
triggers bump that; `updated_at` returns to meaning "row modified" (only the
existing `trg_documents_updated_at` bumps it on a real document UPDATE).

## Files
- `supabase/migrations/20260915120000_pdf_render_version.sql` (new) — adds +
  backfills `render_updated_at`, adds `trg_documents_render_updated_at`, and
  retargets `touch_document` + the customer/profile/bank/source touch
  functions at `render_updated_at` (trigger definitions unchanged).
- `server/handlers/documents/[id]/pdf.js` — cache compare/backfill now use
  `render_updated_at` (`lookupFreshCache`, `backfillPdfCache`,
  `expectedRenderUpdatedAt`); document select includes it.
- `src/lib/storageApi.ts` — `getCachedPdfFile` compares `render_updated_at`
  (unused today, kept correct).
- `src/types/index.ts` — `Document.render_updated_at`.
- `tests/unit/lastEdited.test.ts` (new) — display is minute-only; ordering
  keeps second precision.

## Precision contract
Ordering uses the raw timestamp (seconds/sub-seconds); the UI renders HH:MM
only (`formatBuddhistDateTimeParts` / `formatBangkokTime`). No truncation
anywhere in the pipeline.

## Verify
- `npx tsc -b` clean; `vitest run tests/unit` 67/67.
- Home + documents index need no code change — they read `updated_at`, now
  only bumped by real edits.

## ⚠️ PENDING — apply manually before deploying the server change
Run `supabase/migrations/20260915120000_pdf_render_version.sql` in Supabase
FIRST. Until then the updated `server/handlers/documents/[id]/pdf.js` selects a
column that doesn't exist → PDF downloads fail. Backfill sets
`render_updated_at = updated_at`, so existing caches stay valid. Historical
`updated_at` values remain bulk-stamped by choice (self-correct as documents are
edited).
