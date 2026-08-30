-- Draft delivery notes may be prepared from draft or sent quotations.
-- Converted and voided quotations remain invalid sources.

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
     or source_status not in ('draft', 'sent')
     or source_status is null then
    raise exception 'Delivery notes may only be created from an active quotation';
  end if;

  return new;
end;
$$;
