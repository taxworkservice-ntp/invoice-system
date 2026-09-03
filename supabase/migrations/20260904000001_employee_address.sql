-- Employee address (needed for WHT vendors/certificates synced from payroll).
-- Apply manually in the Supabase SQL editor (see AGENTS.md).

alter table employees add column if not exists address text;
