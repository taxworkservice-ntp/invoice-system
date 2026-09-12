# Catalog-price deviation warning — Session Record

_Session date: 2026-09-11. Focus: wrong unit price on DN/deal lines
(officer typos). Earlier: 10 after-print services seeded (AFT-*) with
job details; job-detail preset dropdown reopen fix (`deals/new.tsx`)._

## ✅ MIGRATION APPLIED (2026-09-11, via Management API)

- **`sql/add_price_deviation_warn_pct.sql`** — applied to project
  `fbhoqcpqqtbiorzbuqcl`: `client_profiles.price_deviation_warn_pct
  numeric(5,2) NOT NULL DEFAULT 10.00`; 6 existing profiles backfilled
  to 10. Verified via PostgREST select + update round-trip on
  testcompany workspace.
- Defensive fallbacks stay in the code (harmless): deal form
  `?? 10`, settings save retries without the column on schema lag.

## What shipped (frontend-only, live without migration)

- `src/types/index.ts` — `ClientProfile.price_deviation_warn_pct?: number | null`.
- `src/app/(client)/settings/documents.tsx` — new "การตรวจสอบราคา"
  section: numeric % input (0 = off, blank = 10%), validated 0–100,
  wired into hydrate/save/dirty + migration-missing fallback above.
- `src/app/(client)/deals/new.tsx`:
  - `getPriceDeviation(lineItem, warnPct)` — compares typed `unit_price`
    vs catalog `base_unit_price` converted to the line's current unit
    (carton sales don't false-trigger). Skips: warnings off (≤0),
    free-text lines (`base_unit_price == null`), zero expected/typed
    price, blank-form DNs.
  - Amber non-blocking hint under ราคา/หน่วย on all line-item doc forms
    (QT/INV/DN): `⚠ ต่างจากแค็ตตาล็อก ฿X/หน่วย`.
- Verified: `tsc --noEmit` clean, `npm run build` passes, 11/11 logic
  cases pass (typo/rounding/discount/free-text/carton/zero/off/custom
  threshold). Live DB check: 10 AFT-* services all
  `has_job_details=true`, 50 fields, 290 presets.

## Mandatory DN price review (same day, later)

- **Migration `sql/add_require_dn_price_review.sql` — APPLIED** via
  Management API (`client_profiles.require_dn_price_review boolean NOT
  NULL DEFAULT false`); 6 profiles backfilled false. Verified
  false→true→false round-trip on testcompany, left OFF.
- `ClientProfile.require_dn_price_review?: boolean`; settings toggle in
  the ใบส่งของ card (default off — blocking save is opt-in only).
- `deals/new.tsx`: `LineItemForm.price_confirmed` (form-local, never
  saved). False on new/catalog-change/unlink/draft-load; true on price
  edit or per-line checkbox. DN-only UI: รอตรวจ badge + checkbox.
  `handleSave` blocks DN save with remaining count; blank-form DNs exempt.
- `DeliveryNoteFromQuotationForm.tsx`: same `price_confirmed` lifecycle
  on `DeliveryLine`, same gate in its `handleSave` (no blank-form
  concept there — gate always applies when enabled).
- Verified: `tsc` clean, `npm run build` passes.

## Price history "ราคาที่เคยขาย" (same day, later — calculator dropped)

- **Migration `sql/add_line_items_user_item_index.sql` — APPLIED** via
  Management API (`ON document_line_items (user_id, item_id, created_at DESC)`).
- `src/lib/priceHistory.ts` (new) — `fetchPriceHistory()` over
  line-item snapshots joined to documents→customers; skips voided +
  credit/billing notes; customer-scoped or global. Gotcha fixed:
  `document_line_items` has TWO FKs to `documents`, so the embed must
  hint `documents:document_line_items_document_id_fkey!inner(...)`
  (filters use the `documents` alias). Verified live on WH-STORAGE
  (3 rows, incl. customer-scoped).
- `src/components/documents/PriceHistorySheet.tsx` (new) — bottom
  sheet (Modal): ลูกค้านี้/ทั้งหมด toggle, rows with doc badge +
  customer + qty + discount, tap-to-apply; empty states per filter.
- `deals/new.tsx` — History icon per catalog line, cached last-price
  inline hint on catalog pick (customer-first, else global last;
  `itemId|customerId` key, silent fail), sheet mount; apply flows
  through `updateLineItem(unit_price)` so DN review-confirm +
  deviation hint compose. Price wrapper changed `<label>`→`<div>`
  (now hosts nested buttons).
- Verified: `tsc` clean, `npm run build` passes.
- Queued (not built): same sheet in invoice/DN-from-source forms via
  `source.item_id` adapters; calculator FAB dropped per owner.

## History polish (same day, later)

- Professional wording: chip + sheet title now `ประวัติราคาขาย`
  (inline blue hint `เคยขายลูกค้านี้ ฿X — แตะเพื่อใช้` kept as-is).
- Per-row deal link: `PriceHistoryRow` += `documentId` + `dealId`
  (embed extended, verified live on WH-STORAGE rows); rows
  restructured to sibling layout (apply button + `↗ งานขาย` anchor,
  `target=_blank` so the unsaved DN form is never lost; no deal =
  no link). Footer note updated.
- Verified: `tsc` clean, `npm run build` passes.

## History row final form (same day, later)

- Frequency-weighted hierarchy (two-button stack rejected as heavy):
  single filled `ใช้ราคานี้` button per row (right column, under
  price); deal access via the doc number itself as a blue new-tab
  link (`DN-… ↗`, plain gray text when deal-less). Row body is a
  non-interactive div — curiosity taps harmless; dangerous direction
  (silent apply) impossible, safe direction (stray tab) trivial.
- Verified: `tsc` clean, `npm run build` passes.
