-- Enable RLS and add policies for payroll_audit_log
-- This also triggers a schema cache refresh

alter table if exists payroll_audit_log enable row level security;

drop policy if exists "Service role full access" on payroll_audit_log;
create policy "Service role full access"
  on payroll_audit_log
  for all
  using (true)
  with check (true);
