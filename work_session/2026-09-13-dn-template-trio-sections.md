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

## Receipt payment-box band (same day, later)
Receipt only (Classic V2): boxes 1+2 merge into one wide
รายละเอียดการชำระเงิน (PAYMENT) cell (reuses `paymentLines`, info only, no
sign lines, no dates) + the company authorized box as sole signer. The body
payment section is suppressed on receipts (moved, not duplicated — body keeps
NOTE + SETTLEMENT). Band gets `print-sig-receipt` (2fr/1fr) with left-aligned
payment text. Verified: temp-fixture receipt screenshot with throwaway
`asReceipt` param (reverted), tsc + 35/35 tests.

## Receipt labeled payment rows (same day, later)
`buildReceiptPaymentRows` (`lib/format.ts`, unit-tested matrix): method-aware
labeled rows — cheque no./drawer-bank/Buddhist date, transfer receiving
account, amount received, WHT cert; post-dated flag when cheque_date >
issue_date (string-compare on validated ISO; garbage passes through raw,
never blocks). Also fixes the raw-ISO cheque date (`paymentMethodText`
untouched → other templates byte-identical). Receipt band renders the rows;
body sections everywhere else unchanged; no schema change. Verified:
temp-fixture transfer/cheque/cash band screenshots (reverted), tsc + 40/40.
Follow-ups: จำนวนเงินที่รับ prints without ฿; pay labels dark (#1f2937);
pay rows left-aligned adjacent (label 28mm column, mirroring the info-box
meta table) instead of space-between spread; method value emphasized
color-free (8.5pt/800 vs 7pt/600) after rejecting a blue badge; เช็ค →
เช็คธนาคาร everywhere user-facing (method label, flag, PaymentModal,
billing-note strip) — row label เลขที่เช็ค and EN CHEQUE kept; payment
completion disclaimer added to the receipt box, 7pt dark (#1f2937);
ชำระครบถ้วน/PAID IN FULL badge monochrome grey in classic base, V2
overrides and modern pill (ledger-border palette).

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

## Per-type closing terms (same day, later)
`client_profiles.classic_terms_by_type` jsonb (migration applied via
Management API, seeded from global into 6 types — 2 workspaces had text).
Settings: global textarea removed; pill-tab card (same pattern as font
sizes, 6 printing types, no DN) with per-tab line count + legacy fallback
caption. Print: `resolveTermsByType` in all 3 templates (type hit → print,
empty → hide, missing map → legacy global). Legacy column stays, ignored.
Verified: unit tests, temp-fixture invoice screenshot (per-type printed,
global ignored), reverted, tsc + 44/44.

## Independent terms font size (same day, later)
New `terms` slot (sub-slot of `footer` — zero change until set): constants
union/keys/parent, `ClassicV2FontScales.terms?` with footer fallback,
footer reserve takes max(footer, terms) so large terms can't overflow the
last page, `--classic-fs-terms` var (+ cascade default) driving
`.print-classic-fine-terms`, renderer + print.tsx + filler mirror budgets,
settings top-level "เงื่อนไขท้ายเอกสาร" row with footer-based inherit label,
specimen row added ("ยอดรวม/เงื่อนไข" label fixed to "ยอดรวม"). Works in
default/per-type/per-doc scopes automatically. Verified: unit tests,
temp-fixture xlarge-terms screenshot (reverted), tsc + 47/47, pagination
check passes.

## Authorized box without company title (same day, later)
V2-only: removed the ในนาม/FOR title lines from every authorized box
(invoice box 4, receipt box, shared box 3 — now bottom-pinned `-mid` like
the middle box so dotted lines stay level). Only the continuation-page
initials strip still shows ในนาม. Verified: invoice + receipt band
screenshots (reverted), tsc + 47/47.

## Authorized box: company name without ในนาม (same day, later)
V2-only: dropped only the ในนาม/FOR prefix wording — the company name
itself stays on both lines (TH + EN caps). Applies to invoice box 4,
receipt box and shared box 3 (DN issued-by box already had none).
Verified: invoice + receipt band screenshots (reverted), tsc + 47/47.

## Receipt authorized cell bottom-pinned (same day, later)
V2-only: tall cheque payment boxes stretched the band while the authorized
content floated top. The receipt authorized cell's dotted line now flex-grows
(`print-classic-sig-cell-fill`) — title stays top, AUTHORIZED BY pins to the
band foot at any payment height. Total band height unchanged, so no
pagination impact; composes with compact-sig heights. Verified: cheque-band
screenshot (reverted), tsc + 47/47.

## Billing-note cheque strip fused to signature frame (same day, later)
V2-only: วันที่รับเช็คธนาคาร / CHEQUE RECEIVED DATE moved inside the
signature band as a full-width header row (`print-cheque-strip-band`,
grid-column 1/-1, flush, bottom-ruled) instead of floating above it with a
gap. Same condition (unpaid billing notes), same reserved height
(CHEQUE_STRIP_RESERVE_MM untouched). Verified: billing-note band screenshot
(reverted), tsc + 47/47.

## Billing-note 2-box band (same day, later)
V2-only: acknowledged + issued boxes in equal halves (`print-sig-2col`);
cheque received date moved from the fused band header into the acknowledged
box (unpaid only); company authorized box removed from billing notes. Fused
`-band` CSS and orphaned base strip rule deleted; reserves untouched (same
height, same page). Verified: unpaid/paid band screenshots (reverted), tsc +
47/47.

## Billing-note band ratio 2:1 (same day, later)
V2-only: `print-sig-2col` is now `2fr 1fr` — the acknowledged box spans the
old boxes 1+2, the issued box keeps the old box-3 width (was equal halves).
Cheque row stays inside the acknowledged box. Verified: band screenshot
(reverted).

## Billing-note cheque date as segmented blanks (same day, later)
V2-only: the cheque received-date fill line became segmented DD/MM/YYYY
dotted boxes (reused `SigDateFill`), right-aligned after the label — the
same hand-fill date every signature box uses. Dead
`.print-classic-cheque-fill` rule removed. Verified: band screenshot
(reverted), tsc + 47/47.

## Billing-note ack box vertical tightening (same day, later)
V2-only, no setting added: ack cell rhythm tightened always (~3mm: line
margin 2.8→1.5, date-fill margin, cheque row margin), and compact-signature
mode additionally drops the ack EN title. All rows stay hand-writable;
savings only add pagination slack. Verified: normal + compact band
screenshots (reverted), tsc + 47/47.

## Billing-note labeled date rows (same day, later)
V2-only: ack box restructured to title → line → role → two labeled date
rows (วันที่ได้รับใบวางบิล always, วันที่นัดรับเช็ค unpaid only), fills
aligned via a fixed label column; dead cheque-inline/label CSS removed.
Verified: unpaid/paid band screenshots (reverted), tsc + 47/47.

## Billing ack box: inline title + aligned labels/fills (same day, later)
V2-only: title now one line (ได้รับใบวางบิลถูกต้อง / BILLING ACKNOWLEDGED) via
a flex title row with a CSS "/" separator (hide-English and compact mode
still win by specificity). Date labels+fills moved into a shared grid
(max-content label column) so both rows align: labels left at the same x
(fixed the inherited text-align:center that indented the shorter label) and
segmented fills start at one column. Verified: measured label text x (43/43)
+ fill x (125/125) and band screenshot (reverted), tsc + 47/47.

## Billing ack role: regular + smaller (same day, later)
V2-only: ผู้รับใบวางบิล / ACKNOWLEDGED BY in the billing ack box switched to
regular weight and 6.5pt (was 7.5pt/600), scoped to `print-classic-sig-cell-ack`.
Verified: computed weight 400 vs issued box 600 + band screenshot (reverted),
tsc + 47/47.

## WHT row English label (same day, later)
V2-only: the totals WHT row printed Thai on both lines
(หัก ณ ที่จ่าย / หัก ณ ที่จ่าย) — the EN line now reads "WHT x%" matching the
VAT convention. Fixed in both V2 totals branches (invoice/receipt). Verified:
totals screenshot + text probe (reverted), tsc + 47/47.

## Totals block compacted (same day, later)
V2-only: totals TH+EN inlined on one line per row (5.5pt EN, tighter
line-height) AND the totals column widened to a fixed 85mm (divider moves
left) so long Thai labels never wrap mid-word — first attempt inlined into
the old 64mm column and Thai broke mid-word, hence the width increase. V1/
modern keep their proportional splits. Row min-height 8 → 6.8mm, padding
trimmed. Verified: normal/receipt all rows single-line (26px), xxlarge
degrades to wrapped but readable, hide-EN still fine, full-sheet screenshot
(reverted), tsc + 47/47.

## Totals: final decision (2-line compact, border reverted)
Reverted the inline/85mm experiment: kept the two-line TH/EN with the
original grid + divider, tightened only (EN 5.5pt, line-height 1, row
min-height 6.6mm, padding 0.8mm). Scale sweep (6 presets) proves no text
overflow/clipping at any scale; rows stay uniform at default and wrap
gracefully at large scales. Chosen over inline because Thai wraps mid-word
without spaces, making inline typographically fragile and row heights uneven.
