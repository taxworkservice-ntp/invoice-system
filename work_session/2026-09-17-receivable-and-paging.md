# 2026-09-17 — Reports Phase 3: one receivable definition + paged reads

## Rollback

- Backup branch: `backup/receivable-before` + tag `backup-receivable-before`
  (points at `c825d36`).
- Rollback: `git reset --hard backup-receivable-before`.
- No Supabase migration pending.

## Why

Two follow-ups from the reports audit: four independent "outstanding"
definitions that could disagree, and unbounded PostgREST selects that silently
truncate at 1000 rows (corrupting totals rather than failing).

## 1. `src/lib/receivable.ts` (new) — one definition of a receivable

Shared ingredients, so no page can disagree about _what_ is owed:

- `RECEIVABLE_DOC_TYPES` — `invoice`, `tax_invoice_receipt`, `billing_note`.
  **Receipts are never AR** (they are cash), and `in_billing` invoices are not
  either (the billing note carries them).
- `RECEIVABLE_STATUSES` — `sent`, `overdue`, `partially_paid`.
- `receivableAmount()` — `max(0, net_payable − amount_received)`, always net of
  WHT and of anything received.
- `adjustmentNet()` / `netAdjustmentTotal()` — credit notes reduce by their
  **net** (a credit note releases its own WHT), debits add their net.
  `draft`/`voided` notes are ignored.
- `dealOutstanding()` — moved out of `customers/[id].tsx`; billing notes
  supersede the invoices they bundle.

Rewired onto it: `reports/financialModel.ts`, `dealFinancials.ts` (now imports
`COLLECTION_DOC_TYPES` instead of its own list), `customers/[id].tsx`,
`useDeals.ts`.

### Bugs this fixed

- **A `sent` receipt counted as AR.** `documentSend.getSentStatus()` returns
  `"sent"` for every type; the old predicate only looked at status, so a draft
  receipt that had been "sent" inflated AR at its full net. The predicate is now
  type-aware, so receipts are structurally excluded regardless of flow. (The UI
  only offers `confirm_receipt` for draft receipts, so this was latent.)
- **The customer page netted adjustment notes on their gross** while
  `dealFinancials` and the report use net — the same credit note reduced the
  customer page's balance more than the deal page's. Now both use net.
- **The deals page `unpaid` counted only `status = "sent"`** and did not
  subtract receipts, so overdue and partially-paid invoices were missing and
  part-paid ones were overstated.
- `tax_invoice_receipt` is now recognized everywhere (receivable, revenue,
  labels). The app does not create this type yet — RPCs reference it defensively
  — but the report used to ignore it entirely.

## 2. `src/lib/fetchAllRows.ts` (new) — paged reads

Supabase caps a response at 1000 rows, so an unbounded `select` truncates
silently. `fetchAllRows()` pages with `range` until a short batch, throwing on
error rather than returning a partial set. Every query it wraps got an explicit
`order` (with an `id` tiebreaker) because pages must be stable.

Applied to the reads that aggregate or back a primary list:

| File                  | Query                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `useReports.ts`       | documents, `billing_note_invoices`, deals, `document_line_items`, items ×2, stock movements, movement→document lookup |
| `useDeals.ts`         | all workspace documents (the deals list itself)                                                                       |
| `useDocuments.ts`     | the documents list + its line items                                                                                   |
| `customers/index.tsx` | per-customer sales-job aggregation                                                                                    |

This also replaced the hand-rolled paging loop in `fetchFullStockReport`.

## 3. Tests

- `tests/unit/receivable.test.ts` (11) — type/status acceptance including
  "receipts are never AR", net-of-WHT amounts, over-received clamping, net (not
  gross) adjustment notes, draft/voided ignored, billing-note supersession,
  non-negative balances, and an agreement check that `dealOutstanding` equals
  the workspace model's outstanding for one deal's documents.
- `tests/unit/fetchAllRows.test.ts` (5) — paging to a short batch, exact
  multiples (must still terminate), single-page, empty, error propagation.

## Verification

- `npx vitest run tests/unit tests/integration/dealFinancials.spec.ts`:
  **164 passed** (16 new; the `dealFinancials` spec is pure and still passes
  after the shared-constant change).
- `npx tsc -b` clean. `npm run lint`: 0 errors, 95 warnings (down from 102;
  unused imports/params removed in files touched). `lint:design` passed.
  `npm run build` passes.
- Prettier: `useDeals.ts`, `useDocuments.ts` and `dealFinancials.ts` were
  prettier-dirty at HEAD and are now clean, so those diffs include formatting;
  the other touched files were already clean and stayed clean.

## Remaining

- The four call sites now share the receivable _ingredients_, but the deal page
  still aggregates per deal (one source document + receipts) while the report
  aggregates per document. They agree on a single-deal document set (tested);
  merging the two shapes is a larger change with little user-visible benefit.
- A survey found ~15 other unpaged `documents` selects. Most are scoped by `id`
  or `deal_id` and cannot reach the cap; `admin/clients.tsx` uses count-only
  reads. The remaining list-shaped ones (`deals/[id].tsx`, `download-center`,
  `BillingNoteForm`, `print.ts`) are worth a follow-up sweep rather than being
  done blind.
- `lineItems` / `dealNotes` / `arDetails` are still Excel-only by choice.
- Visual baselines for `/reports` still need `npm run test:ui-snapshots:update`
  locally (no Playwright browsers in this environment).
