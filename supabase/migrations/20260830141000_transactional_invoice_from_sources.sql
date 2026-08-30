-- Transactional invoice creation from source documents (quotations or
-- delivery notes). Replaces the client-side multi-step flow with one atomic,
-- row-locked RPC: remaining quantities are re-validated under lock, so two
-- users can no longer bill the same remaining quantity.
--
-- Includes a SQL port of deductStockOnDocumentSent (src/lib/stock.ts) so the
-- stock movement commits with the invoice instead of after it.

create or replace function public.deduct_stock_for_document(
  p_document_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trigger text;
  v_doc public.documents%rowtype;
  v_line public.document_line_items%rowtype;
  v_item record;
  v_base numeric;
  v_new_stock numeric;
  v_final_stock numeric;
  v_unit_cost numeric;
  v_move_value numeric;
  v_final_value numeric;
  v_requested numeric;
  v_available numeric;
  v_warnings jsonb := '[]'::jsonb;
  v_reason text;
begin
  select coalesce(stock_deduct_trigger, 'invoice')
    into v_trigger
  from public.client_profiles
  where user_id = p_user_id;

  select * into v_doc from public.documents where id = p_document_id;
  if not found then
    return jsonb_build_object('warnings', v_warnings);
  end if;

  if not (
    (coalesce(v_trigger, 'invoice') = 'invoice'
      and v_doc.doc_type in ('invoice', 'tax_invoice_receipt'))
    or (v_trigger = 'delivery_note' and v_doc.doc_type = 'delivery_note')
  ) then
    return jsonb_build_object('warnings', v_warnings);
  end if;

  -- Idempotency guard, matching the TypeScript implementation.
  if exists (
    select 1 from public.stock_movements
    where document_id = p_document_id
      and movement_type = 'auto_out'
  ) then
    return jsonb_build_object('warnings', v_warnings);
  end if;

  for v_line in
    select * from public.document_line_items
    where document_id = p_document_id
  loop
    continue when v_line.item_type <> 'product' or v_line.item_id is null;

    select stock_count, avg_cost, stock_value, carton_unit, qty_per_carton
      into v_item
    from public.items
    where id = v_line.item_id;
    continue when not found;

    v_base := round(coalesce(v_line.base_quantity, v_line.quantity, 0), 3);
    v_new_stock := round(v_item.stock_count - v_base, 3);
    v_final_stock := greatest(0, v_new_stock);
    v_unit_cost := round(coalesce(v_item.avg_cost, 0), 2);
    v_move_value := round(v_base * v_unit_cost, 2);
    v_final_value := case
      when v_final_stock <= 0 then 0
      else greatest(0, round(coalesce(v_item.stock_value, 0) - v_move_value, 2))
    end;

    if v_new_stock < 0 then
      if v_line.carton_unit is not null and v_line.unit = v_line.carton_unit and v_line.qty_carton is not null then
        v_requested := v_line.qty_carton;
        v_available := case
          when coalesce(v_item.qty_per_carton, 0) > 0
            then round(v_item.stock_count / v_item.qty_per_carton, 3)
          else v_item.stock_count
        end;
      else
        v_requested := v_line.quantity;
        v_available := v_item.stock_count;
      end if;
      v_warnings := v_warnings || jsonb_build_object(
        'itemName', v_line.item_name,
        'requested', v_requested,
        'available', v_available,
        'unit', v_line.unit
      );
    end if;

    update public.items
    set stock_count = v_final_stock,
        stock_value = v_final_value,
        avg_cost = case
          when v_final_stock <= 0 or v_final_value <= 0 then 0
          else round(v_final_value / v_final_stock, 2)
        end
    where id = v_line.item_id;

    v_reason := case v_doc.doc_type
      when 'delivery_note' then 'ใบส่งของ'
      when 'tax_invoice_receipt' then 'ใบกำกับภาษี/ใบเสร็จรับเงิน'
      else 'ใบแจ้งหนี้'
    end;

    insert into public.stock_movements (
      item_id, user_id, movement_type, qty_base, qty_carton, carton_unit,
      balance_after, unit_cost, movement_value, balance_value_after,
      reason, document_id
    ) values (
      v_line.item_id, p_user_id, 'auto_out', -v_base,
      case when v_line.qty_carton is not null then -v_line.qty_carton else null end,
      v_line.carton_unit,
      v_final_stock, v_unit_cost, v_move_value, v_final_value,
      'ตัดสต็อกจาก' || v_reason || ' ' || coalesce(v_doc.doc_number, ''),
      p_document_id
    );
  end loop;

  return jsonb_build_object('warnings', v_warnings);
end;
$$;

create or replace function public.create_invoice_from_sources(
  p_user_id uuid,
  p_document jsonb,
  p_lines jsonb,
  p_source_ids uuid[]
)
returns table (deal_id uuid, document_id uuid, warnings jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deal_id uuid;
  v_document_id uuid;
  v_customer_id uuid;
  v_doc_number text;
  v_source_id uuid;
  v_source public.documents%rowtype;
  v_line jsonb;
  v_src_line public.document_line_items%rowtype;
  v_billed numeric;
  v_remaining numeric;
  v_all_covered boolean;
  v_qt_id uuid;
  v_warnings jsonb;
  v_source_deal_ids uuid[];
begin
  if not public.is_client_workspace_member(p_user_id) then
    raise exception 'Not authorized';
  end if;
  if not public.client_workspace_can(p_user_id, 'canSendFinancialDocuments') then
    raise exception 'You do not have permission to issue this document';
  end if;

  if (p_document->>'doc_type') is distinct from 'invoice'
     or coalesce(p_document->>'status', '') <> 'sent' then
    raise exception 'This RPC only creates sent invoices';
  end if;

  if p_source_ids is null or cardinality(p_source_ids) = 0 then
    raise exception 'Select at least one source document';
  end if;

  v_customer_id := nullif(p_document->>'customer_id', '')::uuid;
  if v_customer_id is null or not exists (
    select 1 from public.customers
    where id = v_customer_id and user_id = p_user_id
  ) then
    raise exception 'Customer not found';
  end if;

  -- Lock every source document and validate state.
  foreach v_source_id in array p_source_ids loop
    select * into v_source
    from public.documents
    where id = v_source_id
    for update;

    if not found then
      raise exception 'Source document % not found', v_source_id;
    end if;
    if v_source.user_id <> p_user_id then
      raise exception 'Not authorized';
    end if;
    if v_source.doc_type not in ('quotation', 'delivery_note') then
      raise exception 'Source % must be a quotation or delivery note', v_source_id;
    end if;
    if v_source.status <> 'sent' then
      raise exception 'Source % is no longer available for billing',
        coalesce(v_source.doc_number, v_source_id::text);
    end if;
    if v_source.deal_id is not null
       and not (v_source_deal_ids @> array[v_source.deal_id]) then
      v_source_deal_ids := v_source_deal_ids || array[v_source.deal_id];
    end if;
  end loop;

  if cardinality(v_source_deal_ids) > 1 then
    raise exception 'กรุณาแยกออกบิลตามงานขาย ไม่สามารถรวมเอกสารจากหลายงานขายได้';
  end if;

  -- Resolve the deal: explicit -> the sources' shared deal -> create one.
  v_deal_id := nullif(p_document->>'deal_id', '')::uuid;
  if v_deal_id is null and cardinality(v_source_deal_ids) = 1 then
    v_deal_id := v_source_deal_ids[1];
  end if;
  if v_deal_id is null then
    insert into public.deals (user_id, customer_id, title)
    values (p_user_id, v_customer_id, nullif(trim(coalesce(p_document->>'title', '')), ''))
    returning id into v_deal_id;
  elsif not exists (
    select 1 from public.deals
    where id = v_deal_id and user_id = p_user_id
  ) then
    raise exception 'Deal not found';
  end if;

  -- Re-validate remaining quantities under lock: billed = quantities on
  -- active (non-voided, non-draft) invoice lines referencing each source line.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    continue when nullif(trim(coalesce(v_line->>'source_line_item_id', '')), '') is null;

    v_source_id := (v_line->>'source_document_id')::uuid;
    if v_source_id is null or not (p_source_ids @> array[v_source_id]) then
      raise exception 'Line references a document that is not part of this invoice';
    end if;

    select * into v_src_line
    from public.document_line_items
    where id = (v_line->>'source_line_item_id')::uuid
      and document_id = v_source_id;
    if not found then
      raise exception 'Source line % not found', v_line->>'source_line_item_id';
    end if;

    select coalesce(sum(li.quantity), 0)
      into v_billed
    from public.document_line_items li
    join public.documents d on d.id = li.document_id
    where li.source_document_id = v_source_id
      and li.source_line_item_id = v_src_line.id
      and d.doc_type = 'invoice'
      and d.status not in ('voided', 'draft');

    v_remaining := coalesce(v_src_line.quantity, 0) - v_billed;
    if coalesce((v_line->>'quantity')::numeric, 0) > v_remaining + 0.000000001 then
      raise exception 'จำนวนที่จะออกบิลของ "%" มากกว่ายอดคงเหลือ (%)',
        coalesce(v_line->>'item_name', ''),
        trim_scale(greatest(0, v_remaining));
    end if;
  end loop;

  v_doc_number := nullif(trim(coalesce(p_document->>'doc_number', '')), '');
  if v_doc_number is null then
    v_doc_number := public.generate_doc_number(
      p_user_id,
      'invoice'::public.document_type,
      coalesce(nullif(p_document->>'issue_date', '')::date, current_date)
    );
  end if;

  insert into public.documents (
    user_id, deal_id, customer_id, doc_type, doc_number, status, issue_date,
    vat_registered, vat_rate, wht_rate, discount_percent, discount_amount,
    subtotal, vat_amount, total_amount, wht_amount, net_payable, note,
    show_dn_variance, dn_appendix, converted_from_id
  ) values (
    p_user_id, v_deal_id, v_customer_id, 'invoice', v_doc_number, 'sent',
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
    coalesce((p_document->>'show_dn_variance')::boolean, false),
    coalesce((p_document->>'dn_appendix')::boolean, false),
    nullif(p_document->>'converted_from_id', '')::uuid
  ) returning id into v_document_id;

  insert into public.document_line_items (
    document_id, user_id, item_id, item_name, line_note, item_sku, item_type,
    unit, unit_price, quantity, base_quantity, discount_percent, discount_amount,
    qty_carton, carton_unit, line_total, source_document_id, source_line_item_id,
    source_delivered_qty, source_unit_price, sort_order
  )
  select
    v_document_id, p_user_id,
    nullif(line->>'item_id', '')::uuid,
    coalesce(line->>'item_name', ''),
    nullif(line->>'line_note', ''),
    nullif(line->>'item_sku', ''),
    coalesce(nullif(line->>'item_type', '')::public.item_type, 'product'::public.item_type),
    coalesce(nullif(line->>'unit', ''), 'ชิ้น'),
    coalesce((line->>'unit_price')::numeric, 0),
    coalesce((line->>'quantity')::numeric, 0),
    (line->>'base_quantity')::numeric,
    coalesce((line->>'discount_percent')::numeric, 0),
    coalesce((line->>'discount_amount')::numeric, 0),
    (line->>'qty_carton')::numeric,
    nullif(line->>'carton_unit', ''),
    coalesce((line->>'line_total')::numeric, 0),
    nullif(line->>'source_document_id', '')::uuid,
    nullif(line->>'source_line_item_id', '')::uuid,
    (line->>'source_delivered_qty')::numeric,
    (line->>'source_unit_price')::numeric,
    coalesce((line->>'sort_order')::int, 0)
  from jsonb_array_elements(p_lines) as line;

  -- Link delivery-note sources.
  insert into public.invoice_delivery_notes (
    invoice_id, delivery_note_id, user_id, delivery_note_number, issue_date,
    subtotal, vat_amount, total_amount
  )
  select
    v_document_id, d.id, p_user_id, coalesce(d.doc_number, d.id::text), d.issue_date,
    coalesce(nullif(d.subtotal, 0), (
      select coalesce(sum(li.line_total), 0)
      from public.document_line_items li
      where li.document_id = d.id
    )),
    coalesce(d.vat_amount, 0),
    coalesce(nullif(d.total_amount, 0), coalesce(nullif(d.subtotal, 0), (
      select coalesce(sum(li.line_total), 0)
      from public.document_line_items li
      where li.document_id = d.id
    )))
  from public.documents d
  where d.id = any(p_source_ids)
    and d.doc_type = 'delivery_note';

  -- Flip each source: converted when every line is now fully billed.
  foreach v_source_id in array p_source_ids loop
    select not exists (
      select 1
      from public.document_line_items src
      where src.document_id = v_source_id
        and (
          select coalesce(sum(li.quantity), 0)
          from public.document_line_items li
          join public.documents d on d.id = li.document_id
          where li.source_document_id = v_source_id
            and li.source_line_item_id = src.id
            and d.doc_type = 'invoice'
            and d.status not in ('voided', 'draft')
        ) < coalesce(src.quantity, 0) - 0.000000001
    ) into v_all_covered;

    update public.documents
    set status = case when v_all_covered then 'converted' else 'sent' end,
        deal_id = v_deal_id
    where id = v_source_id
      and user_id = p_user_id;
  end loop;

  -- Cascade: a quotation whose delivery notes are ALL converted is done.
  for v_qt_id in
    select distinct d.converted_from_id
    from public.documents d
    where d.id = any(p_source_ids)
      and d.doc_type = 'delivery_note'
      and d.converted_from_id is not null
  loop
    if exists (
      select 1 from public.documents dn
      where dn.user_id = p_user_id
        and dn.doc_type = 'delivery_note'
        and dn.converted_from_id = v_qt_id
    ) and not exists (
      select 1 from public.documents dn
      where dn.user_id = p_user_id
        and dn.doc_type = 'delivery_note'
        and dn.converted_from_id = v_qt_id
        and dn.status <> 'converted'
    ) then
      update public.documents
      set status = 'converted'
      where id = v_qt_id
        and user_id = p_user_id
        and doc_type = 'quotation';
    end if;
  end loop;

  select (public.deduct_stock_for_document(v_document_id, p_user_id) ->> 'warnings')::jsonb
    into v_warnings;

  return query select v_deal_id, v_document_id, coalesce(v_warnings, '[]'::jsonb);
end;
$$;

revoke execute on function public.deduct_stock_for_document(uuid, uuid) from public;
revoke execute on function public.create_invoice_from_sources(uuid, jsonb, jsonb, uuid[]) from public;
grant execute on function public.deduct_stock_for_document(uuid, uuid) to authenticated;
grant execute on function public.create_invoice_from_sources(uuid, jsonb, jsonb, uuid[]) to authenticated;
