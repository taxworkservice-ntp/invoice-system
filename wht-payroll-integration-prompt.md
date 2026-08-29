# WHT × Payroll Integration — Implementation Plan

> Goal: finalized payroll runs automatically create ภ.ง.ด.1 (PND1) withholding-tax records in the WHT module,
> so WHT certificates (50 ทวิ) and PND1 filings can be produced from the WHT page without re-entry.

> Addendum (confirmed): Thai SME worker types — employees **not registered with SSO** are paid as
> ค่าจ้างทำของ (hire of work) and fall under **ภ.ง.ด.3** (flat 3%, no SSO); SSO-registered employees
> fall under **ภ.ง.ด.1** (progressive PIT + SSO). The sync branches per worker type. See §10–15.

## Status: IMPLEMENTED (code) — migration SQL must be applied to the database

**Deploy step (required):** run `supabase/migrations/20260828120000_wht_payroll_link.sql`
(`supabase db push` after `supabase login`, or paste into the Supabase dashboard SQL editor).
Until applied, finalize will show the friendly error "ยังไม่ได้อัปเดตฐานข้อมูล — กรุณารัน migration wht_payroll_link ก่อน".

---

## 1. Current state (researched)

| | WHT module | Payroll module |
|---|---|---|
| Tables | `wht_records` (vendor_id, form_type, issue_date, amount, wht_rate, wht_amount, certificate_no, status active/done), `wht_vendors` (vendor_type company/individual) | `employees` (tax_id 13-digit), `payroll_runs` (draft/finalized, revision, finalized_at/by, reopened_at/by, total_gross/total_net/employee_count), `payroll_line_items` (gross_pay, sso_employee, withholding_tax, net_pay per employee) |
| Entry | Manual only — `useWhtRecords.addRecord()` is the single insert point (`src/hooks/useWhtRecords.ts:60`) | Runs + per-employee rows |
| Linkage | **None** — no FK, no provenance column, zero cross-references | PIT withheld computed client-side in `src/lib/payroll/calculations.ts:215` (PND1 annualized brackets) |

Key facts that make this cheap to build:

- `wht_records.form_type` **already accepts `'pnd1'` / `'pnd1_special'`** (CHECK enum in `sql/add_wht_module.sql:54-58`)
- WHT print page **already renders pnd1** checkmark overlay (`src/app/(client)/wht/print.tsx:35`)
- `employees.tax_id` ↔ `wht_vendors.tax_id` — natural join key, same 13-digit format/validation
- Only existing touchpoint today: per-run Excel export (`buildWhtWorkbook`, `src/lib/payroll/reportXlsx.ts:162`) — stays as-is
- Payroll page already `readOnly` for detail modal when finalized — matches the "locked rows" philosophy

## 2. Decisions (confirmed by user)

1. **Trigger**: auto-create on finalize + re-sync on refinalize; reopen cleans up. Manual re-sync button also available.
2. **Granularity**: one `wht_record` per employee per run (enables per-employee certificates + PND1 breakdown).
3. **Edit rights**: payroll-sourced rows are locked in the WHT page (only mark done/undone + certificate actions). Corrections happen in payroll → re-sync.
4. **Worker type**: `employees.sso_registered boolean NOT NULL default true` (unregistered → PND3 ค่าจ้างทำของ).
5. **PND3 rate**: fixed 3% (matches the WHT preset map "ค่าจ้างทำของ" = 3).
6. **Scope**: worker-type branching folded into this integration — one migration, one pass.

## 3. Migration

New `supabase/migrations/<timestamp>_wht_payroll_link.sql` (mirrored to `sql/` per WHT module convention):

```sql
alter table public.wht_records
  add column if not exists source text not null default 'manual',
  add column if not exists payroll_run_id uuid references public.payroll_runs(id) on delete set null,
  add column if not exists employee_id uuid references public.employees(id) on delete set null;

alter table public.wht_records
  add constraint wht_records_source_check check (source in ('manual', 'payroll'));

create unique index if not exists wht_records_payroll_unique
  on public.wht_records (payroll_run_id, employee_id)
  where source = 'payroll' and payroll_run_id is not null and employee_id is not null;

create index if not exists wht_records_payroll_run_idx
  on public.wht_records (user_id, payroll_run_id);
```

RLS unchanged (all `wht_records` policies are `user_id`-based). Partial unique index makes re-sync idempotent.

## 4. Sync engine — new `src/lib/payroll/whtSync.ts`

`syncRunToWht(user, run)` — self-contained (queries DB, does not trust page state):

1. Load **DB-saved** `payroll_line_items` for the run + run's eligible employees
   (⚠️ refined after page examination: `getEffectiveItem` previews with recurring templates can look
   "complete" without a saved row — WHT must mirror what `recalc_payroll_run_totals` sees, i.e. saved rows only)
2. Resolve vendor per employee: match `wht_vendors` by normalized `tax_id` (strip dashes);
   else insert new vendor (`vendor_type: 'individual'`, name = full_name, tax_id, no address)
3. Upsert one record per employee:
   - `form_type: 'pnd1'` (forced — vendor_type auto-select pnd3 must NOT apply here)
   - `issue_date = run.pay_date` (finalize already guarantees `pay_date >= period_end`)
   - `amount = gross_pay`, `wht_amount = withholding_tax` (payroll value is authoritative, never recomputed)
   - `wht_rate = round2(withholding_tax / gross_pay × 100)` (display only; numeric(5,2) supports it)
   - `description = "เงินเดือน " + (run.label || งวด {period_start}–{period_end})`
   - `source: 'payroll'`, `payroll_run_id`, `employee_id`
4. Re-sync semantics:
   - existing linked record → update amount/rate/tax/description/issue_date **in place** (keep certificate_no)
   - employee no longer in run → delete linked record **only while `status = 'active'`**; `done` records kept and reported
   - rows marked `done` are never amount-updated (skipped + reported)
5. Employee without `tax_id` → skipped, returned in result summary (cannot file PND1)
6. Certificate numbers: extract cert-number logic from `useWhtRecords.ts:32-51` (`generateCertNo`, `WT`+YYMMxxx)
   into a shared helper (e.g. `src/lib/whtCertificate.ts`), reuse it in the hook AND for batch assignment after insert
7. Audit: add `PAYROLL_WHT_SYNCED` to `AUDIT_ACTIONS` (`src/lib/payroll/audit.ts:84-91`), log `{ created, updated, deleted, skipped }`

Return type: `{ created: number; updated: number; deleted: number; skippedNoTaxId: Employee[]; keptDone: number }`

## 5. Payroll page — `src/app/(client)/payroll/index.tsx`

| Change | Location |
|---|---|
| Call `syncRunToWht` after successful finalize; toast "สร้างรายการภาษีหัก ณ ที่จ่าย N รายการ" (+ skipped count); audit log | `handleFinalize` success branch (547-557) |
| On reopen: delete linked `active` payroll records; warn if `done` ones were kept | `handleReopen` success branch (572-581) |
| "ซิงก์ WHT" menu item (finalized only) wired to re-sync; busy-state via existing `run()` pattern | `PayrollExportMenu` finalized section (1669-1679) |
| Finalized banner (1081-1108): add line "รายการ WHT สร้างแล้ว n รายการ → ดูที่ WHT" linking to `/wht?source=payroll` | finalized banner |
| Finalize confirm modal copy mentions WHT records will be created | modal (1517-1571) |
| Types: extend `PayrollRun` usage — no type change needed; sync result state local to page | |

Existing Excel WHT export (`handleExportWht` 611-618) stays unchanged.

## 6. WHT page — `src/app/(client)/wht/index.tsx`

- Records list: badge "Payroll" on `source = 'payroll'` rows; filter chips ทั้งหมด / รายการรับเอง / จาก Payroll
- Locked rows: hide Edit for payroll-sourced records; keep mark done/undone + certificate actions + delete disabled
  (delete only via payroll reopen/resync to preserve the unique-index invariant)
- Deep-link: read `?source=payroll` (and optional `?run=<id>`) to pre-filter on load
- Add/Edit modal unchanged (stays pnd3/pnd53 manual-only)
- Print page: no changes needed (pnd1 already supported); API `api/wht/generate.js` unchanged

## 7. Verification plan

1. `npx tsc -p tsconfig.app.json --noEmit` — expect only pre-existing payroll errors
2. `npx vitest run tests/integration tests/payroll`
3. Manual: finalize run → N pnd1 records appear on WHT page with badges; reopen → active ones removed;
   edit + refinalize → amounts updated in place; employee without tax_id → skipped + reported;
   WHT print multi-select includes pnd1 pages

## 8. Edge cases

- Employee tax_id changed → new vendor matched (old vendor remains; acceptable, reported)
- Multiple runs per month (flexible periods) → each run owns its record set; monthly overlap constraint unaffected
- Recurring-template "complete but unsaved" rows → excluded from WHT (DB rows only), reported as skipped
- `done` records → excluded from updates/deletes, counted in summary
- Rounding → rate stored 2dp for display; `wht_amount` never recomputed from rate on payroll rows

## 9. Out of scope

- ภ.ง.ด.1 e-filing XML export (explicitly out of scope in taxwork-payroll-master-prompt.md)
- Unifying the receipt `wht_certificate_no` numbering space with `wht_records` certificates
- Backfilling historical runs (can be added later as a one-off script using the same sync engine)

---

## 10. Addendum — Worker-type branching (SSO vs ค่าจ้างทำของ)

Behavior matrix:

| | SSO-registered employee (default) | Non-SSO worker |
|---|---|---|
| WHT form | ภ.ง.ด.1 | ภ.ง.ด.3 |
| WHT calc | progressive PIT (`calculateMonthlyWithholdingTax`) | flat 3% of gross |
| SSO | 5%/5% capped 17,500 | 0 both sides |
| Net | gross − SSO − PIT − deductions | gross − 3% − deductions |
| Record description | "เงินเดือน งวด…" | "ค่าจ้างทำของ" |

### 11. Migration (same file as §3)
```sql
alter table public.employees
  add column if not exists sso_registered boolean not null default true;
```

### 12. Calculation branching — `src/lib/payroll/calculations.ts`
- `PayrollLineInput.sso_registered?: boolean` (default `true`)
- `calculateNet`: non-SSO ⇒ `sso_employee/sso_employer = 0`, `withholding_tax = gross × PND3_HIRE_RATE (0.03)`, skip PIT brackets
- Downstream consumers (totals, `getRowStatus`, finalize gating, rounding) unchanged

### 13. Payroll UI
- `payroll/employees.tsx`: "ลงทะเบียนประกันสังคมแล้ว" toggle + worker-type badge
- `payroll/index.tsx`: SSO columns "—" for non-SSO; WHT cell hint "ภ.ง.ด.3 · 3%"; detail modal mirrors
- `payslipPdf.ts`: SSO line omitted for non-SSO; WHT line "ภาษีหัก ณ ที่จ่าย (ค่าจ้างทำของ 3%)"

### 14. Excel export — `reportXlsx.ts`
`buildWhtWorkbook` → two sections/sheets: ภ.ง.ด.1 (SSO employees) + ภ.ง.ด.3 (ค่าจ้างทำของ).

### 15. Sync branching — `whtSync.ts`
Per employee: `sso_registered` → pnd1 record; else pnd3 record (rate 3, tax = gross × 3%). Vendor `individual` for both.

### Verification additions
- Unit tests: non-SSO gross 20,000 → WHT 600, SSO 0; SSO employee results unchanged
- Manual: mixed run → WHT page shows pnd1 + pnd3 records with correct forms/descriptions; Excel has both sections

### Out of scope (addendum)
ภ.ง.ด.1ก/3ก semi-annual variants · e-payment reduced rates · PND1 e-filing XML · server-side sync (idempotent re-sync covers it for now)
