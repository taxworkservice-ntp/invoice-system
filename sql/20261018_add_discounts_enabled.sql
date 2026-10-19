-- Discount switch per client workspace.
--
-- Owner-controlled (Settings › Documents). Display-only: turning it off hides
-- the discount inputs in document forms; existing discounts and printed
-- documents are untouched. NULL historical rows read as enabled.
--
-- Apply manually (Supabase SQL editor or Management API).

alter table public.client_profiles
  add column if not exists discounts_enabled boolean not null default true;
