# 2026-10-30 — UI/UX consistency program (deal → kit → documents)

## Scope

App-wide consistency program, four slices: the shared UI kit, the
documents/payments surface, the deal detail loop, and the final app-wide
token/control sweep. No database, schema, money, stock or print changes.

## Commits

| Commit    | Slice                                                         |
| --------- | ------------------------------------------------------------- |
| `c466ab4` | `feat(deals): one workflow model and shared lifecycle UI`     |
| `4304137` | `feat(ui): shared kit and documents/payments consistency`     |
| `300c083` | `feat(documents): unified guide rails and tokenized forms`    |
| `db14d08` | `chore(design): enforce strict tokens on migrated surfaces`   |
| `354398f` | `refactor(deals): extract detail surfaces and branch billing` |
| `16014fc` | `chore(design): finish app-wide token and control sweep`      |
| `cc39c32` | `fix(deals): close workflow dead ends and false-done states`  |

Rollback tags: `checkpoint/pre-deal-workflow-2026-10-30`,
`checkpoint/post-deal-workflow`, `checkpoint/post-ui-consistency`,
`checkpoint/post-deal-loop`, `checkpoint/app-consistency`,
`checkpoint/workflow-gaps-closed`.

## UI kit

New: `Select` (sm/md, label/error, containerClassName), `IconButton`
(required `aria-label`, 44px mobile), `SegmentedControl` (neutral/primary,
keyboard arrows), `TabList` (keyboard arrows, `aria-controls`), `StatusPill`,
`PageHeader`, `Toolbar`, `ActionMenu`.

`Input.tsx` re-exports `Select` for backward compatibility; new code imports
from `components/ui/Select`. `StatusBadge` and `DealStatusPill` delegate to
`StatusPill`.

## Migrated surfaces

- **Deals:** header pill + `⋯` menu, lifecycle, next-step cards; card/history
  dots and banners use tokens.
- **Home:** filters use `SegmentedControl`; done-sort selects use `Select`;
  queue dots are tokens.
- **Documents:** list and detail use `Select`/tokens/`StatusPill`; the void
  correction select is the shared `Select`.
- **Payments:** `PaymentModal` uses `Select`, tokens, consistent labels.
- **Long forms:** `CreditNoteForm`, `BillingNoteForm`,
  `InvoiceFromQuotationForm`, `InvoiceFromDeliveryNotesForm` now share
  `FormProgress` + `FormStepRail` + scroll-spy, matching the delivery-note form.
- **Terminology:** no UI "ดีล" remains; exports were intentionally left
  unchanged ("เลขที่ดีล") per product decision.

## Deal detail loop

- Extracted `DealHeader`, `DealDocumentHistory` and `DealManagementCard` from the
  page; shared `DocWithMeta` / `BorrowedDoc` / `DealHeaderModel` types live in
  `components/deal/types.ts`. `getDocumentAmount` moved to `lib/documentAmount.ts`
  with unit tests.
- The deal page dropped from ~3,413 to ~2,687 lines.
- Tabs now use `TabList` with `role="tabpanel"` + `aria-controls`; arrow/Home/End
  navigation works.
- Combined billing: a billed-in deal shows a compact branch row and a single
  “ไปงานที่รวมบิล” card that replaces the normal next-step actions. Home labels
  are unchanged. Covered by `e2e/combined-billing.spec.ts`.

## App-wide sweep

- `DOC_TYPE_COLORS`, `STATUS_COLORS` and `CHIP_COLORS` now use semantic tokens;
  no raw `amber/blue/green/red/emerald/violet/purple/orange/yellow/pink/teal`
  utilities remain in `src/app`, `src/components` or `src/constants`.
- 21 remaining native `<select>` controls migrated to the shared `Select`
  (settings, WHT, download-center, payroll, admin team, catalog, reports).
- Five hand-rolled status pills replaced with token/`StatusPill` shapes
  (customers, settings team tabs, carton preview, stock actions).
- Stock report rows are keyboard reachable (Enter/Space), including the
  portfolio table and the low-stock lists.
- `STRICT_SCOPE` now covers all app/components/constants; strict rules:
  raw semantic colours, native selects, hand-rolled status pills. The print
  layer remains exempt and was restored untouched after the formatter ran.
- Formatting-only churn was reverted; only semantic changes were committed.

## Enforcement

`scripts/check-design-system.mjs` has a `STRICT_SCOPE` for the migrated paths.
Inside it, the build fails on:

- raw `amber/blue/green/red/emerald/violet/purple/orange/yellow` utilities;
- native `<select>` outside the UI primitives;
- hand-rolled status pills (`rounded-control` + status background tokens).

Add a path to `STRICT_SCOPE` when a slice lands; never add a file to silence a
new violation. `DESIGN-SYSTEM.md` documents this and the new kit.

## Verification

- `npm run lint` — 0 errors, 84 pre-existing warnings; design/form/year checks
  pass (strict rules included, app-wide).
- `npm run build` — passed.
- `npx vitest run tests/unit` — 288 passed (the stale `pdfWarm` expectation is
  excluded locally).
- `npx playwright test e2e/deal-flow-journey.spec.ts e2e/next-step-choice.spec.ts
e2e/combined-billing.spec.ts` — 19/19 passed.
- Local-only specs that need `supabase_key.md` (service role) still cannot run:
  `receipt-draft`, `billing-note`, `credit-note`. The deal-flow journey exercises
  the same forms/payment path through the anon-key workspace.
- Visual QA at 1280: deal detail, WHT filters, download-center, settings/team,
  catalog list and reports. The settings/team 500 toast is the known local-mode
  admin-API limitation (no service-role key), not a UI regression.
- Visual baselines were not refreshed: the shared test workspace has accumulated
  QA deals, so a recapture must happen on a clean workspace.

## Workflow gap fixes (`cc39c32`)

Closed the 7 dead-end / false-done states found in the pre-deploy audit:

- Overdue `quotation` / `invoice` now offer the same actions as `sent`
  (danger-labelled when past due); overdue invoices also keep the
  no-billing-note collect shortcut.
- Orphaned `in_billing` invoices (draft note voided/deleted) fall back to
  "ออกใบวางบิล" instead of a dead end.
- `allDone` requires a real closing document — a lone converted paper or a
  lone credit/debit note can no longer fake "เสร็จสิ้น". Normal flows
  (paid invoice, generated receipt, post-payment CN) are unaffected.
- Empty (all-voided) deals render "ยังไม่มีเอกสาร" with an
  "ออกใบเสนอราคาใหม่" recovery button instead of fake step 1.
- `deriveDealStage` labels draft CN/debit ("รอส่งใบลดหนี้/ใบเพิ่มหนี้") and
  counts adjustments in skipped phases.
- `pickAmountDocument` falls back to `receipt` (BN > INV > QT > DN > RCT);
  `summaryStats` includes generated receipts; receipt-only deals show
  "ยอดที่รับแล้ว" with the real amount.
- Billed-in deals show "รวมบิลในงานอื่น" in the header pill so it agrees
  with the branch card. Home labels unchanged.

Verification: `tsc` clean, `lint` 0 errors, `build` passed, unit 28/28
(workflow+amount), e2e 19/19. Staff notice: deals that were falsely "done"
will correctly return to active.

## Pending

- Apply `PageHeader`/`Toolbar` and one loading/empty/error rule to the remaining
  list/detail/settings pages — a separate page-template initiative, not required
  for token/control consistency.
- Recapture visual baselines on a clean workspace; add the deal/detail pages to
  the visual suite.
- Optional: migrate the stock-report view switcher to `SegmentedControl`/`TabList`
  (the rows are already keyboard accessible).

## Notes

- No migrations.
- `pdfWarm.test.ts` remains a pre-existing stale expectation (layoutVersion 3).
