# Reports Phase 1+2 polish — Session Record

_Session date: 2026-09-04. No migration — UI/data-label layer only. Print
pipeline untouched._

## Phase 1 — trust fixes

- KPI scope labels (`FinancialReport.tsx`): period cards carry `รอบนี้`,
  ค้างเก็บ carries `สะสม · ณ วันนี้`; AR headings carry `สะสม`.
- Delta caption (`useReports.deltaCaptionForRange`, new export): month →
  `vs เดือนก่อน`, full year → `vs ปีก่อน`, ~quarter → `vs ไตรมาสก่อน`,
  else `vs ช่วงก่อน`. Wired into the ยอดรวม card; reusable by
  download-center later.
- WHT export follows the selected period (`useReports.ts` WHT filter on
  issue/created date); previously all-time rows under a period label.
- byType Thai labels: shared `docTypeLabels` hoisted above the breakdown
  (was `label: ""`); XLSX writes `t.label || t.docType`; monthly-trend sheet
  title parameterized by `periodLabel` (was hardcoded 6 เดือน).
- Truncation notices (`StockReport.tsx`): movements `แสดง 100 จาก N · ทั้งหมด
  ใน Excel` (only when N>100); valuation `สูงสุด 20 อันดับ`; low-stock
  `10 จาก N รายการ` (only when N>10).

## Phase 2 — presentation

- Currency: `฿` no-space + `formatCurrency` on SummaryCards (title attr too)
  and TransactionTable body/footer (+ `tabular-nums`).
- Chart (`FinancialReport.tsx BarChart`): value labels on active/max/hovered
  bars, max bar distinct green (`#2E7D4F`) vs active primary, zero renders at
  baseline (no 2px stub), `title` tooltips (touch-accessible) incl. drill hint,
  `ข้อมูลเดือนเดียว` note for single-bar YTD.
- Copy/status: empty states → `ยังไม่มีรายการในช่วงนี้` (report + table);
  overdue receipts no longer green (`is_paid` excludes `overdue` at source —
  also fixes the XLSX green text).
- Buddhist dates: new `formatBuddhistMonth("2026-09") → "ก.ย. 2569"` in
  `lib/dates.ts`; WHT month filter + download-center stock range use it.

## Verification

- `npx tsc --noEmit` clean; `formatBuddhistMonth/Date` outputs verified
  headlessly; pagination checks unaffected (no print changes).
- Manual QA pending: month switch, YTD/quarter download-center exports
  (screen vs XLSX totals + WHT sheet period), chart drill, stock notices.

## Parked (Phase 3)

Export loading states, error retry, query pagination/RPCs, XLSX-button
permission alignment, report print stylesheets, CSV label with no CSV.
