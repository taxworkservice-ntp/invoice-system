# Classic V2 Reference Mode — Unified DN Reference Table — Session Record

_Session date: 2026-09-02. Continues `2026-09-02-classic-v2-fonts-settings.md` (uncommitted WIP on `main` — refCollapse export feature). No migrations pending._

## Decision

Reference mode (โหมดอ้างอิง) for classic V2 invoices now has **ONE shape**: the
`รายการใบส่งของ (DELIVERY NOTES)` reference table (billing-note style), rendered
from `invoice_delivery_notes` links — in **both** the on-screen preview and the
exported PDF. The collapsed-lines variant (1 บรรทัด/DN via
`collapseDeliveryNoteGroups`) was removed from the print pipeline.

Rationale: the preview previously collapsed lines while the PDF (intended to
show the DN table) crashed on an out-of-scope `isClassicV2` reference — three
different possible outputs confused users, and the collapse leaked standalone
lines (e.g. ค่าจัดส่ง) into the last DN group's total.

## Changes (`src/app/(client)/documents/print.tsx` only)

- **Scope fix**: `isClassicV2` hoisted to component scope — was only defined
  inside `getPrintBatches`, so the export branch (`refCollapse && isClassicV2 …`)
  threw `ReferenceError` at runtime and `TS2304` at typecheck.
- **Shared flag** `showDnReferenceTable` = classic_v2 + refCollapse +
  doc_type `invoice` + `invoiceDeliveryNotes.length > 0`.
- **Preview** renders `<PrintDocumentClassicV2 pageMode="single" refCollapse />`
  when the flag is set (identical to PDF export path, incl. server PDF via
  `?refCollapse=1` from `server/handlers/documents/[id]/pdf.js`).
- **Removed** the collapse step + `[refcollapse-debug]` log from
  `getPrintBatches` (param `refCollapse` dropped from its signature).
  `collapseDeliveryNoteGroups` stays in `src/lib/print.ts` (exported, used by
  the print-layout fixture) — templates' inert `ref_collapsed` guards untouched.
- **Fallback**: docs with DN markers but no links (tax_invoice_receipt, legacy)
  print full detail lines — reference mode needs links to render the table.
- **Toggle** (`showRefModeToggle`): now visible for any classic V2 invoice with
  DN links (previously only when qty-0 marker rows existed, which hid it for
  invoices saved via the form's reference mode). Relabelled
  "แบบอ้างอิง (1 บรรทัด/DN)" → "แบบอ้างอิง (ตารางใบส่งของ)".

## Verification

- `npx tsc -p tsconfig.app.json --noEmit` — clean.
- Fixture render (`scripts/print-layout-fixture.tsx?template=classic_v2&doc=dn&refCollapse=1`)
  via Playwright — DN table correct (2 rows: 1,669.20 / 470.80; totals 2,100 /
  147 / 2,247).
- `npx tsx tests/print-layout/pagination.many.check.ts` — passes.
- `npm run test:print-layout` — **pre-existing failures, unrelated**: classic_v2
  baselines were never captured (missing), classic/modern show font
  environment diffs (run with `CHROME_EXECUTABLE_PATH=/Applications/Google\
 Chrome.app/Contents/MacOS/Google Chrome npm run test:print-layout`).
  Baselines need a one-time `--update` on the reference machine (not done here).

## Fixture (kept for future testing)

`scripts/print-layout-fixture.tsx` gained a `doc=dn` variant (invoice from 2
DNs: markers + sub lines + standalone line, faithful to
`InvoiceFromDeliveryNotesForm` output) and `refCollapse` params:
`refCollapse=1` → DN table prop; `refCollapse=lines` → collapse via the real
`collapseDeliveryNoteGroups` (kept for regression of the lib function).

## Round 3 — preview default flipped to รายการเต็ม

User reported INV-2026-09-050 "still shows like reference mode". Diagnosis:
rendered the invoice's **real data** (1 marker + 2 subs + 1 link, classic_v2
xlarge) through the actual component headlessly — detail and reference modes
both render correctly. The real issue: the print page **opened in reference
mode by default** (WIP default `localStorage !== "0"`), so every invoice —
including detail-saved ones — showed the DN table first.

- **Fix** (`print.tsx`): default is now รายการเต็ม; แบบอ้างอิง is opt-in and
  remembered per browser (`localStorage === "1"`). URL `?refCollapse=1`
  (server PDF) still forces reference mode.
- Also told user to hard-refresh — stale dev bundles mask the changes.
- Fixture note: a temporary `doc=real050` diagnostic variant (copy of the
  real invoice) was added and removed; a `git checkout` mishap reverted the
  whole fixture file — the `doc=dn` + `refCollapse` params were re-applied.

## Round 2 — detail mode: DN band + numbered item lines (Option A′)

User found detail mode "looked like reference mode": the qty-0 DN marker
header rows (ใบส่งของ DN-…, bold, consuming a row number with empty
qty/amount cells) read like fake rows. Chosen fix — **DN band + numbered
item lines** (user explicitly wanted "one line as DN reference, other lines
show item detail per line"):

- **`PrintDocumentClassicV2.tsx`**: qty-0 marker rows filtered from the
  items table (`isDnMarkerLine`); each group start renders a slim full-width
  band row (`print-classic-dn-band-row`, small gray `ใบส่งของ DN-… (วันที่ …)`
  label derived from `lineDeliveryNoteMap`, colSpan full row, no number);
  every item line now numbered consecutively (1..n across pages); the inline
  `อ้างอิง DN-…` note block removed (bands replace it — `showInlineDeliveryNotes`
  no longer destructured); variance + invoice-number notes unchanged.
  `blankLineCount` pads to `MIN_CLASSIC_ITEM_ROWS - (lines + bands)`.
- **`print.tsx` getPrintBatches**: marker rows filtered before pagination
  (classic_v2 only — V1 still renders markers, modern untouched) so budgets
  and cross-page numbering match the render; group-start lines charged the
  band height via `estimateLineItemHeight({ hasDnGroupBand: true })`.
- **`src/lib/printRowHeight.ts`**: `hasDnGroupBand` option (+6.5mm, scaled).
- **`src/index.css`**: `.print-classic-dn-band-row` / `-label` styles
  (#f8fafc bg, 7pt × items scale, 1.2mm padding). Old marker-row CSS kept —
  classic V1 still uses it.
- Bands derive for quotation-sourced lines too (`ref.kind === "quotation"` →
  ใบเสนอราคา …); lines without a `lineDeliveryNoteMap` entry get no band.
- Ref-saved invoices (one row per DN, no source_line_item_id) render as plain
  numbered rows without bands (accepted data limitation).

Verified: tsc clean, pagination unit check passes, fixture renders
(doc=dn: bands + numbering 1-4, totals unchanged; refCollapse=1: DN table
identical to round 1). V1/modern code paths untouched.

## Round 1 — reference mode unified to the DN table

- Capture classic_v2 print-layout baselines (`npm run test:print-layout:update`)
  on the reference machine; the WIP variants list already includes them.
- Print-timeline: `collapseDeliveryNoteGroups` can be deleted (with the
  fixture's `refCollapse=lines` param and `ref_collapsed` guards) if reference
  mode stays DN-table-only.
