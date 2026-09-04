# DN totals settings-only + section 4 summary — Session Record

_Session date: 2026-09-04. No migration — creation-layer only; print components
and both DB flags untouched, so saved history renders identically._

## A. DN full-totals → settings-only (removes form confusion)

- `deals/new.tsx` — removed `showFullTotals`/`totalsTouched` state, workspace
  hydrate effect, draft hydrate setter, and the `แสดงยอดรวมแบบใบแจ้งหนี้` row.
  Save writes: draft edits → frozen saved value (`frozenShowFullTotals` ref);
  new docs → `clientProfile.delivery_note_show_full_totals` explicitly (never
  omitted — RPC `coalesce` would force false). Replaced row with a muted hint
  pointing at ตั้งค่า › ใบส่งของ + current state (สรุปแบบเต็ม/มูลค่ารวม).
- `DeliveryNoteFromQuotationForm.tsx` — identical removal (state, hydrate,
  save, row → same hint).
- `settings/documents.tsx` — ใบส่งของ card description now states new-docs-only
  + history frozen; added missing `dnShowFullTotals` to `isDirty`.
- `lib/documentCopy.ts` — DN copies (new docs) read the workspace setting
  directly; fall back to source value when unreadable.

## B. Section 4 summary (stays collapsed by default)

- `deals/new.tsx` — collapsed header shows `VAT {n}% · หัก ณ ที่จ่าย {label} ·
  มี/ไม่มีหมายเหตุ`; auto-expands once after load when note non-empty or WHT
  differs from workspace default. Inputs/save untouched.

## Verification

- `npx tsc --noEmit` clean; no `showFullTotals`/`totalsTouched` refs remain.
- Manual QA pending: new DN with setting ON/OFF → full vs มูลค่ารวม print;
  draft edit keeps saved value; section-4 collapsed/expanded/draft states.
