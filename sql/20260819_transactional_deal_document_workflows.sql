-- Atomic quotation conversion and initial deal/document creation.
-- Run after the base schema, document numbering, client membership, and
-- action-permission functions.

-- Voided invoices may be replaced; every other invoice remains the active one.
create unique index if not exists uq_documents_active_invoice_per_quotation
  on public.documents (user_id, converted_from_id)
  where doc_type = 'invoice'
    and converted_from_id is not null
    and status <> 'voided';

create or replace function public.convert_quotation_to_invoice(
  p_user_id uuid,
  p_quotation_id uuid,
  p_doc_number text default null,
  p_issue_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.documents%rowtype;
  v_invoice_id uuid;
  v_issue_date date;
  v_doc_number text;
begin
  if not public.is_client_workspace_member(p_user_id) then
    raise exception 'Not authorized';
  end if;
  if not public.client_workspace_can(p_user_id, 'canSendQuotations')
     or not public.client_workspace_can(p_user_id, 'canSendFinancialDocuments') then
    raise exception 'You do not have permission to convert quotations';
  end if;

  select * into v_quote
  from public.documents
  where id = p_quotation_id
    and user_id = p_user_id
    and doc_type = 'quotation'
  for update;

  if not found then
    raise exception 'Quotation not found';
  end if;
  if v_quote.status <> 'sent' then
    raise exception 'Only sent quotations can be converted';
  end if;

  v_issue_date := coalesce(p_issue_date, v_quote.issue_date, current_date);
  v_doc_number := nullif(trim(p_doc_number), '');
  if v_doc_number is null then
    v_doc_number := public.generate_doc_number(p_user_id, 'invoice'::public.document_type, v_issue_date);
  end if;

  insert into public.documents (
    user_id, deal_id, customer_id, doc_type, doc_number, status, issue_date,
    due_date, vat_registered, vat_rate, wht_rate, discount_percent,
    discount_amount, subtotal, vat_amount, total_amount, wht_amount,
    net_payable, note, converted_from_id
  ) values (
    p_user_id, v_quote.deal_id, v_quote.customer_id, 'invoice', v_doc_number, 'sent', v_issue_date,
    v_quote.due_date, v_quote.vat_registered, v_quote.vat_rate, v_quote.wht_rate,
    v_quote.discount_percent, v_quote.discount_amount, v_quote.subtotal,
    v_quote.vat_amount, v_quote.total_amount, v_quote.wht_amount,
    v_quote.net_payable, v_quote.note, v_quote.id
  ) returning id into v_invoice_id;

  insert into public.document_line_items (
    document_id, user_id, item_id, item_name, line_note, item_sku, item_type,
    unit, unit_price, quantity, base_quantity, discount_percent, discount_amount,
    qty_carton, carton_unit, source_document_id, source_line_item_id,
    line_total, sort_order
  )
  select
    v_invoice_id, p_user_id, item_id, item_name, line_note, item_sku, item_type,
    unit, unit_price, quantity, base_quantity, discount_percent, discount_amount,
    qty_carton, carton_unit, coalesce(source_document_id, v_quote.id),
    coalesce(source_line_item_id, id), line_total, sort_order
  from public.document_line_items
  where document_id = v_quote.id
    and user_id = p_user_id
  order by sort_order;

  update public.documents
  set status = 'converted'
  where id = v_quote.id;

  return v_invoice_id;
end;
$$;

create or replace function public.create_deal_document(
  p_user_id uuid,
  p_customer_id uuid,
  p_document jsonb,
  p_line_items jsonb default '[]'::jsonb,
  p_title text default null
)
returns table (deal_id uuid, document_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deal_id uuid;
  v_document_id uuid;
  v_doc_type public.document_type;
  v_issue_date date;
  v_doc_number text;
begin
  if not public.is_client_workspace_member(p_user_id) then
    raise exception 'Not authorized';
  end if;
  if not exists (
    select 1 from public.customers
    where id = p_customer_id and user_id = p_user_id
  ) then
    raise exception 'Customer not found';
  end if;

  v_doc_type := (p_document->>'doc_type')::public.document_type;
  if v_doc_type not in ('quotation', 'invoice', 'tax_invoice_receipt', 'delivery_note') then
    raise exception 'Unsupported initial document type';
  end if;
  if coalesce(p_document->>'status', 'draft') = 'draft'
     and not public.client_workspace_can(p_user_id, 'canCreateEditDocuments') then
    raise exception 'You do not have permission to create document drafts';
  end if;
  if coalesce(p_document->>'status', 'draft') <> 'draft'
     and not public.client_workspace_can(p_user_id, public.document_type_permission(v_doc_type::text)) then
    raise exception 'You do not have permission to issue this document';
  end if;
  v_issue_date := coalesce(nullif(p_document->>'issue_date', '')::date, current_date);
  v_doc_number := nullif(trim(p_document->>'doc_number'), '');
  if v_doc_number is null then
    v_doc_number := public.generate_doc_number(p_user_id, v_doc_type, v_issue_date);
  end if;

  insert into public.deals (user_id, customer_id, title)
  values (p_user_id, p_customer_id, nullif(trim(p_title), ''))
  returning id into v_deal_id;

  insert into public.documents (
    user_id, deal_id, customer_id, doc_type, doc_number, status, issue_date,
    vat_registered, vat_rate, wht_rate, discount_percent, discount_amount,
    subtotal, vat_amount, total_amount, wht_amount, net_payable,
    payment_method, paid_at, amount_received, note, hide_amounts_on_print,
    is_blank_form, show_full_totals
  ) values (
    p_user_id, v_deal_id, p_customer_id, v_doc_type, v_doc_number,
    coalesce(nullif(p_document->>'status', ''), 'draft')::public.document_status,
    v_issue_date,
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
    nullif(p_document->>'payment_method', '')::public.payment_method,
    nullif(p_document->>'paid_at', '')::timestamptz,
    (p_document->>'amount_received')::numeric,
    nullif(p_document->>'note', ''),
    coalesce((p_document->>'hide_amounts_on_print')::boolean, true),
    coalesce((p_document->>'is_blank_form')::boolean, false),
    coalesce((p_document->>'show_full_totals')::boolean, false)
  ) returning id into v_document_id;

  insert into public.document_line_items (
    document_id, user_id, item_id, item_name, line_note, item_sku, item_type,
    unit, unit_price, quantity, base_quantity, discount_percent, discount_amount,
    qty_carton, carton_unit, line_total, sort_order
  )
  select
    v_document_id, p_user_id, nullif(line->>'item_id', '')::uuid,
    line->>'item_name', nullif(line->>'line_note', ''), nullif(line->>'item_sku', ''),
    coalesce(nullif(line->>'item_type', '')::public.item_type, 'service'::public.item_type),
    coalesce(nullif(line->>'unit', ''), 'ชิ้น'),
    (line->>'unit_price')::numeric, (line->>'quantity')::numeric,
    (line->>'base_quantity')::numeric, coalesce((line->>'discount_percent')::numeric, 0),
    coalesce((line->>'discount_amount')::numeric, 0), (line->>'qty_carton')::numeric,
    nullif(line->>'carton_unit', ''), (line->>'line_total')::numeric,
    coalesce((line->>'sort_order')::int, 0)
  from jsonb_array_elements(p_line_items) as line;

  return query select v_deal_id, v_document_id;
end;
$$;

revoke execute on function public.convert_quotation_to_invoice(uuid, uuid, text, date) from public;
revoke execute on function public.create_deal_document(uuid, uuid, jsonb, jsonb, text) from public;
grant execute on function public.convert_quotation_to_invoice(uuid, uuid, text, date) to authenticated;
grant execute on function public.create_deal_document(uuid, uuid, jsonb, jsonb, text) to authenticated;
