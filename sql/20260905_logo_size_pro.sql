-- Pro logo sizing: default + backfill legacy 'full' value.
-- Apply manually in Supabase SQL editor (per project convention for sql/).
alter table client_profiles
  alter column logo_size set default 'square';

update client_profiles
  set logo_size = 'rectangle'
  where logo_size = 'full';

-- Allowed presets (see LOGO_SIZE_OPTIONS in src/constants/index.ts).
alter table client_profiles
  drop constraint if exists client_profiles_logo_size_check;

alter table client_profiles
  add constraint client_profiles_logo_size_check
  check (logo_size in ('small', 'square', 'medium', 'rectangle', 'large'));
