# 2026-09-17 — Reports Phase 2: shared money model + screen/export parity

## Rollback

- Backup branch: `backup/reports-model-before` + tag
  `backup-reports-model-before` (points at `5b0d51c`).
- Rollback: `git reset --hard backup/reports-model-before`.
- No Supabase migration pending in this phase.

## Why

Phase 1 fixed the wrong numbers but left them inside the hook: untested, and
the screen showed only 3 of the 10 sheets the Excel export produced. This phase
moves the arithmetic into a pure module with tests, and surfaces the four
report tables that were export-only.

## 1. `src/lib/reports/financialModel.ts` (new, pure)

`computeWorkspaceFinancials()` computes every figure the report shows or
exports from the document rows, with no Supabase, React, or clock other than an
injected `today`:

- period summary (revenue / collected / VAT / expected + actual WHT /
  outstanding / doc count), unclamped
- AR: receivable selection (excluding invoices held in a billing note),
  per-customer net allocation oldest-due-first, aging buckets, per-customer
  totals, per-document detail
- trend window, revenue by type, top customers, period-over-period delta,
  collection rate

**Two adjustment bases, both deliberate and documented in the module:**

- revenue / VAT use the adjustment's **gross** (`total_amount`) — revenue is
  reported VAT-inclusive;
- AR uses the adjustment's **net** (`net_payable`) — a receivable is settled in
  cash after WHT, and a credit note releases its own WHT. This matches
  `dealFinancials.ts` (`afterAdjustment = netPayable + debitNet − creditNet`).
  The previous report subtracted the credit's gross from net-based AR.

Also added `customerCreditTotal` / `customerCreditByCustomer` so credit notes
that exceed a customer's open AR are reported as a credit balance instead of
either silently reducing the workspace AR total (old behaviour) or vanishing.

Two bugs found while writing the tests, both fixed here:

- a credit note for a customer with **no open AR** was dropped from every
  figure (it now reports as a credit balance);
- net debits had no document to attach to and were dropped from AR (they are
  now added explicitly and land in the current aging bucket).

## 2. `useReports.ts` is now I/O + row shaping

1065 → ~620 lines. It keeps every Supabase query and the row mapping (line
items, deal notes, transaction register, WHT register, COGS, stock report); all
arithmetic is one `computeWorkspaceFinancials()` call. Report types are
re-exported from the model, so `financialReportXlsx`, `TransactionTable`,
`csvReports`, `StockReport` and `download-center` needed no changes.

**Chart anchoring fixed (H3).** The trend window is now
`trendMonthsForPeriod(end, 12)` — 12 months ending at the **selected** month —
instead of always ending at today. `trendMonthsForPeriod` falls back to today
when the period end is unusable, so a malformed range cannot produce a garbage
chart. `topCustomers` and `arByCustomer` are no longer pre-sliced in the hook,
which also stops the Excel sheets from being silently truncated to 10 / 20 rows.

## 3. Chart range UI follows the selection

`FinancialReport` "YTD" now filters on the selected year (whole year when a past
year is selected) and the title reads the selected year, instead of always
describing the current year.

## 4. Screen/export parity

New `src/components/reports/ReportTable.tsx` — one compact report table built on
the `TABLE` tokens (sticky first column, right-aligned `tabular-nums` money,
horizontal scroll on phones). Surfaced on `/reports`:

| Section                                          | Was                                  |
| ------------------------------------------------ | ------------------------------------ |
| อายุลูกหนี้ (AR aging)                           | Excel only                           |
| รายได้ตามประเภท (by type)                        | Excel only                           |
| ยอดขายตามลูกค้า (top customers, top 10 shown)    | Excel only                           |
| หัก ณ ที่จ่าย · หักจริงตามใบเสร็จ (WHT register) | Excel only                           |
| ลูกค้าค้างชำระ                                   | text list → now the same table style |

The export button now states what the 10-sheet workbook contains, and the
"ค้างเก็บ" card shows the customer credit balance when there is one.

Still Excel-only, deliberately: `ลูกหนี้คงค้าง` (per-document AR),
`รายการบรรทัด` (line items) and `บันทึกภายใน` (deal notes) — long detail dumps
that the deal page and the register already cover.

## 5. Tests

`tests/unit/reportsFinancialModel.test.ts` — 26 cases, pure (no Supabase), so
they live in `tests/unit` and run with `npx vitest run tests/unit`. They pin the
Phase 1 fixes and the reconciliation invariants:

- unpaid invoice → `collected` 0; partial payment → received only
- revenue on invoices for non-VAT too (receipt does not double it)
- draft/voided/converted ignored; period boundaries inclusive
- credit note: revenue by gross, AR by net; debit note adds on both
- invoice inside a billing note not double counted
- not-yet-due and missing-due-date receivables land in the current bucket
- Σ aging buckets = outstanding; Σ customer list = outstanding
- credit for another customer does not reduce your AR; credit balance reported
- expected vs actual WHT; draft/voided receipts excluded
- trend anchored on the selected month, negative months unclamped
- delta, collection rate, by-type grouping, customer ranking

## Verification

- `npx vitest run tests/unit`: **140 passed** (26 new).
- `npx tsc -b`: clean. `npm run lint`: 0 errors, 99 warnings (all pre-existing;
  three unused type imports removed from `useReports.ts`). `lint:design`:
  passed. `npm run build`: passes.
- `e2e/visual.spec.ts` already includes `/reports` (added in Phase 1); baselines
  still need generating locally — no Playwright browsers in this environment.

## Follow-ups

- The four "outstanding" definitions across the app are still separate
  (`dealFinancials.ts`, `customers/[id].tsx`, `useDeals.ts`, this model). They
  now share the net-adjustment basis, but not one function.
- `sent` draft receipts still count as AR (`documentSend.ts` returns `"sent"`
  for every type and the receivable predicate accepts it).
- Unbounded PostgREST selects can silently cap at 1000 rows; 12-month trends are
  still computed client-side. A server-side aggregate remains the durable fix.
- `lineItems` / `dealNotes` / `arDetails` are export-only (see above).
