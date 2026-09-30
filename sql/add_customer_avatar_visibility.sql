-- Customer avatar visibility controls.
--
-- Tenant-level toggle (client_profiles.show_customer_avatars, default ON):
--   lets a business hide customer avatars across all lists.
-- Per-customer flag (customers.avatar_hidden, default OFF):
--   hides one customer's avatar; the UI renders a blank placeholder box so
--   list rows stay aligned.
--
-- Apply manually in the Supabase SQL editor (see AGENTS.md). The app treats a
-- missing column as "show" so pages keep working before this is applied.

alter table customers
  add column if not exists avatar_hidden boolean not null default false;

alter table client_profiles
  add column if not exists show_customer_avatars boolean not null default true;
