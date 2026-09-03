-- Employee bank name (for bank transfer files / payslips).
-- Apply manually in the Supabase SQL editor (see AGENTS.md).

alter table employees add column if not exists bank_name text;
