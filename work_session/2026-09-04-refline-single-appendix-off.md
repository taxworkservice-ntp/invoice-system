# Ref-mode single line + appendix soft-disable — Session Record

_Session date: 2026-09-04. Follows `2026-09-04-invoice-creation-detail-default.md`.
No migration in this change. Two production data actions remain manual (below)._

## A. Single-line ref rows (shipped, `e3f0084`)

- `InvoiceFromDeliveryNotesForm.tsx` refOnlyMode save: `item_name =
  "{doc_number} วันที่: {formatBuddhistDate}"`, `line_note = null`.
  Verified output: `"DO-2026-09-004 วันที่: 1 ก.ย. 2569"`, no newline.
  Old `ใบส่งของ` prefix and `รายการ N บรรทัด` count dropped; no template
  changes needed (one stored line = one printed line in V2/Classic/Modern).
- Detail-mode qty-0 markers, form UI group summaries (`1071`), and the
  quotation form's ref path intentionally untouched.
- Verified: `tsc` clean; no code parses the old prefix/note format.

## B. Backfill open invoices (MANUAL — Supabase SQL editor, dry-run select first)

Test workspace has 0 matching rows; production is where the user's invoice lives:

```sql
-- dry run
select d.doc_number, li.item_name, li.line_note
from document_line_items li join documents d on d.id = li.document_id
where d.status <> 'voided' and d.doc_type = 'invoice'
  and li.source_document_id is not null and li.source_line_item_id is null
  and li.quantity = 1 and li.item_name like 'ใบส่งของ %';
```

Then merge `item_name` (`doc_number + ' วันที่: ' + Buddhist date`) and null
`line_note` for the same predicate. Date text must match `formatBuddhistDate`
(Thai month abbrev + Buddhist year).

## C. Appendix soft-disable (MANUAL — admin panel, no code)

- Test workspace has NO `dn_appendix` row in `client_features` → already OFF
  there (flag is opt-in). Production: confirm `dn_appendix` is not enabled for
  any workspace (admin clients page → features). That hides the creation
  toggle + print checkbox with zero code churn, fully reversible.
- Known half-wiring left as-is (preview checkbox never resyncs, modern client
  PDF never appends, server keys off DB flag) — revisit only if re-enabled.
- Full code removal mapped in plan discussion if ever wanted (component,
  `lib/print.ts` builder/canvas, 6 RPC whitelists, fixture/regression
  variants); DB column stays regardless.
