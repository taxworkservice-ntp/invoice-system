-- Professional payroll upgrade: independent OT cut-off + leave-lite defaults.
-- HumanSoft-inspired, scoped to our niche (no HRMS, no hardware).
-- Apply manually in Supabase SQL editor (per AGENTS.md). Idempotent.

-- 1. Independent OT earning window per run ("งวดโอที" — may differ from salary period)
alter table payroll_runs add column if not exists ot_start date;
alter table payroll_runs add column if not exists ot_end date;

-- 2. Client defaults for OT cut-off + paid leave
alter table client_payroll_settings add column if not exists ot_cutoff_days integer not null default 0;
alter table client_payroll_settings add column if not exists paid_leave_days_per_year integer not null default 0;

-- 3. Typed pay-item categories on recurring templates (legacy rows stay untyped = "other")
alter table payroll_recurring_items add column if not exists kind text;

-- 4. Attendance import staging (optional — UI works without it; this enables audit trail)
create table if not exists payroll_attendance_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  payroll_run_id uuid not null references payroll_runs(id) on delete cascade,
  employee_code text not null,
  work_date date not null,
  status text not null check (status in ('present','absent','leave','holiday','off')),
  hours numeric(5,2),
  note text,
  created_at timestamptz not null default now(),
  unique (payroll_run_id, employee_code, work_date)
);
alter table payroll_attendance_imports enable row level security;
drop policy if exists "Client reads workspace attendance imports" on payroll_attendance_imports;
create policy "Client reads workspace attendance imports"
  on payroll_attendance_imports for select
  using (auth.uid() = user_id);
drop policy if exists "Client manages workspace attendance imports" on payroll_attendance_imports;
create policy "Client manages workspace attendance imports"
  on payroll_attendance_imports for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create index if not exists idx_attendance_imports_run on payroll_attendance_imports (payroll_run_id);
