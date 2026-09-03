-- Fix create_deal_document: the 20260902_quotation_line_images.sql re-create
-- mistakenly put image_url in the DOCUMENTS insert whitelist — the column
-- only exists on document_line_items, so EVERY call failed with
-- 'column "image_url" of relation "documents" does not exist'.
-- This re-create removes image_url from the documents INSERT and keeps it in
-- the line-items INSERT (per-line example photos on quotations). Also keeps
-- print_font_scale / customer_po_number / task_name from the earlier versions,
-- and coalesces the optional line numerics (base_quantity, discount_amount)
-- so payloads that omit them no longer violate the NOT NULL constraints.

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
    payment_method, bank_account_id, paid_at, amount_received, note, hide_amounts_on_print,
    is_blank_form, show_full_totals, print_font_scale,
    customer_po_number, task_name
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
    nullif(p_document->>'bank_account_id', '')::uuid,
    nullif(p_document->>'paid_at', '')::timestamptz,
    (p_document->>'amount_received')::numeric,
    nullif(p_document->>'note', ''),
    coalesce((p_document->>'hide_amounts_on_print')::boolean, true),
    coalesce((p_document->>'is_blank_form')::boolean, false),
    coalesce((p_document->>'show_full_totals')::boolean, false),
    nullif(p_document->>'print_font_scale', ''),
    nullif(p_document->>'customer_po_number', ''),
    nullif(p_document->>'task_name', '')
  ) returning id into v_document_id;

  insert into public.document_line_items (
    document_id, user_id, item_id, item_name, line_note, item_sku, item_type,
    unit, unit_price, quantity, base_quantity, discount_percent, discount_amount,
    qty_carton, carton_unit, line_total, image_url, sort_order
  )
  select
    v_document_id, p_user_id, nullif(line->>'item_id', '')::uuid,
    line->>'item_name', nullif(line->>'line_note', ''), nullif(line->>'item_sku', ''),
    coalesce(nullif(line->>'item_type', '')::public.item_type, 'service'::public.item_type),
    coalesce(nullif(line->>'unit', ''), 'ชิ้น'),
    (line->>'unit_price')::numeric, (line->>'quantity')::numeric,
    coalesce((line->>'base_quantity')::numeric, (line->>'quantity')::numeric),
    coalesce((line->>'discount_percent')::numeric, 0),
    coalesce((line->>'discount_amount')::numeric, 0),
    (line->>'qty_carton')::numeric,
    nullif(line->>'carton_unit', ''), (line->>'line_total')::numeric,
    nullif(line->>'image_url', ''),
    coalesce((line->>'sort_order')::int, 0)
  from jsonb_array_elements(p_line_items) as line;

  return query select v_deal_id, v_document_id;
end;
$$;

revoke execute on function public.create_deal_document(uuid, uuid, jsonb, jsonb, text) from public;
grant execute on function public.create_deal_document(uuid, uuid, jsonb, jsonb, text) to authenticated;
