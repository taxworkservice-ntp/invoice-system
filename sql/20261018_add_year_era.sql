-- Year system per client: ค.ศ. (ce, "2026") or พ.ศ. (be, "2569").
--
-- Admin-only: the platform operator sets it per client (provisioning or the
-- client's Manage tab). A workspace owner must NOT be able to change it, even
-- though they can update their own client_profiles row — hence the guard
-- trigger, which is the only way to keep one column out of a permissive policy.
--
-- Default 'ce': documents created from now on print 2026. Documents already
-- issued are unaffected (no backfill of any kind).
--
-- Note: document *numbers* keep the CE year (INV-2026-…). Changing the numbered
-- year mid-calendar-year would split one year's sequence across two prefixes.
--
-- Apply manually (Supabase SQL editor or Management API).

alter table public.client_profiles
  add column if not exists year_era text not null default 'ce';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'client_profiles_year_era_check'
  ) then
    alter table public.client_profiles
      add constraint client_profiles_year_era_check check (year_era in ('ce', 'be'));
  end if;
end $$;

create or replace function public.guard_admin_only_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.year_era is distinct from old.year_era and not public.is_admin() then
    raise exception 'year_era is managed by the platform administrator'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_client_profiles_admin_only_fields on public.client_profiles;
create trigger trg_client_profiles_admin_only_fields
  before update on public.client_profiles
  for each row
  execute function public.guard_admin_only_profile_fields();
