-- Single-round-trip deal-detail fetch for the deal page (/deals/:id).
--
-- The page previously needed ~10 sequential REST round-trips
-- (deal → profile/customer/docs/activities → line-items/billing-links →
-- delivery-note links → source docs → source lines/deals). This function
-- performs the same fetch server-side and returns one JSON payload.
--
-- Apply manually in the Supabase SQL editor (migrations in sql/ are not
-- auto-applied). The frontend calls it via supabase.rpc("get_deal_detail")
-- and falls back to the multi-query path when the function is absent, so
-- deploying the app before applying this migration is safe.
--
-- Security: SECURITY DEFINER with an explicit workspace-membership check,
-- mirroring the convert_quotation_to_invoice pattern. RLS is bypassed
-- inside the function, so the check below is load-bearing — every row
-- returned is scoped to the deal's workspace user.

create or replace function public.get_deal_detail(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_result jsonb;
begin
  select d.user_id into v_user_id
  from public.deals d
  where d.id = p_deal_id;

  if v_user_id is null then
    return jsonb_build_object('deal', null);
  end if;

  if not public.is_client_workspace_member(v_user_id) then
    raise exception 'Not authorized';
  end if;

  with own_invoices as (
    select doc.id
    from public.documents doc
    where doc.deal_id = p_deal_id
      and doc.doc_type = 'invoice'
  ),
  line_sources as (
    select distinct li.source_document_id as source_id
    from public.document_line_items li
    where li.document_id in (select id from own_invoices)
      and li.source_document_id is not null
  ),
  dn_sources as (
    select distinct j.delivery_note_id as source_id
    from public.invoice_delivery_notes j
    where j.invoice_id in (select id from own_invoices)
      and j.released_at is null
      and j.delivery_note_id is not null
  ),
  borrowed_ids as (
    select source_id as id from line_sources
    union
    select source_id as id from dn_sources
  ),
  borrowed_docs as (
    select doc.*
    from public.documents doc
    where doc.id in (select id from borrowed_ids)
      and doc.user_id = v_user_id
      and doc.deal_id is not null
      and doc.deal_id <> p_deal_id
      and doc.status <> 'voided'
  )
  select jsonb_build_object(
    'deal', (
      select jsonb_build_object(
        'id', d.id,
        'user_id', d.user_id,
        'customer_id', d.customer_id,
        'title', d.title,
        'deal_number', d.deal_number,
        'manual_stage', d.manual_stage,
        'is_active', d.is_active,
        'created_at', d.created_at,
        'updated_at', d.updated_at
      )
      from public.deals d
      where d.id = p_deal_id
    ),
    'customer', (
      select jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'phone', c.phone,
        'tax_id', c.tax_id,
        'address', c.address
      )
      from public.customers c
      where c.id = (select d.customer_id from public.deals d where d.id = p_deal_id)
    ),
    'client', (
      select jsonb_build_object(
        'user_id', p.user_id,
        'dev_mode_enabled', p.dev_mode_enabled,
        'dev_effective_date', p.dev_effective_date
      )
      from public.client_profiles p
      where p.user_id = v_user_id
    ),
    'documents', (
      select coalesce(jsonb_agg(to_jsonb(doc) order by doc.created_at), '[]'::jsonb)
      from public.documents doc
      where doc.deal_id = p_deal_id
    ),
    'line_items', (
      select coalesce(jsonb_agg(to_jsonb(li) order by li.sort_order), '[]'::jsonb)
      from public.document_line_items li
      where li.document_id in (select doc.id from public.documents doc where doc.deal_id = p_deal_id)
    ),
    'billing_invoices', (
      select coalesce(jsonb_agg(to_jsonb(bi)), '[]'::jsonb)
      from public.billing_note_invoices bi
      where bi.billing_note_id in (
        select doc.id from public.documents doc
        where doc.deal_id = p_deal_id and doc.doc_type = 'billing_note'
      )
    ),
    'activities', (
      select coalesce(jsonb_agg(a order by a.created_at desc), '[]'::jsonb)
      from (
        select
          act.id, act.document_id, act.actor_name, act.actor_role,
          act.event_type, act.description, act.metadata, act.created_at
        from public.deal_activities act
        where act.deal_id = p_deal_id
        order by act.created_at desc
      ) a
    ),
    'borrowed_documents', (
      select coalesce(jsonb_agg(b order by b.created_at), '[]'::jsonb)
      from (
        select
          doc.id, doc.user_id, doc.deal_id, doc.doc_type, doc.doc_number,
          doc.status, doc.vat_registered, doc.total_amount, doc.net_payable,
          doc.issue_date, doc.due_date, doc.created_at, doc.updated_at
        from borrowed_docs doc
      ) b
    ),
    'borrowed_line_items', (
      select coalesce(jsonb_agg(l order by l.sort_order), '[]'::jsonb)
      from (
        select
          li.id, li.document_id, li.item_name, li.quantity, li.unit,
          li.unit_price, li.line_total, li.source_document_id,
          li.source_line_item_id, li.sort_order
        from public.document_line_items li
        where li.document_id in (select doc.id from borrowed_docs doc)
      ) l
    ),
    'borrowed_deal_numbers', (
      select coalesce(jsonb_object_agg(d.id::text, d.deal_number), '{}'::jsonb)
      from public.deals d
      where d.id in (select distinct doc.deal_id from borrowed_docs doc)
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.get_deal_detail(uuid) from public;
revoke execute on function public.get_deal_detail(uuid) from anon;
grant execute on function public.get_deal_detail(uuid) to authenticated;
