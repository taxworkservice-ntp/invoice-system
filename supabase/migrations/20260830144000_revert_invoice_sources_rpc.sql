-- Restore every source document when an invoice is voided.
-- An invoice built from multiple quotations/DNs only stores the FIRST source
-- in converted_from_id, so voiding previously left the other sources stuck in
-- 'converted'. This RPC recomputes the billed quantities from ACTIVE invoice
-- lines and restores each source that is no longer fully billed.

-- Amended guard: delivery-note -> converted status flips may happen while the
-- source quotation is already 'converted' (e.g. the quote was fully billed
-- directly, and its partial delivery note is billed afterwards). INSERT is
-- still restricted to draft/sent quotations; UPDATE only checks identity.

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
     or new.converted_from_id is null then
    return new;
  end if;

  select status::text, user_id, doc_type::text
    into source_status, source_user_id, source_type
  from public.documents
  where id = new.converted_from_id;

  if source_type is distinct from 'quotation'
     or source_user_id is distinct from new.user_id then
    raise exception 'Delivery notes may only reference a quotation from the same workspace';
  end if;

  if (tg_op = 'INSERT' or new.converted_from_id is distinct from old.converted_from_id)
     and source_status not in ('draft', 'sent') then
    raise exception 'Delivery notes may only be created from an active quotation';
  end if;

  return new;
end;
$$;

create or replace function public.revert_invoice_sources(
  p_invoice_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.documents%rowtype;
  v_source_ids uuid[];
  v_qt_ids uuid[];
  v_sid uuid;
  v_qt_id uuid;
begin
  select * into v_invoice
  from public.documents
  where id = p_invoice_id
  for update;

  if not found then
    return;
  end if;
  if v_invoice.user_id <> p_user_id or v_invoice.doc_type <> 'invoice' then
    raise exception 'Not authorized';
  end if;

  -- Collect every source: line-item tracing, delivery-note links, and the
  -- legacy single converted_from_id pointer.
  v_source_ids := '{}'::uuid[];
  for v_sid in
    select distinct li.source_document_id
    from public.document_line_items li
    where li.document_id = p_invoice_id
      and li.source_document_id is not null
    union
    select distinct idn.delivery_note_id
    from public.invoice_delivery_notes idn
    where idn.invoice_id = p_invoice_id
      and idn.delivery_note_id is not null
    union
    select v_invoice.converted_from_id
    where v_invoice.converted_from_id is not null
  loop
    if exists (
      select 1 from public.documents d
      where d.id = v_sid
        and d.user_id = p_user_id
        and d.doc_type in ('quotation', 'delivery_note')
    ) and not (v_source_ids @> array[v_sid]) then
      v_source_ids := v_source_ids || array[v_sid];
    end if;
  end loop;

  if cardinality(v_source_ids) = 0 then
    return;
  end if;

  -- Release this invoice's delivery-note links.
  update public.invoice_delivery_notes
  set released_at = now()
  where invoice_id = p_invoice_id
    and released_at is null;

  -- Delivery notes revert to 'sent' when no active invoice link remains.
  for v_sid in
    select unnest(v_source_ids) as id
  loop
    if not exists (
      select 1 from public.documents d
      where d.id = v_sid
        and d.doc_type = 'delivery_note'
    ) then
      continue;
    end if;

    if not exists (
      select 1 from public.invoice_delivery_notes idn
      where idn.delivery_note_id = v_sid
        and idn.released_at is null
    ) then
      update public.documents
      set status = 'sent'
      where id = v_sid
        and user_id = p_user_id
        and doc_type = 'delivery_note'
        and status = 'converted';
    end if;
  end loop;

  -- Quotations are restored only when no longer fully billed by ACTIVE
  -- invoices (other partial invoices may legitimately keep them consumed).
  v_qt_ids := '{}'::uuid[];
  for v_qt_id in
    select distinct d.converted_from_id
    from public.documents d
    where d.id = any(v_source_ids)
      and d.doc_type = 'delivery_note'
      and d.converted_from_id is not null
  loop
    if not (v_qt_ids @> array[v_qt_id]) then
      v_qt_ids := v_qt_ids || array[v_qt_id];
    end if;
  end loop;
  for v_sid in
    select unnest(v_source_ids) as id
  loop
    if exists (
      select 1 from public.documents d
      where d.id = v_sid and d.doc_type = 'quotation'
    ) and not (v_qt_ids @> array[v_sid]) then
      v_qt_ids := v_qt_ids || array[v_sid];
    end if;
  end loop;

  foreach v_qt_id in array v_qt_ids loop
    if exists (
      select 1
      from public.document_line_items src
      where src.document_id = v_qt_id
        and (
          select coalesce(sum(li.quantity), 0)
          from public.document_line_items li
          join public.documents d on d.id = li.document_id
          where li.source_document_id = v_qt_id
            and li.source_line_item_id = src.id
            and d.doc_type = 'invoice'
            and d.status not in ('voided', 'draft')
        ) < coalesce(src.quantity, 0) - 0.000000001
    ) then
      update public.documents
      set status = 'sent'
      where id = v_qt_id
        and user_id = p_user_id
        and doc_type = 'quotation'
        and status = 'converted';
    end if;
  end loop;
end;
$$;

revoke execute on function public.revert_invoice_sources(uuid, uuid) from public;
grant execute on function public.revert_invoice_sources(uuid, uuid) to authenticated;
