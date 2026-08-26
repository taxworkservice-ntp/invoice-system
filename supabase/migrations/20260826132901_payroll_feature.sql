-- Add payroll to feature_key check (only if table exists)
do $$
begin
  if exists (select from pg_tables where schemaname = 'public' and tablename = 'client_features') then
    alter table client_features drop constraint if exists client_features_feature_key_check;
    alter table client_features add constraint client_features_feature_key_check
      check (feature_key in ('service_job_details', 'classic_v2_template', 'dn_appendix', 'payroll'));
  end if;
end $$;

-- ============================================================
-- PAYROLL — Employees
-- ============================================================

create table if not exists employees (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  employee_code   text not null,
  full_name       text not null,
  tax_id          text,
  position        text not null,
  department      text,
  salary_type     text not null check (salary_type in ('monthly', 'daily')),
  base_salary     numeric(12,2) not null default 0,
  bank_account    text,
  start_date      date not null,
  status          text not null default 'active' check (status in ('active', 'inactive')),
  end_date        date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, employee_code)
);

alter table employees enable row level security;

drop policy if exists "Client reads workspace employees" on employees;
create policy "Client reads workspace employees"
  on employees for select
  using (public.is_client_workspace_member(user_id));

drop policy if exists "Client manages workspace employees" on employees;
create policy "Client manages workspace employees"
  on employees for all
  using (public.is_client_workspace_member(user_id))
  with check (public.is_client_workspace_member(user_id));

drop policy if exists "Admin manages all employees" on employees;
create policy "Admin manages all employees"
  on employees for all
  using (public.is_admin())
  with check (public.is_admin());

drop index if exists idx_employees_user;
create index idx_employees_user on employees (user_id);
drop index if exists idx_employees_user_status;
create index idx_employees_user_status on employees (user_id, status);

-- ============================================================
-- PAYROLL — Runs (one per client per period)
-- ============================================================

create table if not exists payroll_runs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  period_month    int not null check (period_month between 1 and 12),
  period_year     int not null,
  pay_date        date not null,
  status          text not null default 'draft' check (status in ('draft', 'finalized')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, period_month, period_year)
);

alter table payroll_runs enable row level security;

drop policy if exists "Client reads workspace payroll runs" on payroll_runs;
create policy "Client reads workspace payroll runs"
  on payroll_runs for select
  using (public.is_client_workspace_member(user_id));

drop policy if exists "Client manages workspace payroll runs" on payroll_runs;
create policy "Client manages workspace payroll runs"
  on payroll_runs for all
  using (public.is_client_workspace_member(user_id))
  with check (public.is_client_workspace_member(user_id));

drop policy if exists "Admin manages all payroll runs" on payroll_runs;
create policy "Admin manages all payroll runs"
  on payroll_runs for all
  using (public.is_admin())
  with check (public.is_admin());

drop index if exists idx_payroll_runs_user;
create index idx_payroll_runs_user on payroll_runs (user_id);

-- ============================================================
-- PAYROLL — Line items (one per employee per run)
-- ============================================================

create table if not exists payroll_line_items (
  id              uuid primary key default gen_random_uuid(),
  payroll_run_id  uuid not null references payroll_runs(id) on delete cascade,
  employee_id     uuid not null references employees(id) on delete cascade,
  days_worked     numeric(5,1),
  ot_entries      jsonb not null default '[]',
  additions       jsonb not null default '[]',
  deductions      jsonb not null default '[]',
  gross_pay       numeric(12,2),
  sso_employee    numeric(12,2),
  sso_employer    numeric(12,2),
  withholding_tax numeric(12,2),
  net_pay         numeric(12,2),
  unique (payroll_run_id, employee_id)
);

alter table payroll_line_items enable row level security;

drop policy if exists "Client reads workspace line items" on payroll_line_items;
create policy "Client reads workspace line items"
  on payroll_line_items for select
  using (
    public.is_client_workspace_member(
      (select user_id from payroll_runs where id = payroll_line_items.payroll_run_id)
    )
  );

drop policy if exists "Client manages workspace line items" on payroll_line_items;
create policy "Client manages workspace line items"
  on payroll_line_items for all
  using (
    public.is_client_workspace_member(
      (select user_id from payroll_runs where id = payroll_line_items.payroll_run_id)
    )
  );

drop policy if exists "Admin manages all line items" on payroll_line_items;
create policy "Admin manages all line items"
  on payroll_line_items for all
  using (public.is_admin())
  with check (public.is_admin());

drop index if exists idx_line_items_run;
create index idx_line_items_run on payroll_line_items (payroll_run_id);

-- ============================================================
-- PAYROLL — Client settings
-- ============================================================

create table if not exists client_payroll_settings (
  user_id               uuid primary key references profiles(id) on delete cascade,
  ot_divisor            numeric(4,1) not null default 30,
  normal_ot_multiplier  numeric(3,1) not null default 1.5,
  holiday_ot_multiplier numeric(3,1) not null default 3.0,
  updated_at            timestamptz not null default now()
);

alter table client_payroll_settings enable row level security;

drop policy if exists "Client reads own payroll settings" on client_payroll_settings;
create policy "Client reads own payroll settings"
  on client_payroll_settings for select
  using (public.is_client_workspace_member(user_id));

drop policy if exists "Client manages own payroll settings" on client_payroll_settings;
create policy "Client manages own payroll settings"
  on client_payroll_settings for all
  using (public.is_client_workspace_member(user_id))
  with check (public.is_client_workspace_member(user_id));

drop policy if exists "Admin manages all payroll settings" on client_payroll_settings;
create policy "Admin manages all payroll settings"
  on client_payroll_settings for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- PAYROLL — Audit Log
-- ============================================================

create table if not exists payroll_audit_log (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  action          text not null,
  entity_type     text not null,
  entity_id       uuid not null,
  details         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

alter table payroll_audit_log enable row level security;

drop policy if exists "Client reads workspace audit log" on payroll_audit_log;
create policy "Client reads workspace audit log"
  on payroll_audit_log for select
  using (public.is_client_workspace_member(user_id));

drop policy if exists "Client manages workspace audit log" on payroll_audit_log;
create policy "Client manages workspace audit log"
  on payroll_audit_log for all
  using (public.is_client_workspace_member(user_id))
  with check (public.is_workspace_owner(user_id));

drop policy if exists "Admin manages all audit log" on payroll_audit_log;
create policy "Admin manages all audit log"
  on payroll_audit_log for all
  using (public.is_admin())
  with check (public.is_admin());

drop index if exists idx_audit_log_user;
create index idx_audit_log_user on payroll_audit_log (user_id);
drop index if exists idx_audit_log_entity;
create index idx_audit_log_entity on payroll_audit_log (entity_type, entity_id);
drop index if exists idx_audit_log_created;
create index idx_audit_log_created on payroll_audit_log (created_at desc);
