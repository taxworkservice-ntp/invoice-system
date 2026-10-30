# 2026-10-30 — UI/UX consistency program (deal → kit → documents)

## Scope

App-wide consistency program, first two slices: the shared UI kit and the
documents/payments surface, plus strict design-lint enforcement on the migrated
paths. No database, schema, money, stock or print changes.

## Commits

| Commit    | Slice                                                       |
| --------- | ----------------------------------------------------------- |
| `c466ab4` | `feat(deals): one workflow model and shared lifecycle UI`   |
| `4304137` | `feat(ui): shared kit and documents/payments consistency`   |
| `300c083` | `feat(documents): unified guide rails and tokenized forms`  |
| `db14d08` | `chore(design): enforce strict tokens on migrated surfaces` |

Rollback tags: `checkpoint/pre-deal-workflow-2026-10-30`,
`checkpoint/post-deal-workflow`.

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

## Enforcement

`scripts/check-design-system.mjs` has a `STRICT_SCOPE` for the migrated paths.
Inside it, the build fails on:

- raw `amber/blue/green/red/emerald/violet/purple/orange/yellow` utilities;
- native `<select>` outside the UI primitives;
- hand-rolled status pills (`rounded-control` + status background tokens).

Add a path to `STRICT_SCOPE` when a slice lands; never add a file to silence a
new violation. `DESIGN-SYSTEM.md` documents this and the new kit.

## Verification

- `npm run lint` — 0 errors, 85 pre-existing warnings; design/form/year checks
  pass (strict rules included).
- `npm run build` — passed.
- `npx vitest run tests/unit --exclude tests/unit/pdfWarm.test.ts` — 286 passed.
- `npx playwright test e2e/deal-flow-journey.spec.ts e2e/next-step-choice.spec.ts`
  — 18/18 passed.
- Local-only specs that need `supabase_key.md` (service role) still cannot run:
  `receipt-draft`, `billing-note`, `credit-note`. The deal-flow journey exercises
  the same forms/payment path through the anon-key workspace.
- Visual baselines were not refreshed: the shared test workspace has accumulated
  QA deals, so a recapture must happen on a clean workspace.

## Pending

- Extend `STRICT_SCOPE` to settings, WHT, reports and admin after their token
  sweep; then delete the remaining allowlisted raw colours.
- Apply `PageHeader`/`Toolbar` and one loading/empty/error rule to the remaining
  list/detail pages.
- Tab keyboard/`aria-controls` on the deal page (the `TabList` primitive is
  ready).
- Combined-billing branch state in `DealLifecycle`.
- Extract `DealHeader`, `DealDocumentHistory`, `DealManagementCard` to reduce
  the 3.4k-line page.
- Recapture visual baselines on a clean workspace; add the deal/detail pages to
  the visual suite.

## Notes

- No migrations.
- `pdfWarm.test.ts` remains a pre-existing stale expectation (layoutVersion 3).
