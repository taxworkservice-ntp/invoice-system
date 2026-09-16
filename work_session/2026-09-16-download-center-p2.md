# 2026-09-16 — Download Center redesign · P2 (tax pack, WHT batch, payroll)

Continues `2026-09-16-download-center-p1.md`. P2 adds the tax/compliance and
payroll surfaces chosen earlier.

## What
### Tax pack
- `src/lib/download/taxReports.ts` — pure builders.
  - **รายงานภาษีขาย** (output VAT from the month's tax invoices).
  - **ภ.พ.30 worksheet** = ภาษีขาย − ภาษีซื้อ (manual) → ภาษีที่ต้องชำระ/ชำระเกิน.
  - **ภ.ง.ด.3/53 register** (WHT we withhold from vendors; distinct from the
    customer-WHT already in the financial report).
  - One XLSX with 3 sheets; CSV for the sales report.
- `src/components/download/TaxPackCard.tsx` — month/year, live output-VAT
  preview, manual **input VAT + note** persisted to `tax_filings`, XLSX/CSV
  download.
- `sql/20260916_tax_filings.sql` — new table (member read + manage), applied.

### WHT certificates + register
- `src/components/download/WhtBatchCard.tsx` — month picker, count of rows
  missing certificate numbers, "ดาวน์โหลดใบรับรอง (PDF)" (assigns missing numbers
  via `assignWhtCertificateNo`, then `POST /api/wht/generate`) and "CSV ภ.ง.ด.3/53".
- Hardened `server/handlers/wht/generate.js`: now validates **every** requested
  record belongs to the caller and that the returned count matches the unique id
  set (previously only `records[0]` was checked — cross-workspace IDOR gap).

### Payroll
- `src/lib/payroll/rows.ts` — extracted the payroll calc path
  (`createEmptyLineItem`, `resolveEffectiveLineItem`, `buildPayrollCalcRows`,
  `payrollRunPeriod`) as the **single source of truth**. The Payroll page now
  imports these instead of its local copies (behavior unchanged).
- `src/lib/payroll/exportRun.ts` — `listPayrollRuns`, `loadPayrollExportBundle`
  (run + eligible employees + recurring + line items + settings → calc rows).
- `src/lib/payroll/payslipBatch.ts` — `buildPayslipsZip(bundle, company)`.
- `src/components/download/PayrollExportCard.tsx` — run picker + สรุป/เงินโอน/
  ภาษี (XLSX) + สลิป (ZIP). Heavy modules are dynamically imported so they stay
  out of the main chunk.

## Files
New: `src/lib/download/taxReports.ts`, `src/lib/payroll/rows.ts`,
`src/lib/payroll/exportRun.ts`, `src/lib/payroll/payslipBatch.ts`,
`src/components/download/{TaxPackCard,WhtBatchCard,PayrollExportCard}.tsx`,
`sql/20260916_tax_filings.sql`.
Changed: `src/app/(client)/payroll/index.tsx` (use shared rows),
`server/handlers/wht/generate.js` (ownership), `download-center/index.tsx`
(render the three cards), `e2e/download-center.spec.ts` (+3 tests).

## Applied
`sql/20260916_tax_filings.sql` — **APPLIED** to `fbhoqcpqqtbiorzbuqcl` via the
Management API; verified table + 2 policies.

## Verify
- `npx tsc -b` clean.
- `e2e/download-center.spec.ts` **10/10** (adds tax pack XLSX, WHT register CSV,
  WHT certificates PDF — PDF API mocked).
- Full e2e **41 passed, 2 failed** (the two pre-existing: `deal-financials-verify`
  strict locator, `invoice-from-dn` ref-mode count).
- Unit/payroll tests **129 passed** (confirms the payroll refactor is safe).

## Notes / follow-ups
- Input VAT is manual by design (no purchases ledger). If a supplier-invoice
  ledger is ever built, `calcTaxPack` should read it instead.
- Payroll card has no e2e (test workspace has no payroll run); verified via unit
  tests + page render.
- P3 remains: full backup/restore (dry-run + sequence reconciliation) and the
  download-history UI.
