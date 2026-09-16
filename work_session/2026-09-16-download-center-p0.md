# 2026-09-16 — Download Center redesign · P0 (engine + correctness + audit)

## What
Full redesign of the Download Center was scoped P0–P3 (plan agreed in chat).
This session implemented **P0** only.

### P0 — shared engine
New `src/lib/download/` + hook/UI, now reused by Download Center and Documents:
- `download.ts` — `downloadBlob`, RFC-safe `buildCsv`/`buildCsvBlob` (quotes escaped
  + BOM), `sanitizeFilenamePart`, `documentPdfFilename`, `datedFilename`.
- `zip.ts` — `buildZipBlob` (lazy JSZip).
- `pdfBatch.ts` — `fetchDocumentPdfs` via `apiFetchBlob` (token refresh), bounded
  concurrency, `AbortSignal`, per-file `{ok|failed}` results.
- `audit.ts` — best-effort `logDownload`.
- `src/hooks/useDownloadJob.ts` + `src/components/download/DownloadJobBar.tsx` —
  one job model: running (progress/cancel) → done/error with result summary.

### P0 — Download Center correctness
`src/app/(client)/download-center/index.tsx`:
- Month presets now bound **both** ends (`gte`+`lte`); previously leaked later months.
- `countsLoaded` resets on filter change (no stale counts); counts fetched in parallel.
- `CustomerQuickSelect` no longer runs a query inside a `useState` initializer —
  moved to `useEffect` with cancel + error state; associated label via `useId`.
- Removed the dead `_template` param (`classic_v2` was being coerced to modern);
  template now resolved by the print page from the profile.
- Honest success/partial/failed summary via the job bar (previously always reported
  success even when PDFs failed).
- Reports/backup now logged to audit; Thai error messages; preset buttons disabled
  with a tooltip when the period has 0 docs; associated labels (Month/Year/quarter/
  stock dates).

### P0 — Documents page
`src/app/(client)/documents/index.tsx`:
- CSV export now uses `buildCsvBlob` (fixes unescaped quotes) + `downloadBlob`.
- Bulk PDF passes the **exact** `pdf_template` (incl. `classic_v2`) instead of
  coercing anything non-classic to modern.

### P0 — audit table
- `sql/20260916_download_audit.sql` — `download_audit` table, index, RLS
  (members read; members insert own, `actor_user_id = auth.uid()`).

## Applied
**PENDING — must be applied manually.** `sql/20260916_download_audit.sql` is **not**
applied (no DB URL / Management API token in this environment). Until then the
client audit insert is a no-op and the history surface can't read. The
`e2e/download-center.spec.ts` audit test auto-skips while the table is absent.

Also still pending from earlier today: `sql/20260916_doc_number_padding_4.sql`.

## Verify
- `npx tsc -b` clean.
- `e2e/download-center.spec.ts` (new): quick preset downloads a ZIP + shows the
  result bar — passing (PDF API stubbed; audit test skipped pending migration).
- Regression: `deal-flow-qa` 14/14 + `deal-quotation` 4/4 still green.

## Deferred to later phases
- P1: new IA, arbitrary date range + status filter, ZIP subfolders, CSV everywhere,
  lazy financial-report loading (still always-on via `useFinancialReport`).
- P2: tax pack (รายงานภาษีขาย + manual-input ภ.พ.30 worksheet, ภ.ง.ด.3/53/1),
  payroll exports, WHT certificate batch PDF (+ ownership/format hardening),
  extract `buildCalcRows` from `payroll/index.tsx`.
- P3: full backup/restore with dry-run + sequence reconciliation, history UI.
