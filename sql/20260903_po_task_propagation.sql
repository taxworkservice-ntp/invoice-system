-- PO/job reference propagation (self-contained): carry documents
-- .customer_po_number / .task_name through billing notes and credit/debit
-- notes, so a reference typed once (on the quotation/invoice) follows the
-- money chain and prints in the classic V2 info band on every document.
--
-- 1) create_billing_note_with_links: accept the two fields in the documents
--    INSERT whitelist (the client sends them; the whitelist silently dropped
--    them). BillingNoteForm prefills them from the selected invoices.
-- 2) save_adjustment_note: accept them on INSERT and persist on draft UPDATE
--    (CreditNoteForm prefills from the referenced invoice).
--
-- Both function bodies are copied verbatim from the LIVE definitions
-- (pg_get_functiondef, captured before this change) — only the documents
-- INSERT/UPDATE whitelists gained the two columns. Check the live definition
-- again before replaying this file on a workspace that has drifted.

create or replace function public.create_billing_note_with_links(p_user_id uuid, p_document jsonb, p_invoice_ids uuid[])
 returns table(deal_id uuid, document_id uuid)
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
    total_amount, wht_amount, net_payable, note,
    customer_po_number, task_name
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
    nullif(p_document->>'note', ''),
    nullif(p_document->>'customer_po_number', ''),
    nullif(p_document->>'task_name', '')
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
$function$;

revoke execute on function public.create_billing_note_with_links(uuid, jsonb, uuid[]) from public;
grant execute on function public.create_billing_note_with_links(uuid, jsonb, uuid[]) to authenticated;

create or replace function public.save_adjustment_note(p_user_id uuid, p_document jsonb, p_lines jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_doc_type text;
  v_status text;
  v_target_id uuid;
  v_customer_id uuid;
  v_doc_number text;
  v_ref_id uuid;
  v_invoice_total numeric;
  v_existing_credits numeric;
  v_remaining numeric;
  v_new_total numeric;
  v_line jsonb;
  v_idx int := 0;
begin
  if not public.is_client_workspace_member(p_user_id) then
    raise exception 'Not authorized';
  end if;

  v_doc_type := p_document->>'doc_type';
  if v_doc_type not in ('credit_note', 'debit_note') then
    raise exception 'This RPC only saves credit or debit notes';
  end if;

  v_status := coalesce(nullif(p_document->>'status', ''), 'draft');
  if v_status not in ('draft', 'issued') then
    raise exception 'Invalid adjustment note status';
  end if;

  v_target_id := nullif(p_document->>'id', '')::uuid;

  if v_status = 'draft' then
    if not public.client_workspace_can(p_user_id, 'canCreateEditDocuments') then
      raise exception 'You do not have permission to create document drafts';
    end if;
  else
    if not public.client_workspace_can(p_user_id, public.document_type_permission(v_doc_type)) then
      raise exception 'You do not have permission to issue this document';
    end if;
  end if;

  v_ref_id := nullif(p_document->>'converted_from_id', '')::uuid;

  if v_target_id is null then
    v_customer_id := nullif(p_document->>'customer_id', '')::uuid;
    if v_customer_id is null or not exists (
      select 1 from public.customers
      where id = v_customer_id and user_id = p_user_id
    ) then
      raise exception 'Customer not found';
    end if;
  else
    -- Draft edit: the target must be this workspace's own draft note.
    if not exists (
      select 1 from public.documents
      where id = v_target_id
        and user_id = p_user_id
        and doc_type = v_doc_type::public.document_type
        and status = 'draft'
    ) then
      raise exception 'Can only edit draft adjustment notes';
    end if;
  end if;

  -- Over-credit guard, enforced server-side under a row lock on the invoice:
  -- cumulative active credits against the source must not exceed its total.
  if v_doc_type = 'credit_note' and v_ref_id is not null then
    select coalesce(total_amount, 0)
      into v_invoice_total
    from public.documents
    where id = v_ref_id
      and user_id = p_user_id
      and doc_type in ('invoice', 'tax_invoice_receipt')
    for update;

    if found then
      select coalesce(sum(d.total_amount), 0)
        into v_existing_credits
      from public.documents d
      where d.user_id = p_user_id
        and d.doc_type = 'credit_note'
        and d.converted_from_id = v_ref_id
        and d.status <> 'voided'
        and d.id <> coalesce(v_target_id, '00000000-0000-0000-0000-000000000000'::uuid);

      v_new_total := coalesce((p_document->>'total_amount')::numeric, 0);
      v_remaining := v_invoice_total - v_existing_credits;
      if v_invoice_total > 0 and v_new_total > v_remaining + 0.01 then
        raise exception 'ยอดใบลดหนี้รวมเกินกว่าที่จะลดได้ — วงเงินคงเหลือที่ลดได้ ฿%',
          to_char(greatest(0, v_remaining), 'FM999,999,999,990.00');
      end if;
    end if;
  end if;

  if v_target_id is null then
    v_doc_number := nullif(trim(coalesce(p_document->>'doc_number', '')), '');
    if v_doc_number is null then
      v_doc_number := public.generate_doc_number(
        p_user_id,
        v_doc_type::public.document_type,
        coalesce(nullif(p_document->>'issue_date', '')::date, current_date)
      );
    end if;

    insert into public.documents (
      user_id, deal_id, customer_id, doc_type, doc_number, status, issue_date,
      vat_registered, vat_rate, wht_rate, discount_percent, discount_amount,
      subtotal, vat_amount, total_amount, wht_amount, net_payable, note,
      customer_po_number, task_name,
      converted_from_id
    ) values (
      p_user_id,
      nullif(p_document->>'deal_id', '')::uuid,
      v_customer_id,
      v_doc_type::public.document_type,
      v_doc_number,
      v_status::public.document_status,
      coalesce(nullif(p_document->>'issue_date', '')::date, current_date),
      coalesce((p_document->>'vat_registered')::boolean, false),
      coalesce((p_document->>'vat_rate')::numeric, 7),
      coalesce((p_document->>'wht_rate')::numeric, 0),
      coalesce((p_document->>'discount_percent')::numeric, 0),
      coalesce((p_document->>'discount_amount')::numeric, 0),
      coalesce((p_document->>'subtotal')::numeric, 0),
      coalesce((p_document->>'vat_amount')::numeric, 0),
      coalesce((p_document->>'total_amount')::numeric, 0),
      coalesce((p_document->>'wht_amount')::numeric, 0),
      coalesce((p_document->>'net_payable')::numeric, 0),
      nullif(p_document->>'note', ''),
      nullif(p_document->>'customer_po_number', ''),
      nullif(p_document->>'task_name', ''),
      v_ref_id
    )
    returning id into v_target_id;
  else
    update public.documents
    set status = v_status::public.document_status,
        issue_date = coalesce(nullif(p_document->>'issue_date', '')::date, issue_date),
        vat_registered = coalesce((p_document->>'vat_registered')::boolean, vat_registered),
        vat_rate = coalesce((p_document->>'vat_rate')::numeric, vat_rate),
        wht_rate = coalesce((p_document->>'wht_rate')::numeric, wht_rate),
        discount_percent = coalesce((p_document->>'discount_percent')::numeric, discount_percent),
        discount_amount = coalesce((p_document->>'discount_amount')::numeric, discount_amount),
        subtotal = coalesce((p_document->>'subtotal')::numeric, subtotal),
        vat_amount = coalesce((p_document->>'vat_amount')::numeric, vat_amount),
        total_amount = coalesce((p_document->>'total_amount')::numeric, total_amount),
        wht_amount = coalesce((p_document->>'wht_amount')::numeric, wht_amount),
        net_payable = coalesce((p_document->>'net_payable')::numeric, net_payable),
        note = nullif(p_document->>'note', ''),
        customer_po_number = nullif(p_document->>'customer_po_number', ''),
        task_name = nullif(p_document->>'task_name', ''),
        converted_from_id = coalesce(v_ref_id, converted_from_id)
    where id = v_target_id
      and user_id = p_user_id;

    delete from public.document_line_items where document_id = v_target_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into public.document_line_items (
      document_id, user_id, item_id, item_name, line_note, item_sku, item_type,
      unit, unit_price, quantity, base_quantity, discount_percent, discount_amount,
      qty_carton, carton_unit, line_total, sort_order
    ) values (
      v_target_id, p_user_id,
      nullif(v_line->>'item_id', '')::uuid,
      coalesce(v_line->>'item_name', ''),
      nullif(v_line->>'line_note', ''),
      nullif(v_line->>'item_sku', ''),
      coalesce(nullif(v_line->>'item_type', '')::public.item_type, 'product'::public.item_type),
      coalesce(nullif(v_line->>'unit', ''), 'ชิ้น'),
      coalesce((v_line->>'unit_price')::numeric, 0),
      coalesce((v_line->>'quantity')::numeric, 0),
      coalesce((v_line->>'quantity')::numeric, 0),
      coalesce((v_line->>'discount_percent')::numeric, 0),
      coalesce((v_line->>'discount_amount')::numeric, 0),
      null,
      null,
      coalesce((v_line->>'line_total')::numeric, 0),
      v_idx
    );
    v_idx := v_idx + 1;
  end loop;

  -- Issuing a credit note returns credited products to stock, atomically.
  if v_status = 'issued' and v_doc_type = 'credit_note' then
    perform public.return_stock_for_credit_note(v_target_id, p_user_id);
  end if;

  return v_target_id;
end;
$function$;

revoke execute on function public.save_adjustment_note(uuid, jsonb, jsonb) from public;
grant execute on function public.save_adjustment_note(uuid, jsonb, jsonb) to authenticated;
