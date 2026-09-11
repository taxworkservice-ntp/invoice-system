-- Mirror of supabase/migrations/20260911000000_payroll_batch_types.sql
-- (per repo convention, WHT-module SQL is mirrored to sql/).
-- APPLY MANUALLY: Supabase dashboard SQL editor or `supabase db push`.
-- Until applied, the payroll page shows a schema notice and falls back
-- to treating every run as a salary batch.

alter table public.payroll_runs
  add column if not exists batch_type text not null default 'salary';

alter table public.payroll_runs
  drop constraint if exists payroll_runs_batch_type_check;

alter table public.payroll_runs
  add constraint payroll_runs_batch_type_check
  check (batch_type in ('salary', 'ot', 'adjustment'));

create index if not exists idx_payroll_runs_batch_type
  on public.payroll_runs (user_id, batch_type);

alter table public.client_payroll_settings
  add column if not exists ot_batches_per_month int not null default 0;

alter table public.client_payroll_settings
  drop constraint if exists client_payroll_settings_ot_batches_check;

alter table public.client_payroll_settings
  add constraint client_payroll_settings_ot_batches_check
  check (ot_batches_per_month between 0 and 31);
