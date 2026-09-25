-- Protect finalized payroll history from employee deletes.
--
-- payroll_line_items.employee_id was ON DELETE CASCADE: deleting one
-- employee silently deleted all their line items across every run, and the
-- totals trigger then rewrote closed runs with no revision bump. RESTRICT
-- forces the app to offboard (status) instead of deleting staff with
-- history. Recurring templates keep CASCADE (future drafts, not history);
-- wht_records keeps SET NULL (tax rows must survive).
--
-- Apply manually (Supabase SQL editor or Management API) per AGENTS.md.

alter table public.payroll_line_items
  drop constraint if exists payroll_line_items_employee_id_fkey;

alter table public.payroll_line_items
  add constraint payroll_line_items_employee_id_fkey
  foreign key (employee_id) references public.employees(id) on delete restrict;
