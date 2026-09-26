# 2026-09-26 — SSO in/out movement report (สปส.1-03 / 6-09 reference)

## What shipped (existing roster export untouched)
- **Two additional single-sheet handover files** from the employees page:
  `sso-joiners-YYYY-MM.xlsx` (สปส.1-03) and `sso-leavers-YYYY-MM.xlsx`
  (สปส.6-09). Single flat table each — safe whether handed to SSO or used
  as filing reference.
- **Filing-compliant columns**: order/code/title/first/last/13-digit ID
  (text cells)/position/employment type (รายเดือน)/event date + deadline —
  joiners +30 days, leavers 15th of next month (Dec→Jan rollover handled).
  Dates in Buddhist DD/MM/YYYY text for officer readability.
- **Scope**: `start_date`/`end_date` in the selected month; monthly staff
  only (business choice); contractors + over-60-at-hire skipped with counts;
  invalid IDs / empty names block with named toasts (same UX as roster).
- **UI**: header `ส่งออก` menu (roster + 2 movement items with form refs);
  persistent report month/year selector (default current month) in the
  count row. Roster handler byte-identical.
- Engine: `buildSsoMovementRows` + `buildSsoMovementWorkbook` in
  `ssoExport.ts`; 7 tests (boundaries, skips, both deadlines, workbook
  headers/sheet names).

## Verification
- vitest tests/payroll: 114/114. tsc clean; design check passed; build OK.
- No migration. Uncommitted; awaiting review/commit decision.

## Caveats
- Daily staff excluded by client choice (registration legally applies to them
  too — one filter flag away if practice changes).
- Leavers without `end_date` never appear (data hygiene).
- Reference list for preparing 1-03/6-09, not the SSO e-service upload format.
