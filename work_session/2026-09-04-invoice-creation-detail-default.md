# Invoice creation default → detail lines — Session Record

_Session date: 2026-09-04. Follow-up to `2026-09-02-classic-v2-ref-mode-dn-table.md`
Round 3 (print preview default → รายการเต็ม). No migration — localStorage-only
behavior change; no DB columns touched._

## Diagnosis

User reported a tax invoice still printing:

> ใบส่งของ DO-2026-09-004
> วันที่ส่งของ: 1 ก.ย. 2569 · รายการ 1 บรรทัด

Traced to `InvoiceFromDeliveryNotesForm.tsx:653-661` (refOnlyMode save path):
`item_name = "ใบส่งของ {doc_number}"`, `line_note = "วันที่ส่งของ: {date} ·
รายการ {n} บรรทัด"`, qty 1, `source_line_item_id = null`. This is **saved
invoice data**, not a print rendering — the invoice was created with
โหมดอ้างอิง ON, so item detail was never stored.

Why Round 3 didn't stop it: Round 3 flipped only the **print preview** toggle
default (`print.tsx:240-243`). The **creation form** still defaulted
`refOnlyMode` to TRUE (`!== "false"`, i.e. on for every fresh browser and
anyone who never explicitly toggled it off), and the choice is remembered per
browser. New DN-sourced invoices kept being born collapsed, and no print
setting can expand them: `dnBandLabelFor` needs `source_line_item_id`
(`PrintDocumentClassicV2.tsx:278`), the DN table needs links — ref-saved rows
render as plain numbered rows in detail mode (accepted limitation, Round 2).

## Fix

- `InvoiceFromDeliveryNotesForm.tsx:164-172` — default `false`, opt-in via
  `localStorage === "true"` (same key, so users who explicitly chose ref mode
  keep it; everyone else now gets detail).
- `InvoiceFromQuotationForm.tsx:148-156` — identical flip (shared
  `invoice-system.invoiceRefOnly` key).

## Existing collapsed invoices (data, not fixable by this change)

- Draft → แก้ไขฉบับร่าง / recreate from the DNs with โหมดอ้างอิง OFF.
- Issued → void-and-recreate (`documents/[id].tsx` flow) with the toggle OFF.
- Verified: `npx tsc --noEmit` clean.
