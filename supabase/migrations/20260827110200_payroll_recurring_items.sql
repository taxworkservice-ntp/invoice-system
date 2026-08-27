-- ============================================================
-- Payroll recurring items: per-employee template entries
-- (e.g. loan installments, savings co-op, fixed allowances)
-- that auto-populate draft payroll lines for review before saving.
-- ============================================================

create table if not exists payroll_recurring_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  employee_id  uuid not null references employees(id) on delete cascade,
  direction    text not null check (direction in ('addition', 'deduction')),
  label        text not null,
  amount       numeric(12,2) not null default 0 check (amount >= 0),
  active       boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table payroll_recurring_items enable row level security;

drop policy if exists "Client reads workspace recurring items" on payroll_recurring_items;
create policy "Client reads workspace recurring items"
  on payroll_recurring_items for select
  using (public.is_client_workspace_member(user_id));

drop policy if exists "Client manages workspace recurring items" on payroll_recurring_items;
create policy "Client manages workspace recurring items"
  on payroll_recurring_items for all
  using (public.is_client_workspace_member(user_id))
  with check (public.is_client_workspace_member(user_id));

drop policy if exists "Admin manages all recurring items" on payroll_recurring_items;
create policy "Admin manages all recurring items"
  on payroll_recurring_items for all
  using (public.is_admin())
  with check (public.is_admin());

drop index if exists idx_recurring_items_user;
create index idx_recurring_items_user on payroll_recurring_items (user_id);
drop index if exists idx_recurring_items_employee;
create index idx_recurring_items_employee on payroll_recurring_items (employee_id, active);
