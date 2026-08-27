-- Store aggregate totals on payroll_runs for fast history display and reporting.
alter table payroll_runs add column if not exists total_gross numeric(14,2) not null default 0;
alter table payroll_runs add column if not exists total_net numeric(14,2) not null default 0;
alter table payroll_runs add column if not exists employee_count integer not null default 0;

-- Recalculate totals whenever line items change.
create or replace function recalc_payroll_run_totals()
returns trigger
language plpgsql
security definer
as $$
declare
  run_id_val uuid;
  g numeric(14,2);
  n numeric(14,2);
  c integer;
begin
  if tg_op = 'DELETE' then
    run_id_val := old.payroll_run_id;
  else
    run_id_val := new.payroll_run_id;
  end if;

  select coalesce(sum(gross_pay), 0), coalesce(sum(net_pay), 0), count(*)
    into g, n, c
    from payroll_line_items
    where payroll_run_id = run_id_val;

  update payroll_runs
    set total_gross = g, total_net = n, employee_count = c
    where id = run_id_val;

  return coalesce(new, old);
end;
$$;

drop trigger if exists payroll_line_items_recalc_trigger on payroll_line_items;
create trigger payroll_line_items_recalc_trigger
after insert or update or delete on payroll_line_items
for each row execute function recalc_payroll_run_totals();
