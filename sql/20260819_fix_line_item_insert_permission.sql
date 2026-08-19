-- The line-item draft trigger blocked inserting line items into newly created
-- non-draft documents (issued tax-invoice receipts, converted/sent invoices),
-- which broke create_deal_document, convert_quotation_to_invoice, the deal-page
-- conversion, and invoice-from-delivery-notes even for the owner.
--
-- Fix: line-item INSERTs are allowed (the parent document insert already
-- enforces the required permission); editing line items of a non-draft
-- document now requires the matching financial-document permission.

create or replace function public.enforce_line_item_draft_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  document_user_id uuid;
  document_status text;
  document_type text;
begin
  select user_id, status::text, doc_type::text
    into document_user_id, document_status, document_type
  from public.documents
  where id = coalesce(new.document_id, old.document_id);

  if document_status = 'draft' then
    if not public.client_workspace_can(document_user_id, 'canCreateEditDocuments') then
      raise exception 'Only permitted users can edit draft line items';
    end if;
  elsif tg_op <> 'INSERT'
     and not public.client_workspace_can(document_user_id, public.document_type_permission(document_type)) then
    raise exception 'You do not have permission to edit line items of this document';
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