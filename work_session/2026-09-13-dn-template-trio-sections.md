# 2026-09-13 — DN template trio + multi-section groups (Classic V2)

## What
Four DN (delivery_note) changes, Classic V2 only except where noted:
1. **Hidden-amount columns kept** — ซ่อนจำนวนเงินใน PDF no longer collapses the
   ราคา/หน่วย + จำนวนเงิน columns; headers, cells and vertical rules stay, only
   values hide. Description column fixed at 87mm, so wrapping/pagination matches
   the amounts-shown layout (pagination height estimates now always use the
   narrow width in V2).
2. **Multi-section groups** — DNs can carry MORE THAN ONE reference group via
   section-header marker lines (qty 0, price 0, no source, `line_note =
   [DN_SECTION]`, `item_name` = header text). Each marker splits the lines below
   it into a flat `G / G.j` section. Legacy single `dn_so_header` still takes
   precedence; unmarked runs keep today's auto-grouping; no markers =
   byte-identical legacy plan.
3. **Regular item-table font (global setting)** — new workspace toggle
   ตั้งค่า › เทมเพลตเอกสาร › ตัวหนังสือปกติในตารางรายการ (Classic V2):
   all item-table text (headers, amounts, group labels/numbers, section titles)
   at weight 400. Totals/signature/header untouched. Needs migration (below).
4. **DN signature box 3 → ผู้ออกเอกสาร / ISSUED BY** — company-name lines
   (ในนาม…/FOR…) removed on DN only; the label sits on the bottom role line
   like the other two boxes (no top title — the box mirrors the mid box:
   signature line, date, role, including its bottom-pinned `sig-cell-mid`
   alignment so all three dotted lines sit at the same height).
   Continuation-page initials strip also says ผู้ออกเอกสาร on DN.

## Files
- `src/lib/dnGroups.ts` — `DN_SECTION_TAG`, `isDnSectionMarker`,
  `getDnSectionHeaderText(s)`, `buildDnSectionPlan` (falls back to legacy plan
  with no markers), `isDnRefMarker` + `filterDnRefMarkers` (plan input keeps
  markers; render drops them), extracted `markGroupSpacers` (legacy tests prove
  the refactor is behavior-identical), shared `getPrintableLineNote` (also
  filters the tag; the 3 template copies + `printRowHeight` now import it)
- `PrintDocumentClassicV2.tsx` — always-render amount grid + `showAmountValues`,
  section-plan wiring, `print-regular-items` root class, DN issued-by box + strip
- `documents/print.tsx` — V2 pagination plans from marker-inclusive lines and
  always estimates the narrow description width (non-V2 path untouched)
- `PrintDocumentClassic.tsx`, `PrintLineItemsTable.tsx`, `printRowHeight.ts` —
  only the shared note helper (no visual change)
- `DnSectionMarkerRow.tsx` (new, shared editor) — wired into `deals/new.tsx`
  (DN items card + add button + precedence hint + validation + both save paths)
  and `DeliveryNoteFromQuotationForm.tsx` (same, incl. price-review exemption)
- `InvoiceFromDeliveryNotesForm.tsx` — post-create freeze of concatenated
  section headers onto `invoice_delivery_notes.so_header` when the RPC left it
  empty (RLS `for all` covers the update; no RPC/migration change)
- `settings/documents.tsx` + `types/index.ts` + `schema.sql` +
  `sql/add_classic_v2_regular_item_font.sql` (new) — the font toggle with the
  same schema-lag fallback pattern as `price_deviation_warn_pct`
- `src/index.css` — `.print-regular-items` overrides (specificity-checked)
- `tests/unit/dnSections.test.ts` (new, 9 tests incl. the plan-input wiring
  invariant that caught a real bug: planning from render-stripped lines loses
  every section)

## Verify
- `npx tsc --noEmit -p tsconfig.app.json` clean; `vitest run tests/unit` 27/27;
  `pagination.many.check.ts` passes
- `test:print-layout`: failures are pre-existing/environmental — IDENTICAL output
  on the pristine tree (no V2 baselines committed; modern ~2.6% / classic 100%
  pixel drift from machine fonts). Verified with system Chrome via
  `CHROME_EXECUTABLE_PATH` (bundled chromium ENOEXECs on macOS)
- Visual proof via temp fixture params (reverted afterwards): hidden DN keeps
  both amount columns; 2 SO sections number 1/1.1 + 2/2.1–2.3; issued-by box;
  computed weights 600 → 400 with the font flag on
- Not yet done by hand: create a real DN with 2 section headers in the app,
  print-preview + PDF, toggle the font setting, bill it to an invoice and check
  the frozen SO line

## Unification + opt-in toggle (same day, later)
Single `dn_so_header` field and marker lines were two UIs for one concept —
filling both silently preferred the single field (user confusion). Unified:
**markers are the only grouping model; the column is write-dead** (kept for
old reprints). Plus an opt-in toggle per DN form — OFF = today's flat flow,
ON = section UI. Toggle is UI-only state (init ON when markers/legacy header
exist); turning OFF confirms then deletes markers from state (never hidden).
- `dnGroups.getLegacyDnHeaderForConversion` (+ equivalence test: converted
  single marker ≡ legacy whole-doc plan) — both forms prepend the converted
  marker on draft open with a caption, and always save `dn_so_header: null`
- `documentCopy.ts` converts legacy → marker on DN copy (never an invisible
  header); markers themselves already survived copy
- `DnSoHeaderField.tsx` deleted; renderer/pagination/freeze untouched so old
  docs reprint identically

## Tax invoice 4-box signature band (same day, later)
Invoice only (Classic V2): received / delivered / issued / authorized, no
per-box dates. Company signature+stamp stay on the authorized box; the
issued box is hand-sign. `SIG_LABELS.invoice.box2` → ผู้ส่งของ/DELIVERED BY
(V2-only table); band gets `print-sig-4col` (4×1fr, dotted lines stay level
via the existing title/role height symmetry); shorter band is pagination-safe
(budgets err conservative). Other doc types keep 3 boxes + dates. Verified:
temp-fixture band screenshot (reverted), tsc + 35/35 tests.

## Invoice one-group-per-section (same day, later)
Invoice lines now freeze the DN section index (`document_line_items.
source_section smallint null`, migration applied via Management API —
legacy rows stay NULL). Billing form computes sections from DN marker runs
(`getDnLineSectionMap`, mirrors plan run-splitting incl. blank-marker rule)
and persists them post-create (RLS allows; RPC untouched; failures degrade
to the single group). `print.ts` resolves each line's own SO text
(`resolveSectionSoHeader`); `buildDnBlocks` keys on `source::section`
(null sections compare exactly as before — legacy/quota paths identical).
Reissue clones carry the field; copies keep stripping lineage (consistent
flat degradation). Verified: 35/35 tests, pagination check, temp-fixture
screenshot of a split DN (1/DN+SO-1111/1.1, 2/DN+SO-3333/2.1, …), reverted.
Key manual proof still open: bill a 2-section DN → rearrange DN sections →
reprint invoice unchanged. (The earlier newline-stacked SO fallback stays for
legacy frozen values: `joinDnSectionHeaders`/`splitDnSectionHeaders` +
per-line `<div>`s; pre-section invoices render as one line, history
untouched. Placeholder no longer starts with เช่น.)

## ✅ MIGRATION APPLIED (2026-09-13, via Management API)
`sql/add_classic_v2_regular_item_font.sql` applied to project
`fbhoqcpqqtbiorzbuqcl` (`client_profiles.classic_v2_regular_item_font
boolean NOT NULL DEFAULT false`; 6 existing profiles backfilled false).
Verified: information_schema shows boolean NOT NULL DEFAULT false, and a
true→false write round-trip on เทสท์ คอมปานี (left OFF). Note: the working
endpoint is `POST /v1/projects/{ref}/database/query` — `/query`, `/sql`
and `/pg/query` all 404. The settings-page schema-lag fallback stays as
defense (harmless).
- **`sql/add_line_items_source_section.sql`** — applied same way
(`document_line_items.source_section smallint null`; 0 rows set — all
legacy NULL by design, no backfill needed).
