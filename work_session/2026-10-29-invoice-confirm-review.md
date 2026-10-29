# 2026-10-29 — Invoice from DN/quotation: review-and-confirm step

## What changed

The final “สร้างใบแจ้งหนี้” action no longer saves immediately. It opens a
review modal that owns the irreversible presentation choice:

- **โหมดรายละเอียด** (default, recommended) — item lines with qty/price/discount.
- **โหมดอ้างอิง** — one printed line per source document (like a billing note).

The chosen mode is encoded into the saved line records, as before; no schema
change. The form always keeps the editable detail grid so quantities and prices
can still be adjusted before review.

## New files

- `src/lib/invoiceFromSources.ts`
  - `buildInvoiceLineRecords({ mode, sources, manualLines })` — the single
    source of truth for both the preview and the RPC payload.
  - `buildInvoicePreview(records, mode)` — grouped detail preview / flat
    reference preview, with zero-qty group markers hidden.
  - `invoiceLineNet` — shared line-total formula.
- `src/components/documents/InvoiceCreateConfirmModal.tsx`
  - Summary strip (customer, date, number, sources, items, PO/task/note).
  - Radio mode cards with printed-line counts and a “แนะนำ” badge on detail.
  - Irreversible-choice warning.
  - Scrollable preview with sticky table header; mobile hides unit/discount
    columns.
  - Totals + always-visible net in the sticky footer.
  - Variance checkbox under the detail mode only.
  - Inline error, loading/close guards, and a mobile full-screen sheet.
- `tests/unit/invoiceFromSources.test.ts` — 6 tests for both modes, manual
  lines, zero-qty exclusion, totals parity, and preview grouping.

## Wiring

### Delivery notes

`InvoiceFromDeliveryNotesForm.tsx`

- Removed `refOnlyMode` and the `invoice-system.invoiceRefOnly` localStorage
  key. Detail is the default for every invoice.
- Removed the inline mode toggle and ref-mode form preview from step 3.
- Step 4 now shows a read-only “รูปแบบเอกสาร — เลือกตอนยืนยัน” note, keeps the
  appendix option.
- `handleSave(mode)` uses the shared builder; `show_dn_variance` is forced off
  in reference mode.
- The action bar now says **“ตรวจสอบและสร้างใบแจ้งหนี้”** and opens the modal.
- Mixed-VAT / mixed-deal notices are repeated in the modal summary step.

### Quotations

`InvoiceFromQuotationForm.tsx`

- Same treatment, with `sourceLabel="ใบเสนอราคา"` and the quotation variance
  copy.
- The print-title selector stays in step 4; only the mode/variance moved.
- `hasMixedDeals` blocks the modal with the existing error message.

### Shared modal

`src/components/ui/Modal.tsx`

- Rendered through `createPortal(..., document.body)` so app chrome (especially
  the mobile bottom nav) can no longer sit above a modal in a parent stacking
  context. This is a global improvement; no API change.

## E2E updates

Updated the existing create flows to go through the review modal:

- `e2e/invoice-from-dn.spec.ts`
  - Default detail is asserted.
  - Reference preview is asserted (one line per DN).
  - Added a reference-mode create test that verifies the saved line shape.
  - Over-billing test now confirms through the modal.
- `e2e/invoice-from-quotation.spec.ts`
- `e2e/deal-flow-journey.spec.ts` (both create paths)
- `e2e/deal-flow-qa.spec.ts` (A3)

## Verification

- `npx tsc --noEmit` clean.
- `npm run lint` — 0 errors (remaining warnings are pre-existing).
- `npx vitest run tests/unit/invoiceFromSources.test.ts` — 6/6 passed.
- `npm run build` — passed.
- Manual visual QA with real test-workspace data:
  - 1440px review modal: summary, mode cards, detail preview, reference
    preview, variance, sticky footer net + confirm.
  - 390px full-screen sheet: both mode cards visible, footer buttons fit,
    bottom nav no longer overlays the modal.

## Notes

- No database migration.
- The permanent e2e specs were updated but could not be run locally: the local
  workspace has no service-role key, which `e2e/helpers/env.ts::admin()` needs
  for `getUserId`/cleanup. CI should run them.
- Reference mode remains irreversible: the mode is encoded in the saved line
  records; changing it later requires voiding and re-issuing the invoice.
