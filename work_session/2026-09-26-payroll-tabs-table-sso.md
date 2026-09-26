# 2026-09-26 — Tabs upgrade, OT table restructure, monthly SSO engine, EMP058 fix

## Tabs + OT table (Phase A)
- `PayrollTabs`: bolder active state (primary-soft/deep + border), Wallet/Users
  icons, count badges (`runsCount`/`employeesCount`), full-width on mobile.
- OT draft table restructured: พนักงาน / ชั่วโมง OT / ค่า OT (+window) /
  เงินเพิ่ม / เงินหัก / สุทธิรอบนี้. Base + day columns gone in OT mode.
- Finalized OT view: hours + OT pay + net + settlement note (SSO/WHT settle
  in the salary round). Footer totals updated for both modes.

## Monthly SSO/WHT engine (Phase B core, pure + tested)
- New `src/lib/payroll/monthClose.ts`: `ssoWageBase` (floor 1,650 / ceiling
  17,500), `computeMonthlyObligations` (contractor 3% stays per-run, 60+
  exempt), `closingSalaryRunId`, `attributeObligations` (closing draft takes
  owed minus finalized-stored, floored at zero; others zero), `applyAttribution`
  (keeps gross − SSO − WHT − deductions = net).
- `tests/payroll/monthClose.test.ts` ×7, incl. the 30k-split → 875 regression.
- Page attribution wiring DONE: `monthLineItems` fetch (all month runs) +
  `monthClose` memo (owed/attributed/reconciliation); `calcLineItem` applies
  attribution on drafts (contractors keep per-run 3%, finalized keep stored);
  exports (`buildCalcRows`) match the table; detail modal + slip preview take
  `attributed` props; reconciliation block in สรุปทั้งเดือน (settled /
  pending / no-salary-round states); SSO export files month-aggregated rows.
- Limitation: Download Center per-run exports use scoped (not attributed)
  values — finalize-first workflow keeps filings right via the page.

## EMP058 missing accent (root-caused + fixed)
- Cause: daily employee + empty row → `untouched` → `border-l-cool-200`,
  a dead class (cool ramp retired; lint regex missed `-l-` infix).
- Fixes: token → `border-l-ink-200`; lint regex now covers directional
  infixes (verified it catches the old string); `getRowStatus` moved to
  `src/lib/payroll/rows.ts` with `opts.isOtRun` (daily staff skip the day
  requirement in OT rounds — previously red-blocked finalize with no fix
  path); page call sites pass `{ isOtRun }`; +4 status tests.

## Verification
- vitest tests/payroll: 11 files, 107/107. tsc clean, design check passed,
  production build OK.
- Uncommitted; awaiting review/commit decision.
