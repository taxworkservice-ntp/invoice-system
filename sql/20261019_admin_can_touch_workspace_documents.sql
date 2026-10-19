-- ============================================================
-- Let platform admins act on a workspace's documents.
--
-- The admin panel's per-client controls edit `client_profiles` (the year-era
-- selector, the dev-mode toggle). That write cascades:
--
--   update client_profiles
--     → trg_touch_documents_on_profile_change
--       → update documents set render_updated_at = now() where user_id = …
--         → trg_enforce_document_action_permission
--           → client_workspace_can(workspace, 'canCreateEditDocuments')
--
-- client_workspace_can() bypassed the guards for the service role (auth.uid()
-- is null) and for the workspace owner, but a platform admin signing in with
-- their own JWT is neither — so the document trigger raised "You do not have
-- permission to edit document drafts" and PostgREST answered HTTP 400. Any
-- workspace holding at least one document was affected (one with none matched
-- no rows and quietly succeeded).
--
-- The function now also returns true for a platform admin. This grants nothing
-- new in practice — an admin already has full power over every workspace
-- through the service-role API — it only stops the admin's own session from
-- being treated as a stranger. Membership checks for everyone else are
-- unchanged.
--
-- Apply manually (Supabase SQL editor or Management API).
-- ============================================================

CREATE OR REPLACE FUNCTION public.client_workspace_can(p_workspace_user_id uuid, p_permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  member_role text;
  member_permissions jsonb;
  custom_permissions jsonb;
  effective_permissions jsonb;
  override_value boolean;
begin
  -- Server-side calls (service role / no user JWT context) bypass action guards.
  -- Preserved from 20260822_service_role_bypass_action_permissions.sql:
  -- the admin API runs with the service-role key, which has no auth.uid().
  -- Unauthenticated callers can never reach triggers because RLS rejects
  -- their queries first.
  if auth.uid() is null then
    return true;
  end if;

  -- Platform admins manage any workspace: their own JWT acts with the same
  -- authority the service-role admin API already has. Without this, an admin
  -- writing to client_profiles cascades through touch_documents_on_profile_change
  -- into a documents render-version bump, which enforce_document_action_permission
  -- refuses for a caller who is neither the owner nor a member ("You do not have
  -- permission to edit document drafts") — PostgREST reports that as HTTP 400.
  -- Workspaces with no documents never matched a row there, which is why the
  -- failure looked intermittent.
  if public.is_admin() then
    return true;
  end if;

  if public.client_workspace_role(p_workspace_user_id) = 'owner' then
    return true;
  end if;

  select m.role::text, m.permissions, r.permissions
    into member_role, member_permissions, custom_permissions
  from public.client_members m
  left join public.client_roles r
    on r.id = m.custom_role_id
   and r.workspace_user_id = m.workspace_user_id
  where m.workspace_user_id = p_workspace_user_id
    and m.member_user_id = auth.uid()
    and m.status = 'active';

  if member_role is null then
    return false;
  end if;

  -- Custom-role permissions are the base; per-member overrides win.
  effective_permissions :=
    coalesce(custom_permissions, '{}'::jsonb) || coalesce(member_permissions, '{}'::jsonb);

  if effective_permissions ? p_permission then
    override_value := nullif(effective_permissions ->> p_permission, '')::boolean;
    return coalesce(override_value, false);
  end if;

  return case p_permission
    when 'canCreateEditDocuments' then member_role in ('manager', 'officer')
    when 'canSendDocuments' then member_role = 'manager'
    when 'canSendQuotations' then member_role = 'manager'
    when 'canSendDeliveryNotes' then member_role = 'manager'
    when 'canSendFinancialDocuments' then member_role = 'manager'
    when 'canRecordPayments' then member_role = 'manager'
    when 'canVoidDocuments' then member_role = 'manager'
    when 'canDeleteDocuments' then false
    when 'canManagePayroll' then member_role = 'manager'
    when 'canManageWht' then member_role = 'manager'
    else false
  end;
end;
$function$
