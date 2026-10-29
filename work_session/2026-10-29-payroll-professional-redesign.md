# 2026-10-29 — Payroll page: production-grade UX pass

## Scope

Full redesign of `/payroll` around the pay-run lifecycle, plus a consistency
sweep across the payroll surfaces. No database or calculation changes.

## Information architecture

- **Run header** now owns the whole context: month/year, run switcher, period
  summary, pay date (autosaved), status + batch badges, and the `⋯` menu.
  The old "month plan strip + unplanned chips" navigation is gone; the plan is
  a "missing slots" hint and lives inside the create sheet.
- **Lifecycle stepper** (`RunLifecycle`): กรอกข้อมูล → ตรวจสอบ → ปิดรอบ →
  ภาษี/สลิป. It is derived from status + readiness, never colour-only.
- **Review rail** (`ReviewRail`): readiness checklist (complete / attention /
  untouched / WHT), totals, the primary `ปิดรอบ` action, and post-close WHT
  actions. At 1440px and up it is a sticky side rail; below that it sits under
  the table as two summary cards so the ledger gets the full width.
- **Toolbar** above the table: search, `ทั้งหมด / ต้องตรวจ / ยังไม่กรอก`
  filters, นำเข้าเวลา, คัดลอก, and the primary `ปิดรอบ` (always reachable
  without scrolling).
- **Table is the work surface**: scroll container with sticky header/footer,
  compact rows, status icon + tooltip, edit/print in the action column,
  `scope="col"` headers, and mobile employee cards below `lg`.
- Run actions live only in the run header (the top bar keeps export); the
  no-run state has a single CTA in the empty state.
- **Drawers/sheets**: attendance import, run history, and run creation are
  modals now instead of inline stacked sections. The month summary moved below
  the table.
- **Detail editor** is a split modal: inputs on the left, sticky live
  calculation + actions on the right. Additions/deductions are full-width
  cards (the old nested 2-column cards were unreadable at this width).
- **Create run** has one entry point: recommended plan slots, whole-month (only
  when the month has no run), or a custom window. A custom window that ends in
  another month now follows that month instead of leaving the page on a run
  that is not in the current month.

## Visual system

- All raw `red/amber/green/blue/purple-*` utilities in the payroll pages were
  mapped to `danger/success/warning/primary` tokens (AA contrast; e.g.
  `text-red-500` 3.76:1 → `text-danger` 5.44:1).
- New `BatchBadge` (salary = primary, OT = warning, adjustment = teal) replaces
  three hand-rolled badge styles.
- `TH_STICKY`/`TF_STICKY` now keep headers on one line; employee cells truncate
  with a title instead of wrapping.
- Export menu gained `shadow-overlay`; export icons are neutral.
- Payslip screen got a real context bar (slip type + employee + run) instead of
  a bare back/print strip.
- Employees page table got a horizontal-scroll wrapper for 640–880px.

## Files

- `src/app/(client)/payroll/index.tsx` — layout, toolbar, table/cards, modals.
- `src/components/payroll/ReviewRail.tsx` (new)
- `src/components/payroll/RunLifecycle.tsx` (new)
- `src/components/payroll/RunMenu.tsx` (new)
- `src/components/payroll/BatchBadge.tsx` (new)
- `src/components/payroll/PayrollHistoryPanel.tsx` (new; extracted)
- `src/components/payroll/AttendancePanel.tsx` — embedded drawer mode.
- `src/lib/payroll/schedule.ts` — exported `batchTypeOf`.
- `src/lib/payroll/rows.ts` — exported `ROW_STATUS_LABELS`.
- `src/app/(client)/payroll/employees.tsx`,
  `src/app/(client)/settings/payroll.tsx` — token sweep + scroll fix.

## Verification

- `npx tsc --noEmit` clean.
- `npm run lint` — 0 errors (remaining warnings are pre-existing hook/unused
  warnings outside payroll).
- `npm run lint:design` — passed.
- `npm run build` — passed.
- `npx vitest run tests/payroll` — 14 files, 123 tests passed.
- Visual QA with Supabase REST mocked at 1280 / 1440 / 390: desktop side rail,
  tablet table-first layout, mobile cards + toolbar action, detail editor,
  create sheet, employees table.

## Notes

- The e2e test workspace does not have the `payroll` feature enabled (RLS
  blocks inserting it with the anon key), so `e2e/visual.spec.ts` still captures
  the deals page for `/payroll`. The baseline should be recaptured once the
  feature is enabled for that workspace; the QA above used a route-level mock
  instead of touching remote data.
- No migrations were added.
