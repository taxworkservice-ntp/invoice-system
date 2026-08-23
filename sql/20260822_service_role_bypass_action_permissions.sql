-- ============================================================
-- Allow service-role requests to bypass document action-permission guards.
--
-- The admin API (e.g. "Clear documents & numbering" on the client admin
-- page) runs with the service-role key, which has no auth.uid(). The
-- enforce_document_action_permission trigger therefore always rejected
-- its deletes ("You do not have permission to delete documents").
--
-- client_workspace_can now returns true when the caller is the service
-- role. Regular user paths are unchanged (RLS + membership checks still
-- apply).
--
-- Run manually in the Supabase SQL editor.
-- ============================================================

create or replace function public.client_workspace_can(
  p_workspace_user_id uuid,
  p_permission text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_role text;
  member_permissions jsonb;
  override_value boolean;
begin
  -- Admin/server-side calls (service role) bypass action guards.
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then
    return true;
  end if;

  if public.client_workspace_role(p_workspace_user_id) = 'owner' then
    return true;
  end if;

  select role::text, permissions
    into member_role, member_permissions
  from public.client_members
  where workspace_user_id = p_workspace_user_id
    and member_user_id = auth.uid()
    and status = 'active';

  if member_role is null then
    return false;
  end if;

  if member_permissions ? p_permission then
    override_value := nullif(member_permissions ->> p_permission, '')::boolean;
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
    else false
  end;
end;
$$;
