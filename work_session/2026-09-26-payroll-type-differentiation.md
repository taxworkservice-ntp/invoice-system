# 2026-09-26 — OT vs salary UI differentiation (full package)

## Principle
Same page skeleton, different substance + accent (matches Gusto off-cycle,
Rippling, HumanSoft งวด model). No third OT tab.

## What shipped (`payroll/index.tsx` + `payslipPdf.ts`, presentational only)
- **Header identity**: OT rounds tint the run card (`!border-amber-200
  `!bg-amber-50/40`) with title `รอบ OT · {range}` + scope sub-line.
- **Adaptive summary cards**: OT shows คนมี OT x/y · ชั่วโมง OT รวม ·
  ค่า OT รวม · สุทธิรอบนี้ (new `otStats`/`otHoursLabel` aggregates);
  salary cards unchanged. Same grid/positions.
- **Table emphasis**: OT column header shows the window (`OT · 1–6`);
  OT values semibold ink-900 in OT mode.
- **Adaptive banner**: empty OT draft guides
  (`ยังไม่มี OT ในรอบนี้ — เปิดรายชื่อพนักงานเพื่อบันทึกชั่วโมง OT`);
  otherwise the scope explainer.
- **Finalize modal**: OT title (`ยืนยันปิดรอบ OT`) + OT grid
  (ค่า OT รวม / ชั่วโมง OT รวม / คนมี OT / สุทธิรอบนี้).
- **Slip titles**: `สลิปค่าล่วงเวลา (OT)` + `OT Pay Slip` sub for OT runs
  (screen preview + PDF both header variants, derived from
  `run.batch_type`); salary slips unchanged.

## Verification
- vitest tests/payroll: 10 files, 96/96 (new `payslip.test.ts` ×2).
- tsc clean; design-system check passed; production build OK.
- No migration. Uncommitted; awaiting review/commit decision.
