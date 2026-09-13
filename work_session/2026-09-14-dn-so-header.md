# 2026-09-14 — DN SO group header (opt-in, Classic V2)

## What
Free-text SO line on delivery notes (e.g. `SO7944758301/Z033248905 Part no.25120021 (เห็ด)`),
typed via a mode toggle in section 3 (รายการสินค้าและบริการ) of both DN forms.
Classic V2 prints it as group `1.` (children `1.1…`); tax invoices billed from the
DN freeze a copy as a second line under their DN group header. Empty = flat
layout, byte-identical everywhere. Only ~5% of customers need it — off by default.

## Files
- `sql/20260914_dn_so_header.sql` — alters + guarded backfill + recreates
  `create_deal_document` (+`dn_so_header` whitelist) and `create_invoice_from_sources`
  (+`so_header` frozen snapshot in the link insert)
- `src/types/index.ts` — `Document.dn_so_header`, `InvoiceDeliveryNote.so_header`
- `src/components/documents/DnSoHeaderField.tsx` (new, shared toggle) —
  wired in `deals/new.tsx` (DN-only, items card) and `DeliveryNoteFromQuotationForm.tsx`
  (items step); `documentCopy.ts` carries it on DN→DN copy
- `src/lib/dnGroups.ts` — `getDnSoHeaderText` (shared empty-means-off predicate),
  `buildDnSoHeaderPlan` (single group, takes precedence over QT back-ref on DNs),
  `soHeader` threaded through `DnRefInfo` → block → header payload
- `src/lib/print.ts` — `normalizeSoHeader`, link + fallback selects carry `soHeader`
- `PrintDocumentClassicV2.tsx` + `index.css` (`.print-classic-dn-group-so`) — render
- `printRowHeight.ts` (`dnGroupSoHeader`, full-band wrap count) + both charging
  sites (`PrintDocumentClassicV2` filler, `print.tsx` batching, shared predicates)
- `tests/unit/dnSoHeader.test.ts` — 9 tests (predicate, plans, frozen snapshot, reserve)

## Verify
- `npx tsc -b` clean; `vitest run tests/unit` 18/18; pagination check script passes
- `test:print-layout` failures are pre-existing/environmental — identical output on
  the pristine tree (missing V2 baselines, modern/classic pixel drift)

## ⚠️ PENDING — apply manually before deploying this code
Run `sql/20260914_dn_so_header.sql` in the Supabase SQL editor FIRST.
Until then, DN saves carrying `dn_so_header` will fail on the direct insert path
(unknown column); the RPC path ignores the extra jsonb key safely. No RLS change
needed. Backfill is guarded (zero-row on fresh DB → no invoice touch-trigger →
no PDF cache invalidation).
