-- Deal workflow guards for documents created from another document.
-- Run after the base document schema and existing permission triggers.

create or replace function public.guard_delivery_note_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_status text;
  source_user_id uuid;
  source_type text;
begin
  if new.doc_type <> 'delivery_note'
     or new.converted_from_id is null
     or new.status = 'voided' then
    return new;
  end if;

  select status::text, user_id, doc_type::text
    into source_status, source_user_id, source_type
  from public.documents
  where id = new.converted_from_id;

  if source_type is distinct from 'quotation'
     or source_user_id is distinct from new.user_id
     or source_status <> 'sent'
     or source_status is null then
    raise exception 'Delivery notes may only be created from a sent quotation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_delivery_note_source on public.documents;
create trigger trg_guard_delivery_note_source
  before insert or update of doc_type, converted_from_id, status on public.documents
  for each row execute function public.guard_delivery_note_source();

create or replace function public.guard_deal_customer_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.customer_id is distinct from old.customer_id
     and exists (
       select 1
       from public.documents
       where deal_id = old.id
         and user_id = old.user_id
         and doc_type = 'quotation'
         and status = 'sent'
     ) then
    raise exception 'The deal customer is locked after a quotation is sent';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_deal_customer_change on public.deals;
create trigger trg_guard_deal_customer_change
  before update of customer_id on public.deals
  for each row execute function public.guard_deal_customer_change();
