-- MIGRATION: classic PDF footer terms
-- Adds customizable terms text for the Thai Classic print template.

alter table public.client_profiles
  add column if not exists classic_terms text;

notify pgrst, 'reload schema';
