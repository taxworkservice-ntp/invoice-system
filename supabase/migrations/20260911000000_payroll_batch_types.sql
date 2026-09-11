-- ============================================================
-- Payroll professional batches: separate disbursement batches
-- (salary vs OT vs adjustments) sharing one statutory month.
-- Professional pattern: cash can move on many cadences per earning
-- type, while SSO/PND1 always aggregate on the monthly totals.
-- ============================================================

alter table public.payroll_runs
  add column if not exists batch_type text not null default 'salary';

alter table public.payroll_runs
  drop constraint if exists payroll_runs_batch_type_check;

alter table public.payroll_runs
  add constraint payroll_runs_batch_type_check
  check (batch_type in ('salary', 'ot', 'adjustment'));

create index if not exists idx_payroll_runs_batch_type
  on public.payroll_runs (user_id, batch_type);

-- Expected OT disbursements per month (0 = ad-hoc / not scheduled).
-- Expected salary batches derive from pay_frequency
-- (monthly → 1, semimonthly → 2) for the month-close checklist.
alter table public.client_payroll_settings
  add column if not exists ot_batches_per_month int not null default 0;

alter table public.client_payroll_settings
  drop constraint if exists client_payroll_settings_ot_batches_check;

alter table public.client_payroll_settings
  add constraint client_payroll_settings_ot_batches_check
  check (ot_batches_per_month between 0 and 31);
