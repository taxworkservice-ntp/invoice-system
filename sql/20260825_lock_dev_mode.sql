-- ============================================================
-- Lock dev mode behind admin-only paths (2026-08-25)
--
-- Closes two holes:
-- 1) toggle_dev_mode() was SECURITY DEFINER with no internal
--    permission check, and EXECUTE was implicitly granted to
--    PUBLIC (Postgres default) — any authenticated user could
--    enable dev mode for any account.
-- 2) The "Owner manages workspace profile" UPDATE policy let a
--    workspace owner change dev_mode_enabled /
--    dev_effective_date on their own client_profiles row
--    directly, bypassing the admin panel.
--
-- Dev mode unlocks destructive surfaces in the UI (delete whole
-- deal cascade, doc-number editing, backdating), so both paths
-- must be admin-only.
-- ============================================================

-- 1) Harden the RPC: verify caller is an admin inside the function.
create or replace function public.toggle_dev_mode(p_user_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'toggle_dev_mode: admin only' using errcode = '42501';
  end if;
  update public.client_profiles
     set dev_mode_enabled = p_enabled
   where user_id = p_user_id;
end;
$$;

revoke execute on function public.toggle_dev_mode(uuid, boolean) from public;
revoke execute on function public.toggle_dev_mode(uuid, boolean) from anon;
grant execute on function public.toggle_dev_mode(uuid, boolean) to authenticated;

-- 2) Block non-admin updates of the dev columns through the table.
--    Other client_profile fields stay owner-editable. Service-role
--    connections (server APIs) pass through unchanged.
create or replace function public.guard_dev_mode_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if (new.dev_mode_enabled is distinct from old.dev_mode_enabled)
     or (new.dev_effective_date is distinct from old.dev_effective_date) then
    if not coalesce(public.is_admin(), false) then
      raise exception 'dev mode columns are admin-managed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_dev_mode_columns on public.client_profiles;
create trigger trg_guard_dev_mode_columns
  before update on public.client_profiles
  for each row execute function public.guard_dev_mode_columns();
