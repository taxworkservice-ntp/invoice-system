# 2026-09-13 — PDF cache-first downloads + loading-pattern hardening

## PDF downloads: cache-first (fixes 10–30s per-click Chromium renders)
- Root cause of slowness: every click cold-booted Chromium in serverless,
  loaded the full SPA, waited `networkidle`, then printed.
- Reused the half-built cache design (`pdfKey`, `files` rows, `purpose='pdfs'`,
  R2 cleanup already collects `files.r2_key`): was dead code (zero callers)
  because its staleness check couldn't see line-item/customer/profile edits.
- `supabase/migrations/20260913000001_pdf_cache_invalidation.sql` — APPLIED
  LIVE via Management API (verified: 8 triggers + 3 indexes present).
  8 touch-triggers bump `documents.updated_at` on: line-item / invoice-DN /
  BN-invoice / receipt-invoice link changes, customer updates, profile
  updates, bank-account changes, and downstream derivatives
  (converted_from/copied_from chains). +3 indexes so triggers 7–8 don't
  seq-scan. All SECURITY DEFINER (RLS-safe).
- Live trigger tests (value-neutral, production): line UPDATE bumped parent
  doc `updated_at` 2026-09-02 → now; customer no-op UPDATE touched 36 docs.
- `server/handlers/documents/[id]/pdf.js` — cache-first: R2 serve on fresh
  hit, Chromium render on miss + backfill (`files` upsert with `document_id`
  set, so reset/delete cleanup covers it). Variants: single `original`/`copy`,
  2-copy combo keys `both-<order>-il<0|1>-ref<0|1>`. Orphan-row falls through
  to re-render (self-repairing). Render block unchanged except
  `domcontentloaded` + capped logo/image wait (never freeze logos out).
- `server/handlers/_lib/r2.js` — added `getR2ObjectBytes` (GetObject stream).
- `vercel.json` — `functions.api/index.js.maxDuration: 60` (ignored on Hobby).
- Expected: first download after a change stays slow; repeats ~200ms;
  bulk ZIP fast automatically (same endpoint). No write-path code changed.
- NOT covered: `download-center` still uses raw `getSession()` token without
  401-refresh (pre-existing; orthogonal). Local render test impossible (no R2
  creds locally — correctly server-only); render code moved verbatim.

## Loading-pattern hardening (same session)
- `NewDealSheet` favorites: prefetch on mount + per-user localStorage cache +
  skeleton (never paints DEFAULT_FAVORITES as placeholder); fixed stale
  `saveFavorites` rollback closure. (committed earlier)
- `src/app/(admin)/clients/[id].tsx` — guarded `getAdminClientUser` in
  `Promise.all`: partial render + amber banner with retry + honest
  "ไม่ทราบสถานะ" badge instead of stuck spinner.
- New `settings/_components/SettingsSkeleton.tsx` (page + rows variants);
  all 6 settings gates + team tab + bank block use skeletons.
- `PriceHistorySheet` spinner → skeleton rows.

## Earlier this session (live DB)
- `admin_reset_client_documents` v2 `is_admin()` blocked service_role →
  500 on Clear-documents. Fixed with `auth.uid() IS NULL` bypass
  (`supabase/migrations/20260913000000_*`, applied live) + handler maps
  42501 → 403. Verified: negative-case RPC returns `Client not found`.

## Classic V2 signatures (same session)
- Bottom band pinned via flex column + zero-height pin spacer (filler rows
  untouched; full pages pixel-identical). Verified safe: top-level V2 blocks
  use one-sided margin-top only; watermark/page-no are absolute; export
  forces screen media so pin holds in preview and PDF, inert under
  window.print.
- `classic_v2_sign_every_page` (default off): compact initials strip on
  first/continuation pages, full band still last-only. Reserve
  CLASSIC_V2_SIG_STRIP_MM=8 threaded through getRowBudgets/paginateRows
  (height path; mirrored render condition in PrintDocumentClassicV2).
- Migration 20260913000002 applied live. Settings toggle in documents
  template section.
- Verify: tsc clean, pagination.many.check green, unit 9/9 green.
  tests/print-layout pixel suite cannot run green here (system-Chrome fonts
  vs lambda chromium; V2 baselines never committed) — pixel baselines must
  be reviewed/regenerated in the CI/lambda environment. pagination.many.test
  has 1 PRE-EXISTING failure (variance height assert, fails on clean tree).
