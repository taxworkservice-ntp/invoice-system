-- Billing notes keep invoices in their original deals.
--
-- รวมใบแจ้งหนี้ → ใบวางบิล already combines invoices across deals (the
-- picker filters by customer only, every unpaid invoice preselected), but
-- the flip step re-parented every invoice onto the billing note's deal
-- (deal_id = v_deal_id) — silently pulling them out of their original
-- deals, the same problem the DN→INV guard once blocked. Invoice ↔ BN
-- traceability lives in billing_note_invoices, and payment/void/release
-- all resolve through that junction, so re-parenting was never needed.
--
-- New behavior (mirrors create_invoice_from_sources):
--   * Every invoice must belong to the billing note's customer (hardened —
--     the form already filters by customer, now the server enforces it).
--   * Deal resolution: explicit deal_id → the invoices' single shared deal →
--     a NEW deal for the billing run.
--   * Invoices are never re-parented: deal_id = coalesce(d.deal_id, v_deal_id)
--     adopts only deal-less invoices; status flips to 'in_billing' as before.

create or replace function public.create_billing_note_with_links(
  p_user_id uuid,
  p_document jsonb,
  p_invoice_ids uuid[]
)
returns table (deal_id uuid, document_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deal_id uuid;
  v_document_id uuid;
  v_customer_id uuid;
  v_doc_number text;
  v_invoice_id uuid;
  v_invoice public.documents%rowtype;
  -- Initialize to '{}' not NULL: a NULL array makes `x @> array[..]` NULL,
  -- so the append-guard below would never fire and the collection stays empty.
  v_invoice_deal_ids uuid[] := '{}';
begin
  if not public.is_client_workspace_member(p_user_id) then
    raise exception 'Not authorized';
  end if;
  if not public.client_workspace_can(p_user_id, 'canCreateEditDocuments') then
    raise exception 'You do not have permission to create document drafts';
  end if;

  v_customer_id := nullif(p_document->>'customer_id', '')::uuid;
  if v_customer_id is null then
    raise exception 'Customer is required';
  end if;
  if not exists (
    select 1 from public.customers
    where id = v_customer_id and user_id = p_user_id
  ) then
    raise exception 'Customer not found';
  end if;

  if p_invoice_ids is null or cardinality(p_invoice_ids) = 0 then
    raise exception 'Select at least one invoice';
  end if;

  -- Lock and validate every invoice: same workspace and customer, still
  -- sent, and not already held by an active billing note.
  foreach v_invoice_id in array p_invoice_ids loop
    select * into v_invoice
    from public.documents
    where id = v_invoice_id
    for update;

    if not found then
      raise exception 'Invoice % not found', v_invoice_id;
    end if;
    if v_invoice.user_id <> p_user_id then
      raise exception 'Not authorized';
    end if;
    if v_invoice.doc_type <> 'invoice' or v_invoice.status <> 'sent' then
      raise exception 'ใบแจ้งหนี้ % ไม่พร้อมวางบิล (สถานะปัจจุบันไม่ใช่ส่งแล้ว)',
        coalesce(v_invoice.doc_number, v_invoice_id::text);
    end if;
    if v_invoice.customer_id is not null and v_invoice.customer_id <> v_customer_id then
      raise exception 'ใบแจ้งหนี้ % เป็นของลูกค้าอื่น — หนึ่งใบวางบิลต่อหนึ่งลูกค้า',
        coalesce(v_invoice.doc_number, v_invoice_id::text);
    end if;
    if exists (
      select 1 from public.billing_note_invoices bi
      where bi.invoice_id = v_invoice_id
        and bi.released_at is null
    ) then
      raise exception 'ใบแจ้งหนี้ % ถูกผูกกับใบวางบิลที่ยังใช้งานอยู่',
        coalesce(v_invoice.doc_number, v_invoice_id::text);
    end if;
    if v_invoice.deal_id is not null
       and not (v_invoice_deal_ids @> array[v_invoice.deal_id]) then
      v_invoice_deal_ids := v_invoice_deal_ids || array[v_invoice.deal_id];
    end if;
  end loop;

  -- Resolve (or create) the deal the billing note lives on: explicit ->
  -- the invoices' single shared deal -> a new deal for the billing run.
  -- Invoices themselves are not re-parented (see the update below).
  v_deal_id := nullif(p_document->>'deal_id', '')::uuid;
  if v_deal_id is null and cardinality(v_invoice_deal_ids) = 1 then
    v_deal_id := v_invoice_deal_ids[1];
  end if;
  if v_deal_id is null then
    insert into public.deals (user_id, customer_id, title)
    values (p_user_id, v_customer_id, nullif(trim(coalesce(p_document->>'title', '')), ''))
    returning id into v_deal_id;
  else
    if not exists (
      select 1 from public.deals
      where id = v_deal_id and user_id = p_user_id
    ) then
      raise exception 'Deal not found';
    end if;
  end if;

  v_doc_number := nullif(trim(coalesce(p_document->>'doc_number', '')), '');
  if v_doc_number is null then
    v_doc_number := public.generate_doc_number(
      p_user_id,
      'billing_note'::public.document_type,
      coalesce(nullif(p_document->>'issue_date', '')::date, current_date)
    );
  end if;

  insert into public.documents (
    user_id, deal_id, customer_id, doc_type, doc_number, status, issue_date,
    due_date, vat_registered, vat_rate, wht_rate, subtotal, vat_amount,
    total_amount, wht_amount, net_payable, note
  ) values (
    p_user_id, v_deal_id, v_customer_id, 'billing_note', v_doc_number, 'draft',
    coalesce(nullif(p_document->>'issue_date', '')::date, current_date),
    nullif(p_document->>'due_date', '')::date,
    coalesce((p_document->>'vat_registered')::boolean, false),
    coalesce((p_document->>'vat_rate')::numeric, 7),
    coalesce((p_document->>'wht_rate')::numeric, 0),
    coalesce((p_document->>'subtotal')::numeric, 0),
    coalesce((p_document->>'vat_amount')::numeric, 0),
    coalesce((p_document->>'total_amount')::numeric, 0),
    coalesce((p_document->>'wht_amount')::numeric, 0),
    coalesce((p_document->>'net_payable')::numeric, 0),
    nullif(p_document->>'note', '')
  ) returning id into v_document_id;

  insert into public.billing_note_invoices (
    billing_note_id, invoice_id, user_id, invoice_number, issue_date,
    subtotal, vat_amount, total_amount
  )
  select
    v_document_id, d.id, p_user_id, coalesce(d.doc_number, d.id::text), d.issue_date,
    d.subtotal, d.vat_amount, d.total_amount
  from public.documents d
  where d.id = any(p_invoice_ids);

  -- Flip to in_billing without re-parenting: adopt deal-less invoices into
  -- the billing note's deal; invoices keep their original deal otherwise.
  update public.documents as d
  set status = 'in_billing',
      deal_id = coalesce(d.deal_id, v_deal_id)
  where d.id = any(p_invoice_ids)
    and d.user_id = p_user_id
    and d.status = 'sent';

  return query select v_deal_id, v_document_id;
end;
$$;
