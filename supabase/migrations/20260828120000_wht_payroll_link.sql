-- WHT × Payroll integration:
-- 1) provenance columns on wht_records so payroll runs can sync per-employee
--    withholding records (ภ.ง.ด.1 for SSO employees, ภ.ง.ด.3 ค่าจ้างทำของ for non-SSO workers)
-- 2) worker type on employees (SSO registration drives the withholding path)

alter table wht_records
  add column if not exists source text not null default 'manual';

alter table wht_records
  add constraint wht_records_source_check check (source in ('manual', 'payroll'));

alter table wht_records
  add column if not exists payroll_run_id uuid references payroll_runs(id) on delete set null;

alter table wht_records
  add column if not exists employee_id uuid references employees(id) on delete set null;

-- One payroll-sourced record per employee per run — makes re-sync idempotent.
create unique index if not exists wht_records_payroll_unique
  on wht_records (payroll_run_id, employee_id)
  where source = 'payroll' and payroll_run_id is not null and employee_id is not null;

create index if not exists wht_records_payroll_run_idx
  on wht_records (user_id, payroll_run_id);

alter table employees
  add column if not exists sso_registered boolean not null default true;
