# 2026-10-18 — Document creation routing (Stage 1)

## What changed

One routing owner for "which screen creates which document":

- `src/lib/docCreation.ts` — `resolveCreation()` / `creationPath()` /
  `formForCreationType()` / `isDealFormType()`. Owns type → screen, type →
  `doc_type`, which query params each destination may carry, and the
  role refusal rule.
- `src/hooks/useCreateDocument.ts` — screens navigate through this, never by
  building `/deals/new` or `/documents/new` URLs themselves.
- Wired into: `home`, `customers/[id]`, `deals/new` (self-guard + refusal card),
  `documents/new`, `deals/[id]`, `documents/index`, `documents/[id]`,
  `BillingNoteForm`.
- `BillingNoteForm` gained `initialCustomerId` so the customer-page entry keeps
  its pre-picked customer.

## Bugs fixed

1. `/deals/new?type=invoice_from_delivery_notes` (reachable from a customer page)
   rendered a form whose `doc_type` is not in the `document_type` enum — the
   save could never succeed. That entry now opens the DN→invoice form.
2. `/deals/new?type=billing_note` was a second billing-note implementation,
   reachable only from the customer page. That entry now opens `BillingNoteForm`.
3. Simple-mode officers were refused only at save time; the refusal now happens
   at the entrance (`deals/new` shows a reason instead of a fillable form).

## Tests added

- `tests/unit/docCreation.test.ts` — 15 unit tests.
- `e2e/forms-entry.spec.ts` — 5 journeys (uses the signed-in anon client, so it
  runs without a service key).
- `scripts/check-form-routing.mjs`, added to `npm run lint`: fails if any file
  under `src/` hand-builds a creation URL.

## Verification

`npx tsc -b` · `npm run build` · `npm run lint` (0 errors) ·
`npx vitest run tests/unit` (186 passed) ·
`npx playwright test e2e/forms-entry.spec.ts` (5 passed).

## Environment gaps (pre-existing)

- Rest of `e2e/` needs `SUPABASE_SERVICE_ROLE_KEY` / `supabase_key.md` — absent
  in this checkout.
- `npm run test:print-layout` cannot launch Chromium here (`spawn ENOEXEC`).

## Not touched

Uncommitted work already present in the tree: `DeliveryNoteFromQuotationForm`,
`LineItemEditorModal`, `DocumentOptions`, `NextStepBanner`, `PriceReviewControl`.
No print component and no design token was modified. No SQL migration.

## Stage 2 (partly delivered) — shared line rules

New `src/lib/documentLine.ts` owns carton/unit maths, the catalog-price
deviation guard, and the price-review policy. Both line-item screens now read
from it:

- `deals/new.tsx` lost its six private copies; behaviour unchanged.
- `DeliveryNoteFromQuotationForm.tsx` gained the price-deviation warning it
  never had, shown inside `LineItemEditorModal` (carton-aware, off for
  blank-form DNs, threshold from `price_deviation_warn_pct`).
- The one real policy difference is now explicit: the quotation path allows
  unnamed product rows to be saved, so it counts them as reviewable
  (`namedOnly: false`); the deal form counts named lines only.

Tests: `tests/unit/documentLine.test.ts` (11 cases) plus
`e2e/dn-price-warning.spec.ts`, which builds a quotation with a catalog-linked
line, edits the price in the modal, and expects the warning. The spec skips
itself when a workspace sets `price_deviation_warn_pct = 0`.

Bug found while verifying (in the uncommitted delivery-note work):
delivery-note lines created from a quotation lost their catalog link
(`item_id: null` in both the new-note and edit-existing branches). Price
history, SKU lookups and the new warning had nothing to compare against. Both
branches now carry the source line's `item_id`.

Verification: 197 unit tests, `npm run lint` 0 errors, `npm run build` clean,
`e2e/forms-entry` + `e2e/dn-price-warning` = 6 passed.

Edits made to the uncommitted delivery-note work are limited to: the
`documentLine` import, the review-required flag, the pending-lines helper, the
save gate, one `priceWarnPct` prop, and the two `item_id` fixes above.

## Stage 2b — shared line operations

`src/lib/lineDraft.ts`: `focusLineInput` (was byte-identical in both screens),
`moveLine` (the same neighbour-swap algorithm in both), `removeLine`. Adopted by
`deals/new.tsx` and the quotation delivery note.

Contract kept deliberately: these return the same array reference when nothing
changes, so React state setters still bail out. `tests/unit/lineDraft.test.ts`
covers edges, same-reference behaviour and DOM focus (8 cases).

The planned `useDocumentDraft` hook moved to Stage 3 on purpose: the two screens
still have different line shapes and editors, so a shared hook would need the
line type unified first. Unify the row model, then extract the hook over one
shape.

Product question left open (not guessed): switching a line to "sold by carton"
on the quotation delivery note. That screen keeps a `qty_carton` snapshot and
derives `base_quantity` from the source line, so the right behaviour needs the
owner's intent before implementation — a wrong rule here writes wrong quantities
into real delivery notes.

## Stage 2c — cartons on the quotation delivery note

Owner decision: the paper shows cartons, stock moves in pieces.

- `cartonSaveQuantities()` in `src/lib/documentLine.ts`.
- New shared `LineUnitControl` (unit pills + conversion + stock line), rendered
  inside `LineItemEditorModal` and adopted by the deal form in place of its
  inline copy — one implementation.
- The quotation delivery note's save mapping uses the shared rule. The factor
  comes from the catalog item; `line.qty_carton` is a carton count, not the
  factor (a trap found while wiring this). Switching unit re-prices from the
  catalog, mirroring the deal form.

Proof: `e2e/dn-carton.spec.ts` asserts the saved row (unit ลัง, quantity 1,
base_quantity 12, qty_carton 1, carton_unit ลัง, unit_price 120) and
`e2e/deal-carton.spec.ts` guards the deal form's row after the component swap.

Verification: 208 unit tests, `npm run lint` 0 errors, `npm run build` clean,
4 e2e specs = 8 passed.

## Stage 3a — one line model + the missing deal-form guard
1. `e2e/deal-form-lines.spec.ts` — the deal form had **no runnable test** in this
   checkout (the in-repo journeys need a service key that is absent). The new
   spec builds a quotation through the form and verifies the stored line and
   document totals, so the coming row swap is guarded.
2. `DocumentLine` in `src/lib/documentLine.ts` — one shared line shape that both
   `DeliveryLine` (quotation delivery note) and `LineItemForm` (deal form) now
   **extend**, so the compiler proves the editor accepts either. The modal's
   `EditableDeliveryLine` is an alias of it.

Constraint found: line photos print on **quotations only** — giving the delivery
note photos is a print-template decision, not just a component port. Owner
decision (D7): **leave it as it is** — photos stay quotation-only, no template
change.

Verification: 208 unit tests, `npm run lint` 0 errors, `npm run build` clean,
5 e2e specs = 9 passed.

## Stage 3b — deal-form line extras packaged

The deal form's per-line extras are now two named renderers instead of inline
row JSX:

- `renderLineOptions(item)` — job-detail block + quotation example photo.
- `renderPriceHint(item)` — the "เคยขาย… ใช้ราคานี้" shortcut.

The row calls both today; the shared editor will call the same two for its
`extra` slot, so the row swap no longer has to move JSX around. Only visible
difference: the price shortcut now sits just below the price box.

Guard: `e2e/deal-job-details.spec.ts` (skips when `service_job_details` is off).
It surfaced a UX fact: selecting a job-detail service auto-opens the detail
block (`applyCatalogItemToLine` sets `job_details_open: true`), so the button is
a close/re-open control.

Verification: 208 unit tests, `npm run lint` 0 errors, `npm run build` clean,
6 e2e specs = 10 passed.

## Stage 3c — the deal form adopts the shared line editor

Line rows in `deals/new` are read-only and mirror the printed document; all
editing happens in `LineItemEditorModal`, the same editor the quotation
delivery-note screen uses.

- Extra slot carries `renderLineOptions` (job details + quotation photo) and
  `renderPriceHint`.
- Adding a line / "save and add another" opens the editor; closing an unnamed
  new line drops it.
- "Go to next unconfirmed price" opens that line's editor.
- Marker rows, the utility-bill row, move/delete/insert-group stay as they were.

Removed: the inline editor, `CommaInput`, `updateLineUnit`, the private carton
and price-review controls. `deals/new.tsx`: 3,916 → 3,815 lines.

Test changes: `deal-form-lines`, `deal-carton`, `deal-job-details` now drive the
modal (updated, not weakened).

Verification: 208 unit tests, `npm run lint` 0 errors, `npm run build` clean,
6 e2e specs = 10 passed.

Not verifiable locally: `deal-quotation` / `delivery-partial` (service key
absent) — run `npm run e2e` where the key exists before shipping.

## Stage 4 — dead billing-note path deleted

`deals/new.tsx` can no longer be reached with `type=billing_note` (the resolver
redirects it), so the second billing-note implementation went: `isBillingNote`,
the unpaid-invoice loader + selection state, the invoice picker card, the
billing-note tax summary and the `create_billing_note_with_links` RPC branch.
`deals/new.tsx`: 3,916 → 3,615 lines.

Finding for the next slice: that RPC branch was the only caller of the
transactional `create_billing_note_with_links` function. `BillingNoteForm` (the
surviving implementation) does document insert + links + invoice status as
separate calls with manual rollback. Equivalent behaviour, but the atomic path
is now unused SQL. Either port the form onto the RPC (preferred) or drop the
function — and verify with `e2e/billing-note.spec.ts`, which needs the service
key that is missing here.

Verification: 208 unit tests, `npm run lint` 0 errors, `npm run build` clean,
6 e2e specs = 10 passed.

## Next

- Item 3: next-step **choice cards** on the deal page (quotation pair + invoice pair, "หรือ" at both breakpoints).
- Item 5: catalog create cleanup (drop the header "+ สร้าง"; inline create opens the full item form, permission-gated).
- ~~Item 6: per-client discount switch~~ — done; migration `sql/20261018_add_discounts_enabled.sql`
  was applied to the Supabase project on 2026-10-18 via the Management API.
- Item 7: admin-only year era applied to all client areas.
- Item 8: shared step model → rail + green border + "ครบแล้ว" chip on every mode.
- Item 9: numeric grouping Tier 2 (catalog, settings, billing note, credit note, utility fields), then payroll.

## 2026-10-18 (later) — items 1, 2 (Tier 1), 4

**1. Price hint moved beside the price.** `LineItemEditorModal` gained a
`priceHint` slot rendered directly under the price field (before the deviation
warning and the review control); the deal form passes `renderPriceHint` there
instead of through the catch-all `extra`. When the line already uses the hinted
price it renders as a muted "ใช้ราคานี้อยู่" instead of an action that would do
nothing.

**2. Comma grouping (Tier 1).** New `src/lib/numeric.ts` + `src/components/ui/NumericInput.tsx`:
live grouping (`5000` → `5,000`), caret preserved, fraction capped per field
(money 2, quantity 3), paste-safe, Thai digits accepted, `type="text"` +
`inputMode="decimal"` so there are no browser spinners. `Input` is now a
`forwardRef` so the wrapper can manage the caret.

Trap found and handled: a pasted `1234,5` must not become `12345` (10× money
error) — commas in groups of three are separators, any other comma is a decimal
comma. Covered by unit tests.

Adopted: line editor (quantity, unit price, discount), deal form end-of-bill
discount, payment modal amount. The −/+ quantity steppers are gone with it
(`onStepQty` prop and `stepQuantity` helper deleted).

**4. Narrow-column layout bug fixed.** The form content column is pinned to grid
column 2 (`lg:col-start-2`, rail at `lg:col-start-1`), so quotation/invoice no
longer collapse to ~570px when the rail is absent.

New specs: `e2e/numeric-inputs.spec.ts` (grouping while typing, plain stored
values), `e2e/form-layout.spec.ts` (content spans the page per mode; verified to
fail when the fix is removed).

Verification: 222 unit tests, `npm run lint` 0 errors, `npm run build` clean,
8 e2e specs = 14 passed.

## 2026-10-18 (later still) — items 3, 5, 6 shipped

- **Item 5 — catalog creation cleanup:** header "+ สร้าง" removed; the in-line
  create offers the full item form (same as the catalog page), pre-filled with the
  typed name, applied to the line on save; both create paths gated by
  `canManageCatalog` (DN-from-quotation screen included).
- **Item 3 — next-step choice cards:** `components/deal/NextStepChoice.tsx`,
  applied to the quotation pair (ออกบิลเลย / ส่งของก่อน) and the invoice pair
  (สร้างใบวางบิล / ข้ามใบวางบิล แล้วบันทึกรับเงิน). "หรือ" between them at both
  breakpoints; each card carries its own consequence; "แนะนำ" only where the
  default path is unambiguous; single option stays a normal primary button. One
  `runAction()` now performs every next-step action.
- **Item 6 — discount switch:** `client_profiles.discounts_enabled` (default true)
  + `isDiscountEnabled()`; Settings › Documents "ส่วนลด" section; hides the
  per-line discount (shared editor), the end-of-bill discount row, and the DN
  editor's discount field. Display-only — stored discounts and print untouched.

**Migration applied** (2026-10-18): `sql/20261018_add_discounts_enabled.sql`
via the Supabase Management API — column verified present with default true.
The `discount-switch` spec now runs (three passing cases) instead of skipping.

Verification: 222 unit tests, lint 0 errors, clean build, 10 e2e specs = 19 passed
(the two discount cases went from skipped to passing).

Still open: item 7 (admin-only year era — migration, guard trigger, provisioning +
Manage-tab control, 51-site sweep, 5 private print formatters consolidated),
item 8 (step model → rail + green border + chip on every mode, then the four other
forms), item 9 (numeric grouping on the remaining fields), plus the earlier open
items (billing-note RPC atomicity; the four e2e journeys and print goldens that
only the owner can run).

## 2026-10-18 — item 7 foundation (year era), stage A

No behaviour change yet — BE remains what every workspace prints until an
administrator picks CE.

- `sql/20261018_add_year_era.sql` — `client_profiles.year_era` (default `ce`) plus
  a guard trigger so **only an admin** can change it (the owner update policy
  would otherwise allow it). **Not applied yet** — apply manually like the
  discount migration.
- `src/lib/dates.ts` — era-aware formatters (`formatDocDate`,
  `formatDocDateFull`, `formatDocNumericDate`, `formatDocDateTimeParts`,
  `toEraYear`, `YearEra`). The five legacy `formatBuddhist*` helpers now delegate
  to them with `era = "be"`, so their output is byte-identical.
- `src/lib/yearEra.ts` — `resolveYearEra(profile)`: one place decides the era;
  falls back to `be` so pre-migration workspaces are untouched.
- `ClientProfile.year_era` typed.
- `tests/unit/yearEra.test.ts` — both eras, numeric style, date+time split,
  legacy helpers unchanged, and the resolution fallbacks.

Verification: 229 unit tests, lint 0 errors, clean build, 14 e2e journeys.

Stage B (next): admin provisioning + Manage-tab control, `YearEraProvider` in the
shell, the 51-site screen sweep, and consolidating the five private print
formatters (the paper currently prints CE on main dates and BE in sub-tables).

## 2026-10-18 — item 7 stage B, slice 1 (admin control)

**Migration applied and verified** (`sql/20261018_add_year_era.sql`): column
`year_era` (default `ce`), the `ce|be` check constraint, and the admin-only guard
trigger all exist. Proven by probe: a workspace owner setting `year_era = be`
gets *"year_era is managed by the platform administrator"* and the value stays
`ce`; ordinary profile saves still work.

**Admin can now set it:**
- `/admin/clients/:id` → Manage tab → "รูปแบบปีในเอกสาร" (ค.ศ./พ.ศ. cards with a
  sample date), writes the column directly as the admin session.
- `/admin/clients/new` → the same choice at provisioning; the create endpoint
  accepts `yearEra` and stores it in `client_profiles`.

No rendering changed yet: screens and paper still print พ.ศ., because the era is
not read anywhere until the sweep below. The DB default is `ce`, so the sweep
will flip new documents to ค.ศ. unless the admin sets a client to พ.ศ.

**Verification:** 229 unit tests, lint 0 errors, clean build, 10 e2e journeys.

Still to do in stage B: one era provider in the shell + on the print/export page,
the 51 date call sites, consolidating the five private print formatters (paper
currently prints ค.ศ. on main dates and พ.ศ. in sub-tables), `DateInput` BE
display/parse, and a guard script so no screen formats a year itself.
Then items 8 (rail + border everywhere) and 9 (remaining numeric grouping).

**2026-10-18 — item 7 stage B, slice 2 (era source wired, screens not yet):**
`components/YearEraProvider.tsx` exposes the workspace era plus `useDocDate()`
bound formatters; `AppShell` wraps its content in it. No screen consumes it yet —
deliberately: converting screens one at a time would leave the app showing ค.ศ. on
some screens and พ.ศ. on others, which is the inconsistency this work exists to
remove. The conversion is one pass over the 22 client files (51 call sites) +
the five private print formatters, done in verified groups.

Verification after the revert: 229 unit tests, lint 0 errors, clean build,
16 e2e journeys. (Two files were briefly damaged by a scripted edit and repaired —
their date imports are byte-identical to HEAD.)

## 2026-10-19 — item 7 stage B, slice 3 (the era sweep)

The app now has one year system, end to end.

**The bug that made the first pass invisible.** `YearEraProvider` sat *inside*
`AppShell`, but every page calls `useDocDate()` in its own body — and the page
component renders `AppShell`, so its hook ran **above** the provider and always
read the default (`be`). Screens stayed พ.ศ. no matter the setting. The provider
now lives in `App.tsx`, wrapping `<Routes>` (fed by `AuthProvider.clientProfile`),
so it is an ancestor of every page; `AppShell` no longer provides it. Proven by
probe: `/home`, `/documents`, `/deals`, `/customers`, `/wht`,
`/settings/documents` render ค.ศ. and no page emits a 25xx year for the test
workspace (`year_era = ce`).

**Paper.** The five private print formatters (four byte-identical `dd/mm/yyyy`
copies in `PrintDocument`/`PrintHeader`/`PrintLineItemsTable`/
`PrintContinuationHeader`, plus Classic V2's two — `formatDate` CE and
`formatDateBuddhist` BE) are gone, replaced by one `formatPrintDate(date, era)`
in `lib/dates.ts`. Print reads the era from the `clientProfile` already carried
in `PrintDocumentData`, so paper never depends on the route. This also fixes the
split where the same sheet printed ค.ศ. in the header and พ.ศ. in its
sub-tables. `dnHeaderLabel` gained an era parameter.

**Screens (the 22-file pass).** Every `formatBuddhist*` / `formatNumericThaiDate`
call site moved to `useDocDate()` (page-level hook, component-level for the
sections that render standalone: `DocumentRow`, `StockMovementRow`,
`InvoiceRow`, `SummaryPrintTables`, `PayrollHistoryPanel`, `PayslipView`,
`ActivityPanel`, `YearSelect`). Same for the screen-level hardcoded `+ 543`
labels (download center, financial report, payroll, tax-pack card) and the
Thai-locale dates that silently render พ.ศ. (`toLocaleDateString("th-TH"...)` in
deal timeline, team audit, catalog, employee audit).

**Generated files.** `stockReportXlsx` and `financialReportXlsx` take the era
(both callers pass it) so the XLSX year matches the screen; payroll exports
(`reportXlsx`, `payslipPdf`/`payslipBatch`, `schedule`, `employeeReport`) accept
an optional `era` (default `"be"`) and the payroll UI passes it. Admin callers
keep the default.

**`DateInput`.** Now displays the era year and converts typed years back to
ค.ศ. before emitting the ISO value (`fromEraYear`), so a พ.ศ. workspace types
2569 and stores 2026.

**Guard.** `scripts/check-year-era.mjs`, added to `npm run lint`, fails on any
`src/` file that formats a year by hand (`formatBuddhist*`, `+ 543`,
Thai-locale date with a year). Allowlist: `lib/dates.ts`, the SSO filing export,
and the four admin files. Verified it fails on an injected violation.

**Deliberately not swept (recorded, not guessed):**
- **Government filings keep พ.ศ.**: `lib/payroll/ssoExport.ts` (สปส.1-10) and
  `wht/print.tsx` (หนังสือรับรองการหักภาษี ณ ที่จ่าย). Thai filings are fixed to
  พ.ศ. by law; whether the workspace era may override them is an owner decision.
  `wht/print.tsx` already printed ค.ศ., so it is unchanged either way.
- **Admin tooling** (`clients.tsx`, `OverviewTab`, `ActivityTab`,
  `ReportsTab`): no workspace era of its own.
- `formatBuddhistShort` (a second private formatter in `ssoExport.ts`) is
  intentionally left next to its filing.

**Tests.** `yearEra.test.ts` grew to 11 cases (era conversion both ways, month
label, print date, Bangkok-day fallback). 233 unit tests, lint 0 errors, clean
`npm run build`.

**e2e.** `--project=journeys`: 27 passed. The 16 specs that call `admin()` still
fail on the missing `supabase_key.md` (pre-existing). The mobile snapshots fail
for missing darwin baselines (pre-existing).

**Baselines need a regenerate (owner machine).** `npm run test:print-layout`
now differs in Classic V2 sub-table years only (main dates were already ค.ศ.;
with the era pinned to `ce` in the fixture, sub-tables flip 2569→2026). The
script can be launched on macOS with
`CHROME_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`,
but this machine's renderer does not reproduce the stored PNGs (modern pages
differ ~4% before any change), so the goldens must be rebuilt where they were
made. The win32 UI snapshots change the same way — run
`npm run test:ui-snapshots:update` there. No darwin/`journeys` snapshot artifact
was committed here.

**Still open for stage B:** the government-filing decision above; admin tooling
left พ.ศ.; and the `wht/print.tsx` CE date. Then items 8 (rail + border
everywhere) and 9 (remaining numeric grouping).

## 2026-10-19 — price history everywhere + the grouping-comma bug

**Price history is no longer delivery-note-only.** It was never a DN rule: the
`ประวัติราคาขาย` button lived *inside* `PriceReviewControl`, which only renders
when `require_dn_price_review` is on, so the lookup silently vanished whenever
that setting was off — even on delivery notes.

- `PriceReviewControl` is now confirm-only; the history entry point moved beside
  the price field in `LineItemEditorModal`, rendered whenever the host passes
  `onOpenPriceHistory`, independent of `requirePriceReview`.
- `usePriceHints` (new hook) extracts the "เคยขาย…" last-price fetch that used to
  live inline in `deals/new`; both the deal form and the DN-from-quotation form
  use it, so the hint behaves identically.
- `DeliveryNoteFromQuotationForm` gained the hint **and** the history sheet
  (`priceHistoryLineId` + mounted `PriceHistorySheet`) — it previously had
  neither. Applying a past price also sets `price_confirmed`, matching "editing
  the price counts as confirming".
- The deal form's per-line hint/history now show for quotation/invoice too, not
  just DNs. `e2e/dn-carton` asserts the DN editor exposes the history button.

**Numeric bug: typing past a thousand boundary destroyed the value.** Typing
`10000`/`60000` into a grouped field produced `1.00`/`6.00`.

- Cause: `normalizeSeparators` could not tell a grouping comma in a value being
  typed (`"6,000"` + `0` → `"6,0000"`) from a pasted decimal comma (`"1234,5"`),
  so the comma was re-read as a decimal point.
- Fix: `keepsOwnGrouping(prev, next, caret)` in `lib/numeric.ts` detects a
  single typed digit / backspace against our own formatted text;
  `sanitizeNumericInput(raw, { commasAreGrouping })` then keeps the commas as
  grouping. Pastes and typed "," / "." still use the decimal-comma heuristic.
  `NumericInput` passes the flag and `commit()` sanitizes its own output the same
  way.
- `NumericInput` also gained `onTextChange` (raw numeric string) and a `bare`
  variant (input-only, keeps a caller's own styling).

**One grouped input everywhere.** Converted the remaining money/quantity fields
off native `type="number"`:

- compact line grids — `InvoiceFromQuotationForm`, `InvoiceFromDeliveryNotesForm`
  (จำนวน / ราคา/หน่วย / ส่วนลด %) via `bare`;
- `CreditNoteForm` (จำนวน, ราคา/หน่วย);
- utility bill readings + rate in both `documents/edit-utility` and the deal
  form's utility mode;
- job-detail dimension width/height;
- `StockInitialField`, `CartonUnitSection` qty, `ItemForm` initial cost and
  low-stock threshold.

Left alone: identifiers (never grouped), the catalog's large hero price input and
`deals/new`'s disabled VAT display (bespoke/read-only), and the settings/payroll
forms' numeric fields — those are a separate sweep (they have no line-item
context).

**Verification:** 240 unit tests (numeric typing pipeline + `keepsOwnGrouping`
added), lint 0 errors (design, form-routing and year-era checks pass), clean
build. e2e: 27 journeys pass; the new `60,000` typing regression and the DN
history-button assertion included. The 16 specs that call `admin()` still fail on
the missing `supabase_key.md` (pre-existing).

### 2026-10-19 (later) — the decimal point jumped to the end

Typing a decimal into any grouped field produced `0.35` → `035.`, `5.5` → `55.`,
`12.75` → `1,275.` (the dot was never lost — it was pushed to the end).

- Cause: the caret anchor. `caretAfterDigits` counts *digits only*, so right
  after typing `.` the caret was placed before it, and the next digit was
  inserted ahead of the dot.
- Fix: `nextCaret(raw, caret, formatted, digitsBefore)` — when typing at the end
  the caret goes to `formatted.length` (a just-typed dot stays behind it);
  mid-string edits keep the digit anchor.
- Pre-existing, from the Tier-1 grouping work — that work's tests only ever
  passed whole values (`fill`), never keystrokes, so the caret path was never
  exercised. The unit pipeline helper and `e2e/numeric-inputs` now type decimals
  key by key.

**Verification:** 244 unit tests, lint 0 errors, clean build, 27 journeys
(the 16 service-key failures unchanged).

### 2026-10-19 (later still) — next-step cards: order, copy, no badges

- **All "แนะนำ" pills removed**: the next-step card badge (`NextStepChoice`),
  the new-deal-sheet pill (dead — `recommended` was never set there, and it was
  the only `bg-green-50/text-green-700` in the file) and the DN amount-display
  `badge: "แนะนำ"` (`DocumentOptions`; the `badge` slot itself stays for
  `"โหมดรายละเอียด"` / `"ใบส่งของ"`). The `recommended` field and its plumbing in
  `deals/[id].tsx` are gone with it.
- **Card order is fixed by the workflow**: invoice/billing left, delivery/payment
  right — the pair no longer flips once a delivery is recorded.
- **Formal-but-plain copy**, applied everywhere the action is named (cards, home
  stage hints, document action menu, DN-send toast): `สร้างบิลต่อ` → `ออกใบแจ้งหนี้ต่อ`,
  `สร้างใบวางบิล` → `ออกใบวางบิล`, `ข้ามใบวางบิล แล้วบันทึกรับเงิน` →
  `รับเงินโดยไม่ออกใบวางบิล`, `บันทึกว่าส่งของแล้ว` → `บันทึกการส่งของ`,
  `สร้างบิลจากใบส่งของ` → `ออกใบแจ้งหนี้จากใบส่งของ`. Card descriptions got the
  same treatment; the payment card's label/description no longer repeat each other.
- Cards keep the plain white styling — no colour change.

**Tests:** `next-step-choice` now asserts the left/right order (and no badge);
label updates in `billing-note`, `deal-flow-qa`, `invoice-from-dn`,
`invoice-from-quotation`, `receipt-draft`, `delivery-partial`. The billing card
selector is anchored (`/^ออกใบวางบิล/`) because the payment card's label contains
"ออกใบวางบิล" as a substring — an unanchored match hits Playwright strict mode.
Those six specs need `SUPABASE_SERVICE_ROLE_KEY`, so their label updates were
made by inspection, not executed here.

### 2026-10-19 (later still) — the สินค้า/บริการ fork is now a real choice

The item type decides whether the record is stock-counted, but it was a subtle
two-segment toggle at the top of `ItemForm` with a remembered default (`catalogLastType`,
else `product`) — while the name field had `autoFocus`. Officers typed straight
past it and saved services as products.

- `TypeSelector` is now the required **radio-card** picker from the
  `DnAmountDisplayPicker` pattern: two cards, each stating its consequence
  (สินค้า — นับสต็อก · มีหน่วยและหน่วยรอง · ตั้งจุดแจ้งเตือนได้ / บริการ — ไม่นับสต็อก ·
  ใส่รายละเอียดงาน/ขนาดได้), a `เลือกแล้ว` chip, and the last type only as a
  `ครั้งก่อน` hint — never a preselection.
- `ItemForm`: `itemType` starts `null` on create; the fields (and Save) stay
  hidden/disabled until a pick, with a "เลือกประเภทก่อน…" line and a validation
  error as the safety net. `autoFocus` removed from the name field. Edit keeps
  the type locked, as before.
- Same component reused in the picker's quick create (`CatalogItemPickerModal`),
  so the second entry point no longer hardcodes `product`: `createItemType`
  became an optional *contextual default* (the utility/service forms still pass
  `"service"`), and the line editor passes nothing → the officer picks.

**Tests:** new `e2e/catalog-create.spec.ts` — nothing preselected + Save disabled
until a pick, service saves as `item_type: "service"`, the product path keeps the
stock block, and the document-line quick create asks the type too.

**Verification:** 244 unit tests, lint 0 errors, clean build, 30 journeys pass
(16 service-key failures unchanged).

### 2026-10-19 (later still) — print options have one owner; the price hint asks first

**โหมดอ้างอิง is decided when the invoice is created, not at print time.** The
preview's `รูปแบบรายการ` (แบบอ้างอิง / รายการเต็ม) switch is gone, along with the
browser memory behind it (`invoice-system.ref-collapse`), the `refCollapse`
search param, and the flag in the PDF request body. Reason: a summary invoice is
saved as summary *lines* — it can never be expanded back into item detail — so a
switch any print could flip produced two different papers for the same sent
invoice (and the on-screen preview never actually rendered it). The create form
keeps the choice and now says so: "เลือกตอนสร้าง แก้ภายหลังไม่ได้". The preview
prints what the document is; the exported PDF and the download-centre export
agree with it by construction.

**ชื่อเรื่องบนหัวเอกสาร is edited in one place** — the create form's duplicate
row is gone. The preview owns it (it already saved the document and remembered
the choice); a new invoice inherits the last choice via `readLastPrintTitleVariant`.

**The price hint became a shared component** (`components/documents/PriceHint.tsx`),
replacing two near-identical copies in the deal form and the delivery-note form:
a bordered hint box with a real `ใช้ราคานี้` button instead of a bare underlined
link, and an in-app confirm ("ระบบจะแทนที่ราคาปัจจุบัน ฿x ของรายการนี้", plus
"และจะถือว่ายืนยันราคาแล้ว" when DN price review is on) so a single tap can no
longer throw away the typed price. `PriceHistorySheet` asks the same way
(it takes the line's `currentPrice`). `Modal` gained `role="dialog"` /
`aria-modal` / `aria-label`, which is also what lets the nested confirm be
targeted in tests.

**Appendix:** verified still fully present but *disabled for this workspace*
(`client_features` has only `classic_v2_template` + `service_job_details`), which
is why its rows don't render — nothing was dropped and nothing was changed.

**Tests:** new `e2e/price-hint.spec.ts` (box → confirm → cancel keeps the price →
confirm applies it → the hint flips to "ใช้ราคานี้อยู่"). `invoice-from-dn.spec.ts`
now sets โหมดอ้างอิง explicitly with `check()/uncheck()` instead of assuming a
remembered default. 24 runnable journeys pass.

### 2026-10-19 (later still) — delivery-note table: the grid keeps running

The DN's group rows and the spacer between groups were merged cells, so the
table's column rules stopped at them — the spacer read as a hole, and a section
band as a gap. Now every row carries one cell per column:

- **Spacer row** renders six cells; the CSS keeps `border-right` (only the
  horizontals are zeroed) so the rules pass through. Still exactly 3 mm
  (`DN_GROUP_SPACER_MM`), so pagination is untouched.
- **SO section rows** render six cells too (number in the NO. cell, the SO text
  in the description cell) — same rules, same hairlines. Section text and the
  group number are semibold; **no background tint** (tried it, removed it on
  request).
- **Remarks on a delivery note** trimmed (padding 2.5/4 mm → 1.5/3 mm, title gap
  1.5 → 0.8 mm, line-height 1.5 → 1.35) — DNs only; invoice/receipt terms keep
  their spacing.
- Verified by rendering the print fixture: all rows are 6 cells (no column
  shift), spacer 3.00 mm, group row 6.37 mm (still inside `DN_BAND_MM = 6.5`),
  rules present, `pagination.many` assertions unchanged → **no page-count shift**,
  so only the stored print PNGs need a regenerate.

Also fixed while verifying: the "เคยขาย…" hint was **flaky in the app** — the
hook's effect depended on the `itemIds` array (new identity every render), so its
cleanup cancelled the in-flight fetch while the `requested` guard refused to
start another; the hint appeared only when the fetch happened to land before the
next render. It now depends on a stable `item|item|…` key (`usePriceHints`).
Caught by `--repeat-each 3` (2 of 3 failed before, 3 of 3 pass now).

### 2026-10-19 (later still) — the pagination model gets a conformance check

The sheet is drawn by CSS while page breaks are decided by a parallel mm model
(`printRowHeight.ts` + `pagination.ts`), kept in sync by hand. Every pagination
bug this week came from that drift: the model assumed a merged SO band while the
renderer wrapped the text in the narrower column, a phantom totals reserve split
small DNs, `classicNoAmounts` claimed a wider description than the renderer
draws.

- **SO section band merged again.** The band's text spans the full row
  (`colSpan={5}`), which is exactly what the model budgets ("SO text spans the
  full band", 110 chars/line) — so reverting *restored* agreement instead of
  needing an estimator change. The spacer keeps its six cells, so the column
  rules still run through the gap; the band has no tint; the DN remarks stay
  trimmed.
- **New conformance check** — `npm run test:print-layout:estimate`
  (`scripts/print-layout-estimate-check.mjs`). It renders the print fixture and
  compares **measured** heights against the model per row kind: item rows ↔
  `estimateLineItemHeight`, section bands ↔ the band charge, spacers ↔
  `DN_GROUP_SPACER_MM` (compact variant included). The fixture exposes its data
  on `window.__printFixture` for the model side. Verified it bites: changing
  `DN_GROUP_SPACER_MM` 3 → 5 fails the check, reverting passes.
  Measured agreement today: rows within ~0.26 mm/row conservative, bands within
  ~0.4 mm, spacers exact.
- **Estimator tightened**: Classic V2 never widens the description column for
  hidden amounts (it always draws the amount grid), so the `classicNoAmounts`
  branch is gone. Modern keeps its (unmeasured, therefore conservative) value in
  both modes — an invented `modernNoAmounts` would have made the estimate less
  safe, so it was not added.

**Still open** (deliberately): the measured paginator (place blocks by measured
height instead of predicting), which is the structural fix for the 2-page
invoice. A per-document font scale + "ย่อให้พอดีหนึ่งหน้า" escape hatch was built
and then **rejected by the owner — do not rebuild it**: sizing stays a workspace
/ per-type setting in Settings › เอกสาร, and nothing shrinks a single document.

**Verification:** 244 unit tests, lint 0 errors, clean build, `pagination.many`
unchanged, the new estimate check green, 9 runnable journeys green.

### 2026-10-19 (later still) — remarks in the table, terms in the remark slot, no filler rows

Classic V2 only (the DN grouping path is `isClassicV2`-gated; Modern untouched).

- **The document's note prints as the items table's closing row** — full width,
  label `หมายเหตุ (REMARK)` then the text, rendered only when the note exists
  and only on the page carrying the last item, before the decorative blank
  rows. The old NOTE / หมายเหตุการส่งของ box is gone.
- **The closing terms moved into the remark slot** (left column, above
  PAYMENT), titled `หมายเหตุ (REMARK)`; the full-width `เงื่อนไข (TERMS)` block
  is deleted. Delivery notes print no terms at all, so a hidden-amount DN now
  renders **no bottom row** instead of an empty band.
- **Settings renamed to match** (display only, no migration): the scale row and
  the per-doc-type text section are now `หมายเหตุ (REMARK)` — what you type
  there is what prints above the payment block.
- **Removed the inter-group spacer row** (`DN_GROUP_SPACER_MM` /
  `DN_GROUP_SPACER_COMPACT_MM`, its CSS, both pagination charges, the
  `spacerAfter` plan field and the `markGroupSpacers` pass).
- **Removed the per-section `รวม` row** (`footerAfter`, its CSS, its pagination
  flag, and `DnGroupBlock.subtotal` — the per-section sum was its only reader).
  The document's own `รวมเงิน / SUB TOTAL` row is untouched.
- Tests updated for the new plan shape: `dnSections`, `dnSoHeader`,
  `dnPagination` (its totals-reserve guard now asserts the budget, which is the
  invariant rather than a page count that the smaller layout made moot), and the
  estimate check (spacer assertion dropped; the note row excluded — it is
  appended by the last page and is not part of the line model).

**Verification:** 244 unit tests, lint 0 errors, clean build, `pagination.many`
green, estimate check green. Verified by rendering the fixture: no spacers/sum
rows, one note row, terms titled `หมายเหตุ (REMARK)` above PAYMENT, and a
hidden-amount DN with no bottom row at all.

### 2026-10-19 — the dead band above the bottom row gets filled (Classic V2)

Removing the terms block, the DN spacer and the per-section `รวม` row freed
height that the *renderer* never used: the filler blank rows stopped at
`MIN_CLASSIC_ITEM_ROWS = 8`, and everything beyond that pooled above the
signature band (`margin-top: auto` on `.print-classic-bottom-pin`). On a real
invoice that was ~30 mm of white between the totals block and the signatures.

- **The table now fills its page.** `minBlankLines` is a floor, not a cap: when
  the page budget has room for at least two more ruled rows, the fillers take
  it; otherwise the old minimum (already elastic — it still shrinks below the
  minimum when a tight budget at large font scales demands it). The gate that
  skipped the calculation entirely at the minimum (`maxBlankLines <= 0`) is
  gone — that is why a document with exactly 8 physical rows got zero fillers.
- **The document note row is charged.** It renders above the fillers and was
  not in `usedMm`, so filling without it could push a page one row past budget.
- **Fillers are charged like content rows.** `estimateLineItemHeight` on a
  synthetic one-line row (text line + the estimator's safety margin). Charging
  the bare base row (6.5 mm) under-counts by ~0.8 mm each and grew the sheet to
  304 mm — caught by measurement, not by reasoning. An *empty* name is also
  wrong: the estimator only charges lines beyond the first, so an empty row
  costs 3.9 mm. One row is deliberately left spare, and the hidden-amount DN
  budget mirrors the paginator (`reserveTotalsBlock: false`) so a DN's missing
  totals column isn't charged against the space it is about to fill.
- **New conformance check**: `npm run test:print-layout:fill`
  (`scripts/print-layout-fill-check.mjs`) renders 11 fixture variants (page
  modes × doc types × font scales, incl. quotation photos and the DN-compact
  layout) and fails when a *filled* sheet exceeds A4 — measured by removing the
  filler rows from the sheet height, so a variant that is too tall on its own
  (the fixture renders one unpaginated sheet) is skipped instead of masking the
  result. It caught the 1.2× overflow (`invoice large`, 300.6 mm) that the
  minimum filler count alone produced at large scales.
- Measured on the fixture at 100%: invoice single page 4 → 8 fillers and the gap
  above the bottom row 126.7 → 9.9 mm; hidden-amount DN 3 → 6 fillers
  (168.5 → 36.6 mm); quotation 6 → 10; `many` last 4 → 13; continuation pages
  unchanged at 0.

Not claimed: **this does not move any page break.** Fillers are decoration and
never enter the paginator (`pagination.many` unchanged, proven). Turning the
freed height into *rows per page* — what would put a document that misses one
page by a few mm back onto one page — means re-measuring
`LINE_ITEM_CAPACITY.classic_v2` (still 19 / 28 / 34 / 24 rows, measured while
the old footer existed). That is Phase 2, requested but not started.

**Verification:** 244 unit tests, lint 0 errors, clean build, `pagination.many`
green, estimate check green, fill check green (11 variants). The PNG print
baselines change → the owner regenerates them with
`npm run test:print-layout:update` where they were created (this machine cannot
reproduce the renderer).

### 2026-10-19 — the admin panel could not write to a workspace that had documents

Symptom: on `/admin/clients/<id>?tab=manage`, picking ค.ศ./พ.ศ. in
**รูปแบบปีในเอกสาร** answered **HTTP 400** (`client_profiles?user_id=eq.…`).

It was not the year-era guard, and not `is_admin()`. The trigger stack was:

```
update client_profiles { year_era }
  → guard_admin_only_profile_fields            (passes: caller IS an admin)
  → trg_touch_documents_on_profile_change      (bumps every document's render version)
    → update documents set render_updated_at = now() where user_id = new.user_id
      → trg_enforce_document_action_permission
        → client_workspace_can(workspace, 'canCreateEditDocuments')
```

`client_workspace_can()` bypassed the action guards for the service role
(`auth.uid() is null`) and for the workspace **owner**, but a platform admin
signing in with their own JWT is neither, so the document trigger raised
`You do not have permission to edit document drafts` (P0001) and PostgREST
mapped that class to 400. Reproduced by impersonating the admin in PostgREST's
own context (`set local role authenticated` + `request.jwt.claims`).

It looked intermittent because a workspace with **zero** documents matches no
row in that cascade and quietly succeeds — the reporting workspace had exactly
one document. The same chain breaks the **dev-mode toggle** (`toggle_dev_mode`
is also an update of `client_profiles`) for any workspace with documents.

- `sql/20261019_admin_can_touch_workspace_documents.sql`: `client_workspace_can`
  now returns true for `public.is_admin()` too. It grants nothing new — an admin
  already has full power over every workspace through the service-role API — it
  only stops the admin's own session from being treated as a stranger. Applied
  to the project already.
- Verified in rolled-back transactions (nothing committed): admin may set the
  year era and toggle dev mode; the **owner still may not** change the year era
  (`42501 year_era is managed by the platform administrator`); a non-member still
  gets `false`; a member whose per-member override disables
  `canCreateEditDocuments` is still refused by the document trigger, and allowed
  when the override is on.

Found on the way, **not fixed** (needs a decision): the client's
Settings › เลขที่เอกสาร writes `dev_effective_date` inside the same `Promise.all`
as the prefix/sequence rows, and `guard_dev_mode_columns` refuses that column to
non-admins — so a workspace in dev mode cannot save that page, and because the
writes are batched one rejection makes a successful sequence save look failed.
Options: let the owner set the date (the admin UI only toggles dev mode on/off),
or move the date control to the admin panel; either way the date write should be
decoupled from the numbering save.

### 2026-10-19 — project heading, the note row, and terms on every document type

Three print changes, all Classic V2, all driven by "what the document carries
should print the same way on every type".

- **The project name is now the items table's first row** (`document.task_name`),
  full width, no `ชื่อโครงการ` label, on the page that carries the first item —
  a job heading above the work instead of a wrapped row in the narrow meta
  panel (which is gone, so the meta reserve is gone with it). Reserved exactly:
  a new `firstPageReserveMm` in `getRowBudgets` is charged to both first-page
  layouts, because the existing `extraReserveMm` is footer-area content and the
  multi-page first page deliberately skips it — an unreserved heading there
  would have clipped.
- **The document note closes the table**, below the ruled filler rows (it used
  to sit above them), with an inline label: `บันทึก (NOTE): ส่งก่อนกำหนด`. Its
  typography now follows the remark/PAYMENT column (7.5pt × `--classic-fs-totals`)
  for label and value alike, and the two full-width rows share one measured
  model (`estimateClassicV2FullRowHeight`: 3.06mm padding + 3.572mm per line,
  measured against the fixture; wrap budget 130 chars against a measured ~155).
  Both rows are now *reserved* (note → `extraReserveMm`, heading →
  `firstPageReserveMm`) instead of leaning on the fill's spare row.
- **Terms print on delivery notes too.** `classicTerms` was hard-wired to `[]`
  for DNs while Settings › เอกสาร offered a ใบส่งของ tab for them — a setting
  that could be filled in and never printed. The suppression is gone, so every
  type prints the terms configured for it (and a type with none still prints
  nothing).
- **The duplicate label is resolved**: the workspace-configured closing terms
  keep `หมายเหตุ (REMARK)` (they own the name, and Settings says the same); the
  per-document note becomes `บันทึก (NOTE)`. The forms follow: `หมายเหตุ` → บันทึก
  in the invoice-from-DN / invoice-from-quotation / credit-note / deal forms,
  `หมายเหตุบนใบส่งของ` → `บันทึกบนใบส่งของ`, the document page's card title too,
  and the billing-note form's previously *unlabelled* note textarea got the same
  label.

Checks: `test:print-layout:fill` grew four `project` variants (single/first/last
+xlarge) — a *filled* page with a reserved heading still lands on 297.1mm, and
the multi-page first page with a long wrapping name uses its whole budget
without clipping; `estimate` and `pagination.many` green; 7 new unit tests for
the row model (251 total); lint + build clean. PNG baselines change for classic
V2 again — regenerate with `npm run test:print-layout:update` where they were
made.

### 2026-10-19 — numbers follow the era, and the "next step" is visible while you scroll

- **Document and deal numbers now print the workspace's year system.** The
  numbers were the last CE holdout: a workspace set to พ.ศ. printed พ.ศ. dates
  but `INV-2026-…`. `generate_doc_number`, `generate_deal_number` and
  `repair_doc_numbers` now add 543 for `year_era = 'be'` **in the printed string
  only** — the reset window, `last_year` and the uniqueness scans stay on the
  calendar year, and the document scan reads `issue_date` (so numbering stays
  duplicate-free across a switch; the deal scan matches both number shapes).
  No backfill. Verified by impersonation-free calls in rolled-back transactions:
  the `be` workspace (`บริษัท เทสท์ โค จำกัด`) now yields `INV-2569-10-0011`,
  `DN-2569-10-0023`, `DL-2569-00341` while a `ce` workspace still yields
  `INV-2026-…`; `doc_number_sequences.last_year` stayed 2026 and nothing was
  written. Admin hint updated (it used to say numbers always use CE).
- **The form's next-step blocker is now repeated in the sticky action bar** on
  the deal form (the DN-from-quotation form already did it through
  `FormActionBar`'s `hint` + `hintOnClick`). The in-flow banner stays where the
  work is; the bar is what remains on screen. Wording: one exported
  `nextStepMessage()` so banner and bar can't drift; `ไปยัง` → `แก้ไข` and the
  price-review link `ไปยังรายการถัดไป` → `ถัดไป`; both banner states now carry
  `role="status" aria-live="polite"`.

Left alone deliberately: `generate_wht_certificate_no` prints `YYMM###`
(2-digit year, no prefix-year pattern) — flip it the same way if the WHT
certificate should read 69…; no certificate numbers exist yet, so there is
nothing to backfill.

### 2026-10-19 — WHT certificate numbers follow the era too

Format is `WT` + YY + MM + 3-digit running number, so a July-2026 certificate
reads `WT2607008` in ค.ศ. and `WT6907008` in พ.ศ. (69 = 2569).

The live generator is **client-side** (`src/lib/whtCertificate.ts`), not the
`generate_wht_certificate_no` DB function (which is unused and still prints the
old bare `YYMM###`). `nextWhtCertificateNo` now derives the stem from the
workspace's era via `toEraYear()` — the repo's year-era check flagged the bare
`+ 543` and the shared helper replaced it — and it scans **both** stems plus
both legacy shapes (`WT…` and the bare digits some old rows carry), so a
workspace that switches era mid-month continues at 009 rather than restarting
over numbers that already exist. Callers may pass the era; when they don't the
helper reads `client_profiles.year_era` once, so no call site can quietly keep
issuing ค.ศ. numbers (batch payroll WHT sync included).

Also fixed: `wht/print.tsx`'s fallback for a record that never got a stored
number hardcoded `WT68…` (พ.ศ. 2568). It now derives the stem from the record's
date and the workspace era.

Tests: `tests/unit/whtCertificate.test.ts` (10 cases) pins the owner's example,
the era resolution, the cross-era scan (asserting both stems are queried) and
the skip/parse edge cases. 261 unit tests total.

### 2026-10-19 — one year everywhere, and a ใบส่งของ remark slot

- **The era no longer goes stale in an open tab.** `clientProfile` is cached for
  the whole session, so flipping ค.ศ./พ.ศ. in the admin panel left client tabs
  formatting dates from the old value — a freshly-issued `DO-2569-…` number
  (from the DB) beside a `19 ต.ค. 2026` date (from the cache). `useAuth` now
  re-reads **only `year_era`** on focus/visibility (throttled 30 s) and replaces
  the state **only when it actually changed**, so a page holding unsaved edits
  hydrated from `clientProfile` is never re-hydrated.
- **Three more places formatted a year by hand**, all fixed: the WHT
  certificate's own printed date (a local `fmtDate` composing
  `getDate()/getMonth()/getFullYear()`), the documents list's year filter, the
  Home "งานเสร็จ" year filter, and the `ปี …` filter chip (now `toEraYear(...)`
  against the workspace era — the option *values* stay calendar years, they are
  filter keys).
- **The guard was the reason they slipped through**, so `check-year-era.mjs`
  grew the patterns that had escaped it: any-locale `toLocale*`/`Intl` with a
  year (paren-balanced, so multi-line option objects count), hand-built
  `${…}/${…}/${getFullYear()}` date strings, a bare year rendered as JSX text
  (`>{year}<`, multi-line), and a Thai `ปี ${…}` label interpolating a bare
  year. Proven to bite (it flagged all four before the fixes) and it now covers
  the admin area as a group rather than file by file — admin screens belong to
  no workspace and legitimately show timestamps.
- **ใบส่งของ joined the closing-remark tabs** (`TERMS_DOC_TYPES`), so Settings ›
  เอกสาร now offers it: type text wins, a blank tab suppresses the remark on
  delivery notes only, an untouched tab still inherits the legacy workspace
  text. `resolveTermsByType` already behaved that way; only the tab list and its
  pinning unit test said otherwise. **Modern** lost its own delivery-note
  suppression too, so the setting means the same thing on both templates.

Verified: tsc, 263 unit tests (terms-by-type + row model), lint with the
hardened year-era check, clean build.

### 2026-10-19 — the project heading starts in the description column

The project name printed as one full-width cell, so it began under `เลขที่ (ITEM)`
— at odds with the item names beside it. It is now an empty NO. cell plus a
`colSpan={5}` cell, so the heading starts **in the description column**, flush
with the item names (measured: heading text left = item text left = 88.0px), the
first column keeps its vertical rule, and the row still reads as part of the
table. Row height is unchanged (6.63mm — the model's 3.06 + 3.572 still exact),
and the conservative 130-char wrap budget still sits below the ~144 the narrower
cell can hold, so the `project` fixture variants keep it honest.

Note for a later pass: a delivery note's child rows indent their names (`1.1 …`),
so there the heading aligns with the column rather than with that indentation —
intentional, the heading is not a line item.

### 2026-10-19 — the items table's inner grid becomes a setting (Classic V2)

The table's inner rules were all-or-nothing: the body cells carried both a
column rule and a row separator, so a DN group band (a merged section title)
was the only row without inner lines — and a document that wanted the airy
"no grid" look had to live with a full ledger grid.

`client_profiles.classic_v2_table_lines` (per workspace, like the other
classic V2 print options) now chooses:

- `all` (default) — column rules + row separators, as before;
- `rows` — row separators only, no column rules;
- `none` — no inner lines at all.

The switch is two border-colour rules on the items table's body cells, so
everything that is a *separate* rule keeps printing: the table frame, the
underline under the header, and **the divide between DN groups** (the group
row's `border-top`). Verified on the fixture: the group's top rule is
`#9ca3af` in all three modes, while the cells' right/bottom borders go
transparent in `rows` / `none`.

The migration (`sql/20261019_classic_v2_table_lines.sql`) is applied to the
project; every existing workspace reads `all`. The fill check gained three
variants (`rows`, `none`, a DN with `none`) and the estimate check one
(`project-no-lines`): with the borders gone the rows render 3.2mm shorter than
the model charges, so the model stays an upper bound and pages break a touch
early rather than late.

Note: `none` also removes the ruled look of the blank rows that pad a short
document to the bottom of the page — that is the point of the option, but it
is the reason `all` stays the default.
