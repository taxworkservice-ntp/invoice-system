# Classic V2 Reference Mode — Unified DN Reference Table — Session Record

_Session date: 2026-09-02. Continues `2026-09-02-classic-v2-fonts-settings.md` (uncommitted WIP on `main` — refCollapse export feature). All migrations applied to production Supabase (project `fbhoqcpqqtbiorzbuqcl`)._

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

## Round 7 — quotation per-line example photos (classic V2)

Optional per-line example photo for quotations ("รูปตัวอย่างงาน"), printed
under the item name inside the description cell at a fixed 26mm height
(≈4 cells).

- **`sql/20260902_quotation_line_images.sql`** — ✅ applied via Management
  API: `document_line_items.image_url text` + `create_deal_document` RPC
  re-created with the column in both the document and line-item INSERT
  whitelists.
- **Upload** (`src/components/documents/LineImageUpload.tsx`): per-line
  "+ เพิ่มรูปตัวอย่าง" in the quotation editor (deals/new.tsx, quotation
  type only) — compresses >2MB photos (shared `src/lib/imageCompress.ts`,
  extracted from ImageUpload), uploads to `line-images/{userId}/{uuid}.ext`
  via `uploadToR2`, stores the R2 KEY on the line (proxied at render).
  Thumbnail + เปลี่ยนรูป/ลบรูป. Draft-edit restores the saved key.
- **Print**: classic V2 QUOTATIONS only (`doc_type === "quotation" &&
  image_url`) — `<img>` under the name, `object-fit: contain`, 26mm fixed.
  `estimateLineItemHeight({ hasLineImage })` adds 26.8mm (font-scale
  independent). DN/invoice conversion paths create fresh lines without
  image_url — data intentionally does not flow.
- **Copy-through**: documentCopy + void-and-recreate clones carry image_url.
- **Cleanup**: deleteDraftDocument deletes each line's R2 object
  (best-effort) before removing the lines.
- Verified: tsc clean, pagination checks pass, fixture `doc=qt` renders the
  image at 26mm/row 37.1mm with totals intact.

## Round 6 — vertical-space options (classic V2): ซ่อนป้ายภาษาอังกฤษ + ลายเซ็นกระชับ

Two workspace toggles in ตั้งค่า > รูปแบบเอกสาร (+ unconditional margin
tightening), all scoped to `.print-theme-classic-v2` (V1/modern untouched):

- **`sql/20260902_classic_v2_space_options.sql`** — ✅ applied via Management
  API: `client_profiles.classic_v2_hide_english_labels` +
  `classic_v2_compact_signature` (booleans, default false).
- **Toggle ซ่อนป้ายภาษาอังกฤษ** (`print-hide-en` sheet class): CSS hides all
  EN sub-labels — `.en` spans (thead/section titles), `.print-classic-totals-en`,
  meta/label/sig EN spans, doc title EN, copy badge EN, paid badge EN.
  Company EN NAME stays visible. Embedded-EN strings split into spans:
  `SIG_LABELS` roles → `box1RoleTh/box1RoleEn` + `box2RoleTh/box2RoleEn`,
  sig date "วันที่ / DATE" → `print-classic-sig-dt-en` span.
  Measured: meta row 6.3→4.5mm, thead 8→5.8mm, sig titles −3mm.
- **Toggle ลายเซ็น/ท้ายเอกสารกระชับ** (`print-sig-compact`): slimmer sig cells,
  sig line 10→8mm, date segs 4.5→3.6mm. Measured band 36.7→27.9mm (with
  hide-EN; −5.8mm).
- **Unconditional margins**: header padding-bottom 3→2mm, items-wrap
  margin-top 3→2mm, bottom-band margin-top 2.5→1.8mm (V2-scoped).
- **Budgets stay honest**: measured deltas returned to pagination as
  `spaceBonusMm` (per mode: first/firstMulti/continuation/last) — new
  `getRowBudgets`/`PaginateOptions`/`paginateRowsByHeight` opts + constants
  (`CLASSIC_V2_HIDE_EN_META_ROW_MM 1.8`, `HIDE_EN_THEAD_MM 2.2`,
  `HIDE_EN_SIG_MM 3`, `COMPACT_SIG_MM 5.5`, all rounded down). The PO/JOB
  meta-row reserve shrinks to 4.7mm when hide-EN is on. Existing tests
  unchanged (they don't pass the new opts).
- **Settings**: two Switches in the classic V2 block (hydrate/save/dirty
  wired). Fixture: `hideEn=1` / `compactSig=1` params for rendering.
- Verified: tsc clean, pagination checks pass, renders show Thai-only labels
  + compact band; totals rows are padding-driven (hide-EN gains 0 there —
  accounted for).

## Round 5 — ใบกำกับภาษี/ใบเสร็จรับเงิน (tax_invoice_receipt) retired

The 2-in-1 document is dropped: "tax invoice" now always means the (VAT)
invoice, and payment is recorded on the invoice (status 'paid') instead of a
combined document.

- **Data** (`sql/20260902_drop_tax_invoice_receipt.sql`, ✅ applied via
  Management API): the 4 existing TIR documents (TAX-2026-06-001…003,
  QA-20260627-149026-TAX-CASH) converted to `doc_type='invoice',
  status='paid'`, keeping payment_method / paid_at / amount_received so deal
  financials treat them as collected. Verified: 0 TIR rows remain. The DB
  enum value itself cannot be dropped (Postgres limitation) — left in place,
  no app code references it.
- **Code**: `DocumentType` union shrunk (types/index.ts); all references
  removed across src — constants (label/short/color maps, per-type font keys),
  docLabels, docPresentation, documentCopy (TIR payment-field copy → null),
  documentSend, print.ts, receiptInvoices, receiptTotals, useDeals (combined-
  receipt pick), useDocuments, useReports, stock.ts, dealStatus,
  dealFinancials, dealStages, dealStages locks, CreditNoteForm, settings
  (documents visibility list, per-type font tab), print components (modern/
  classic/classic V2/PrintHeader — TIR title blocks, ref-label branches,
  SIG_LABELS entry, bank/payment-type sets), pages (deals/new TIR creation
  flow incl. payment UI + "issued" status + permission gate, deals/[id],
  documents/[id], documents/index, documents/print, download-center, home,
  customers, NewDealSheet TIR quick-create card, DealSummarySheet).
- **Deliberately kept**: server/handlers/admin/clients/[id]/index.js cleanup
  list (defensive — the enum value still exists in the DB);
  doc_number_sequences rows for TIR (history).
- **Tests**: integration harness sequence list updated (no TIR seeding).
- Verified: tsc clean, `vite build` passes, fixture renders (classic V2
  detail/ref + modern) with correct ใบกำกับภาษี titles and no page errors.

## Round 4 — customer PO reference + task name (classic V2)

Optional document-level fields, printed as conditional rows in the classic V2
info-band meta table: `ชื่องาน / JOB NAME` (documents.task_name) and
`เลขที่ใบสั่งซื้อ / PO NO.` (documents.customer_po_number). Absent fields =
layout unchanged.

- **`sql/20260902_document_po_task.sql`** — ✅ APPLIED to production Supabase
  (project `fbhoqcpqqtbiorzbuqcl`, 2026-09-02, via Management API; columns +
  both RPCs verified live). Adds both columns and re-creates
  `create_invoice_from_sources` + `create_deal_document` RPCs so inserts
  persist them (both have explicit column whitelists). Pattern follows
  `sql/20260903_document_print_font_scale.sql`.
- **Types**: `Document.customer_po_number` / `task_name` (src/types/index.ts).
- **Forms** (optional inputs near หมายเหตุ): InvoiceFromQuotationForm
  (payload via p_document), DeliveryNoteFromQuotationForm (docPayload),
  InvoiceFromDeliveryNotesForm (p_document), deals/new.tsx (docPayload).
- **Flow-down**: quotation → DN/invoice pre-fills PO/task (manual edits
  survive selection changes via a derived-value ref); DN → invoice pre-fills
  only when all selected DNs share the same value; draft-edit paths restore
  saved values; copy-through in documentCopy.ts + void-and-recreate clones
  (deals/[id].tsx, documents/[id].tsx). Receipts/billing notes/credit notes
  untouched.
- **Pagination safety**: each filled meta row reserves its measured height
  (6.35mm @ปกติ → `CLASSIC_V2_META_ROW_RESERVE_MM = 6.5`, × header scale)
  via `extraReserveMm` in getPrintBatches — same mechanism as the billing-note
  cheque strip — so dense first/last pages never overflow A4.
- Verified: tsc clean, pagination checks pass, fixture renders show the
  meta rows in both detail and reference modes (totals unchanged).

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
