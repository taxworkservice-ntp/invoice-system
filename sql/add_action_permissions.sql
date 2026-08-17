-- Action-based workspace permissions for small-business staff workflows.

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

create or replace function public.document_type_permission(p_doc_type text)
returns text
language sql
immutable
as $$
  select case
    when p_doc_type = 'quotation' then 'canSendQuotations'
    when p_doc_type = 'delivery_note' then 'canSendDeliveryNotes'
    when p_doc_type in ('receipt', 'tax_invoice_receipt') then 'canRecordPayments'
    else 'canSendFinancialDocuments'
  end;
$$;

create or replace function public.enforce_document_action_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_user_id uuid := coalesce(new.user_id, old.user_id);
  required_permission text;
begin
  if tg_op = 'DELETE' then
    if not public.client_workspace_can(workspace_user_id, 'canDeleteDocuments') then
      raise exception 'You do not have permission to delete documents';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'draft' and not public.client_workspace_can(workspace_user_id, 'canCreateEditDocuments') then
      raise exception 'You do not have permission to create document drafts';
    end if;
    if new.status <> 'draft' then
      required_permission := public.document_type_permission(new.doc_type::text);
      if not public.client_workspace_can(workspace_user_id, required_permission) then
        raise exception 'You do not have permission to issue this document';
      end if;
    end if;
    return new;
  end if;

  if old.status = 'draft' and new.status = 'draft' then
    if not public.client_workspace_can(workspace_user_id, 'canCreateEditDocuments') then
      raise exception 'You do not have permission to edit document drafts';
    end if;
  elsif new.status = 'voided' and old.status <> 'voided' then
    if not public.client_workspace_can(workspace_user_id, 'canVoidDocuments') then
      raise exception 'You do not have permission to void documents';
    end if;
  elsif new.status in ('paid', 'partially_paid', 'generated') and old.status not in ('paid', 'partially_paid', 'generated') then
    if not public.client_workspace_can(workspace_user_id, 'canRecordPayments') then
      raise exception 'You do not have permission to record payments';
    end if;
  elsif new.status <> old.status then
    required_permission := public.document_type_permission(new.doc_type::text);
    if not public.client_workspace_can(workspace_user_id, required_permission) then
      raise exception 'You do not have permission to change this document status';
    end if;
  elsif old.status <> 'draft' and not public.client_workspace_can(workspace_user_id, public.document_type_permission(old.doc_type::text)) then
    raise exception 'You do not have permission to edit issued documents';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_document_action_permission on public.documents;
create trigger trg_enforce_document_action_permission
  before insert or update or delete on public.documents
  for each row execute function public.enforce_document_action_permission();

create or replace function public.enforce_line_item_draft_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  document_user_id uuid;
  document_status text;
begin
  select user_id, status::text
    into document_user_id, document_status
  from public.documents
  where id = coalesce(new.document_id, old.document_id);

  if document_status <> 'draft' or not public.client_workspace_can(document_user_id, 'canCreateEditDocuments') then
    raise exception 'Only permitted users can edit draft line items';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_line_item_draft_permission on public.document_line_items;
create trigger trg_enforce_line_item_draft_permission
  before insert or update or delete on public.document_line_items
  for each row execute function public.enforce_line_item_draft_permission();
