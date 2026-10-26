-- Avatar display default OFF (forced for all workspaces).
--
-- 1. New workspaces default to hidden avatars.
-- 2. Existing workspaces are forced off (per decision 2026-10-26).
--
-- Apply manually in the Supabase SQL editor (see AGENTS.md).

alter table client_profiles
  alter column show_customer_avatars set default false;

update client_profiles
  set show_customer_avatars = false
  where show_customer_avatars is distinct from false;
