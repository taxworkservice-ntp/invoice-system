-- ============================================================
-- Flexible pay periods: multiple runs per month with custom ranges
-- ============================================================

alter table payroll_runs
  add column if not exists period_start date,
  add column if not exists period_end   date,
  add column if not exists label        text;

-- Backfill existing month-based runs to full-month windows
update payroll_runs
set period_start = make_date(period_year, period_month, 1),
    period_end   = (make_date(period_year, period_month, 1) + interval '1 month - 1 day')::date
where period_start is null;

-- Keep legacy columns and range columns mutually synced.
-- Statutory month = month of period_end.
create or replace function sync_payroll_period_columns()
returns trigger
language plpgsql
as $$
begin
  -- Legacy insert path (no explicit ranges): derive from month/year
  if new.period_start is null or new.period_end is null then
    new.period_start := coalesce(new.period_start, make_date(new.period_year, new.period_month, 1));
    new.period_end   := coalesce(new.period_end, (make_date(new.period_year, new.period_month, 1) + interval '1 month - 1 day')::date);
  end if;

  if new.period_start > new.period_end then
    raise exception 'period_start must not be after period_end';
  end if;

  -- Derive legacy identity columns from the statutory month (month of period_end)
  new.period_month := extract(month from new.period_end)::int;
  new.period_year  := extract(year  from new.period_end)::int;

  return new;
end;
$$;

drop trigger if exists payroll_run_period_sync_trigger on payroll_runs;
create trigger payroll_run_period_sync_trigger
before insert or update on payroll_runs
for each row execute function sync_payroll_period_columns();

-- Replace per-month uniqueness with a hard no-overlap guarantee per tenant.
-- The old unique constraint would block multiple runs within one month.
alter table payroll_runs drop constraint if exists payroll_runs_user_id_period_month_period_year_key;

create extension if not exists btree_gist;

do $$
begin
  alter table payroll_runs add constraint payroll_runs_no_overlap
    exclude using gist (
      user_id with =,
      daterange(period_start, period_end, '[]') with &&
    );
exception when duplicate_object then null; end $$;

create index if not exists idx_payroll_runs_user_period_end on payroll_runs (user_id, period_end desc);
