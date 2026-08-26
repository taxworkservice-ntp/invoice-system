-- Preserve the employee data and calculation inputs used by each payroll run.
alter table payroll_runs add column if not exists revision integer not null default 1;
alter table payroll_runs add column if not exists finalized_at timestamptz;
alter table payroll_runs add column if not exists finalized_by uuid;
alter table payroll_runs add column if not exists reopened_at timestamptz;
alter table payroll_runs add column if not exists reopened_by uuid;

alter table payroll_line_items add column if not exists employee_code_snapshot text;
alter table payroll_line_items add column if not exists full_name_snapshot text;
alter table payroll_line_items add column if not exists position_snapshot text;
alter table payroll_line_items add column if not exists salary_type_snapshot text;
alter table payroll_line_items add column if not exists base_salary_snapshot numeric(12,2);

-- A reopened run keeps its line items and becomes a new revision.
create or replace function increment_payroll_revision()
returns trigger
language plpgsql
security definer
as $$
begin
  if old.status = 'finalized' and new.status = 'draft' then
    new.revision := old.revision + 1;
    new.reopened_at := now();
    new.reopened_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists payroll_run_revision_trigger on payroll_runs;
create trigger payroll_run_revision_trigger
before update on payroll_runs
for each row execute function increment_payroll_revision();
