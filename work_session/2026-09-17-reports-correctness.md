# 2026-09-17 — Reports correctness pass

## Rollback

- Backup branch: `backup/reports-before` + tag `backup-reports-before`
  (points at `86e5bf8`, the content-container work).
- Rollback: `git reset --hard backup/reports-before`.
- No Supabase migration applied — but see **Pending manual step** below.

## Why

An audit of `/reports` (KPI cards, chart, register, Excel export) found three
KPI figures that could be materially wrong and several lists that could not
reconcile with each other. The page and the export also described different
reports. This pass fixes the _numbers_ only; no new sections were added.

## Fixes (all in `src/hooks/useReports.ts` unless noted)

1. **"เก็บแล้ว" counted unpaid invoices as fully collected.**
   `amount_received` is NULL until a receipt is confirmed (only
   `confirm_draft_receipt` writes it; creation paths set `null`), so
   `d.amount_received || d.net_payable` fell through to the full net for every
   unpaid invoice. Now `d.amount_received || 0` — matching `dealFinancials.ts`.
2. **Revenue basis is now accrual for everyone.** `isRecognizedSalesDocument`
   was invoices for VAT workspaces but receipts for non-VAT, so a non-VAT
   workspace recognized revenue on a different document set than the
   credit/debit-note adjustments it also applied. Now invoice-based for both.
   (Behaviour change for non-VAT workspaces — revenue now recognizes on the
   invoice, not the receipt. Called out here deliberately.)
3. **WHT is reported on both bases, labelled.**
   `whtWithheld` = expected WHT on the period's invoices; new `whtActual` = WHT
   on the period's receipts (`whtDocs`, now computed once and shared with the
   WHT export sheet, which previously filtered independently). `FinancialReport`
   shows the actual figure as the card's caption; the XLSX summary has two
   labelled rows; the WHT sheet gained a title stating its basis.
4. **Removed `Math.max(0, …)` clamping** on period revenue, the monthly trend
   and the previous-period revenue. Clamp-then-sum ≠ sum-then-clamp, so the KPI
   and the register footer could disagree, and genuine negative revenue was
   hidden. The `prevRevenue > 0` guard stays — a % change from a zero/negative
   base is not meaningful (documented in place).
5. **AR now ties out.** Previously `outstanding` subtracted _all-time_
   credit/debit notes from _current_ AR, while the customer list allocated
   credits per customer (oldest due first) and dropped the remainder — so the
   card and the list could not reconcile. The credit-allocation block was moved
   above `setSummary`, and `outstanding` is now the sum of the same
   per-document adjusted amounts the customer list and aging buckets use.
   Net-debit receivables (debit notes exceeding credit notes for a customer)
   have no AR document to absorb them, so they are carried explicitly into the
   outstanding total, the current aging bucket and the customer list rather than
   being dropped.
6. **AR aging is no longer misleading.** Added a leading **"ยังไม่ถึงกำหนด"**
   bucket; previously not-yet-due receivables were excluded entirely (so
   Σ aging ≠ outstanding) and a document with **no `due_date`** was reported in
   the **90+ days** bucket. Missing due dates and current items now land in the
   current bucket, which also makes Σ(buckets) = `outstanding`.
7. **`created_at` filters use Bangkok time.** COGS, the stock movement list and
   the full stock export compared a `timestamptz` column against bare dates, so
   the first and last 7 hours of a period leaked into the neighbouring period.
   Now `T00:00:00+07:00` / `T23:59:59.999+07:00`, matching the existing
   convention in `dealStatus.ts:17` and `documentFilters.ts:66`.
8. **Collection rate redefined** from `collected / (collected + today's AR)`
   (period ÷ as-of-today) to `collected / revenue` (same window). Export-only.
   Label updated to state the formula.

## Labels (`FinancialReport.tsx`, `financialReportXlsx.ts`, `reports/index.tsx`)

- "เก็บแล้ว" caption → "รับแล้วจากใบกำกับในรอบ" (states the basis).
- WHT card → "หัก ณ ที่จ่าย · คาดหวัง" with the actual figure in the caption.
- AR list caption "ค้าง {n} วัน" → "เกินกำหนด {n} วัน" (was wrong for not-yet-due).
- AR list heading now says "สูงสุด 20 ราย" (the slice was unlabelled).
- XLSX: two labelled WHT rows; collection-rate row states its formula; WHT sheet
  retitled "หัก ณ ที่จ่าย · หักจริงตามใบเสร็จ" with headers moved to row 3.
- `reports/index.tsx` loading skeleton now mirrors the loaded report (6 KPI
  cards, same column steps and `max-w-row` cap) instead of 4 uncapped ones.
- The reports KPI grid gained `max-w-row`, matching the fixed-count-row rule in
  DESIGN-SYSTEM.md §6 (it was the one page that broke it).

## Verification

- `npx tsc -b`: clean. `npm run lint`: 0 errors, 102 warnings (all pre-existing).
  `lint:design`: passed. `npm run build`: passes.
- `e2e/visual.spec.ts`: `/reports` added (both `visual` and `visual-wide`).
  **Baselines not generated** — no Playwright browsers in this environment.
- Manual tie-out still required in `testcompany@gmail.com` for one month:
  Σ register `total_amount` = "ยอดรวม" · Σ AR list = "ค้างเก็บ" ·
  Σ aging buckets = "ค้างเก็บ" · WHT sheet Σ = the caption's "หักจริง".

## Pending manual step (must check)

`partially_paid` is absent from the enum in `schema.sql:32-42`, and
`work_session/2025-07-26.md:27,146` records the `ALTER TYPE` as a pending manual
step. If it is missing in an environment, partially-paid invoices fall into the
`sent` path and AR overstates by `amount_received`. Run in the Supabase SQL
editor:

```sql
select enumlabel from pg_enum e
  join pg_type t on t.oid = e.enumtypid
 where t.typname = 'document_status';
```

If absent: `ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'partially_paid';`

## Not fixed (deliberately deferred)

- **Chart ignores the selected period** — `monthlyTrend` is anchored to today
  (`getMonthsBack(12)`), and the YTD range uses the current year, so selecting a
  historical month shows no highlighted bar and the exported "แนวโน้มรายได้"
  sheet is "last 6 months from today", not the report period.
- **Screen vs export divergence** — 10 XLSX sheets, of which only the summary,
  the chart and the register have on-screen counterparts. `byType`,
  `topCustomers`, `arAging`, `arDetails`, `lineItems`, `dealNotes` and
  `whtTransactions` are exported but invisible in the app.
- **Four different "outstanding" definitions** across the app
  (`dealFinancials.ts`, `customers/[id].tsx:197-218`, `useDeals.ts:41-47`,
  this hook). They still do not share a model.
- **Leftover customer credit** is still dropped rather than carried as a credit
  balance (precedent exists: `dealFinancials.ts` `customerCredit`).
- **`sent` draft receipts inflate AR** — `documentSend.ts` returns `"sent"` for
  every type and `isArDoc` accepts `sent`.
- **Unbounded selects** (`allDocs`, `bnLinks`) can silently cap at PostgREST's
  1000 rows; no server-side aggregate exists.
- Unlabelled slices (`topCustomers` 10, `lowStockItems` 50, `movements` 200→100),
  dead `docCount`, and no tests for any of this.

## Note: incidental reformat

The four source files were prettier-dirty at HEAD and are now prettier-clean, so
the diff includes whole-file reformatting (647 insertions across 5 files). The
semantic changes are the eight numbered fixes above plus the label changes —
review with `git diff -w` or against this list. `e2e/visual.spec.ts` was already
clean and stays clean.
