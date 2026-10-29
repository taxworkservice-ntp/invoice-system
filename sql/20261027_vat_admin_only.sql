-- ============================================================
-- VAT status and rate are managed by the platform administrator.
--
-- `vat_registered` and `vat_rate` decide whether every new document is a tax
-- invoice and how much VAT it charges, so a workspace owner must not be able
-- to flip them by accident (or outside the platform's control). The Manage tab
-- of /admin/clients/:id is the only editor; the client's /settings/tax page is
-- read-only for these two fields.
--
-- A permissive "Owner manages workspace profile" RLS policy already lets the
-- owner update the whole row, so RLS cannot carve out single columns. The guard
-- trigger below does it, exactly like year_era (sql/20261018_add_year_era.sql).
--
-- Existing documents are untouched: documents carry their own vat_registered /
-- vat_rate snapshot taken when they were created, and this migration performs
-- no backfill.
--
-- Apply manually (Supabase SQL editor or Management API).
-- ============================================================

create or replace function public.guard_admin_only_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Platform administrator sessions are allowed. A request with no
  -- authenticated user is server-side (service role, SQL editor, seed
  -- scripts): those already bypass RLS and must keep working, while anonymous
  -- callers can never reach this trigger because the owner policy filters them
  -- out first.
  v_privileged boolean := public.is_admin() or auth.uid() is null;
begin
  if new.year_era is distinct from old.year_era and not v_privileged then
    raise exception 'year_era is managed by the platform administrator'
      using errcode = '42501';
  end if;

  if new.vat_registered is distinct from old.vat_registered and not v_privileged then
    raise exception 'VAT status is managed by the platform administrator'
      using errcode = '42501';
  end if;

  if new.vat_rate is distinct from old.vat_rate and not v_privileged then
    raise exception 'VAT rate is managed by the platform administrator'
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
