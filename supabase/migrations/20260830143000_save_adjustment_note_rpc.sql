-- Transactional credit/debit note save (create or draft-edit).
-- Replaces the client-side multi-step flow (document upsert -> line rewrite ->
-- stock return) with one atomic RPC, and enforces the over-credit guard on the
-- server so concurrent credit notes cannot exceed the source invoice total.
--
-- Includes a SQL port of returnStockOnCreditNoteIssued (src/lib/stock.ts).

create or replace function public.return_stock_for_credit_note(
  p_document_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc record;
  v_line public.document_line_items%rowtype;
  v_item record;
  v_base numeric;
  v_new_stock numeric;
  v_unit_cost numeric;
  v_move_value numeric;
  v_new_value numeric;
begin
  select doc_number into v_doc from public.documents where id = p_document_id;
  if not found then
    return;
  end if;

  -- Idempotency guard, matching the TypeScript implementation.
  if exists (
    select 1 from public.stock_movements
    where document_id = p_document_id
      and movement_type = 'return_in'
  ) then
    return;
  end if;

  for v_line in
    select * from public.document_line_items
    where document_id = p_document_id
  loop
    continue when v_line.item_type <> 'product' or v_line.item_id is null;

    select stock_count, avg_cost, stock_value into v_item
    from public.items where id = v_line.item_id;
    continue when not found;

    v_base := round(coalesce(v_line.base_quantity, v_line.quantity, 0), 3);
    continue when v_base <= 0;

    v_new_stock := round(v_item.stock_count + v_base, 3);
    v_unit_cost := round(coalesce(v_item.avg_cost, 0), 2);
    v_move_value := round(v_base * v_unit_cost, 2);
    v_new_value := round(coalesce(v_item.stock_value, 0) + v_move_value, 2);

    update public.items
    set stock_count = v_new_stock,
        stock_value = v_new_value,
        avg_cost = case
          when v_new_stock <= 0 or v_new_value <= 0 then 0
          else round(v_new_value / v_new_stock, 2)
        end
    where id = v_line.item_id;

    insert into public.stock_movements (
      item_id, user_id, movement_type, qty_base, qty_carton, carton_unit,
      balance_after, unit_cost, movement_value, balance_value_after,
      reason, document_id
    ) values (
      v_line.item_id, p_user_id, 'return_in', v_base, null, v_line.carton_unit,
      v_new_stock, v_unit_cost, v_move_value, v_new_value,
      trim('รับคืนสินค้าจากใบลดหนี้ ' || coalesce(v_doc.doc_number, '')),
      p_document_id
    );
  end loop;
end;
$$;

create or replace function public.save_adjustment_note(
  p_user_id uuid,
  p_document jsonb,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
    select * into v_invoice_total
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
      v_remaining := coalesce(v_invoice_total, 0) - v_existing_credits;
      if coalesce(v_invoice_total, 0) > 0 and v_new_total > v_remaining + 0.01 then
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
$$;

revoke execute on function public.return_stock_for_credit_note(uuid, uuid) from public;
revoke execute on function public.save_adjustment_note(uuid, jsonb, jsonb) from public;
grant execute on function public.return_stock_for_credit_note(uuid, uuid) to authenticated;
grant execute on function public.save_adjustment_note(uuid, jsonb, jsonb) to authenticated;
