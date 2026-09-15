# 2026-09-15 — Tax-invoice printed-title presets (print only)

## What
A VAT-registered invoice (ใบกำกับภาษี) can now print a combined header title —
e.g. **ใบกำกับภาษี/ใบส่งของ/ใบแจ้งหนี้** — while the document stays a tax
invoice everywhere else. `doc_type` and all in-app labels are unchanged; only
the rendered header (preview + PDF + reprints) uses the preset.

## Files
- `src/lib/docLabels.ts` — `PRINT_TITLE_PRESETS` (fixed Thai/EN pairs),
  `PrintTitleVariant`, `isTaxInvoice`, and `printTitle(document)`. Presets are
  not free text so the legal label stays leading and consistent.
- `src/types/index.ts` — `Document.print_title_variant`.
- Print components now use `printTitle(document)`: `PrintHeader.tsx` (Modern),
  `PrintDocumentClassic.tsx`, `PrintDocumentClassicV2.tsx`,
  `PrintContinuationHeader.tsx`. In-app lists/badges keep `documentTypeLabel`.
- `src/index.css` — Classic V2 caps the right title block (`max-width: 80mm`) +
  `overflow-wrap: anywhere` so the one combined line wraps instead of squeezing
  the company column.
- Authoring: `deals/new.tsx`, `InvoiceFromQuotationForm.tsx`,
  `InvoiceFromDeliveryNotesForm.tsx` (select in Document options, shown only for
  VAT invoices) + payloads; `documentCopy.ts` carries the field. The print
  preview toolbar (`documents/print.tsx`) has the same select and PATCHes the
  document so preview/export/reprints agree.
- `sql/20260915_document_print_title_variant.sql` (new) — column + recreates
  `create_deal_document` and `create_invoice_from_sources` to whitelist it.
- Tests: `tests/unit/printTitle.test.ts`; print-layout fixture/regression gained
  `printTitle` variants with baselines
  `classic_v2-original-title-combined.png` / `modern-original-title-combined.png`.

## Verify
- `npx tsc -b` clean; `vitest run tests/unit` 71/71.
- `test:print-layout`: new combined-title baselines pass; modern/classic
  failures are pre-existing/environmental.
- `pagination.many` all assertions passed.

## ⚠️ PENDING — apply manually before deploying the client
Run `sql/20260915_document_print_title_variant.sql` in the Supabase SQL editor
FIRST. Until then the two invoice RPCs silently drop the field and preview
PATCHes fail (unknown column).
