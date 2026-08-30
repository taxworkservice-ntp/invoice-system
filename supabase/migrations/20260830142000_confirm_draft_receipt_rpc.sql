-- Transactional draft-receipt confirmation.
-- Replaces the client-side multi-step confirm (source update -> linked
-- invoice sync -> receipt_invoices links -> receipt flip) with one atomic,
-- row-locked RPC. Concurrent confirmations and double-clicks can no longer
-- double-count a payment.

create or replace function public.confirm_draft_receipt(
  p_receipt_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.documents%rowtype;
  v_source public.documents%rowtype;
  v_invoice_ids uuid[];
  v_source_ids uuid[];
  v_receipt_ids uuid[];
  v_r record;
  v_prev_pre_tax numeric := 0;
  v_prev_received numeric := 0;
  v_remaining numeric;
  v_receipt_pre_tax numeric;
  v_new_total numeric;
  v_is_fully_paid boolean;
  v_paid_at timestamptz;
  v_new_status public.document_status;
  v_invoice_sources record;
  v_total_invoice_amounts numeric;
  v_allocated numeric;
  v_allocated_sum numeric;
  v_idx int;
  v_count int;
begin
  if not public.is_client_workspace_member(p_user_id) then
    raise exception 'Not authorized';
  end if;
  if not public.client_workspace_can(p_user_id, 'canRecordPayments') then
    raise exception 'You do not have permission to record payments';
  end if;

  select * into v_receipt
  from public.documents
  where id = p_receipt_id
  for update;

  if not found then
    raise exception 'ไม่พบใบเสร็จ';
  end if;
  if v_receipt.user_id <> p_user_id then
    raise exception 'Not authorized';
  end if;
  if v_receipt.doc_type <> 'receipt' then
    raise exception 'เอกสารนี้ไม่ใช่ใบเสร็จ';
  end if;
  if v_receipt.status <> 'draft' then
    raise exception 'ใบเสร็จนี้ถูกยืนยันไปแล้ว';
  end if;

  if v_receipt.converted_from_id is null then
    raise exception 'ใบเสร็จนี้ไม่มีเอกสารอ้างอิง';
  end if;

  select * into v_source
  from public.documents
  where id = v_receipt.converted_from_id
  for update;

  if not found then
    raise exception 'ไม่พบเอกสารอ้างอิงของใบเสร็จ';
  end if;

  -- Previous confirmed totals (drafts are promises, not money).
  v_source_ids := array[v_source.id];
  if v_source.doc_type = 'billing_note' then
    select coalesce(array_agg(bi.invoice_id), '{}'::uuid[])
      into v_invoice_ids
    from public.billing_note_invoices bi
    where bi.billing_note_id = v_source.id
      and bi.user_id = p_user_id
      and bi.invoice_id is not null;
  elsif v_source.doc_type in ('invoice', 'tax_invoice_receipt') then
    v_invoice_ids := array[v_source.id];
  else
    v_invoice_ids := '{}'::uuid[];
  end if;

  v_receipt_ids := '{}'::uuid[];
  for v_r in
    select id from public.documents
    where user_id = p_user_id
      and converted_from_id = any(v_source_ids)
      and doc_type = 'receipt'
      and status not in ('voided', 'draft')
  loop
    v_receipt_ids := v_receipt_ids || array[v_r.id];
  end loop;

  if cardinality(v_invoice_ids) > 0 then
    for v_r in
      select distinct ri.receipt_id
      from public.receipt_invoices ri
      where ri.user_id = p_user_id
        and ri.invoice_id = any(v_invoice_ids)
        and ri.receipt_id is not null
    loop
      v_receipt_ids := v_receipt_ids || array[v_r.receipt_id];
    end loop;
  end if;

  if cardinality(v_receipt_ids) > 0 then
    select
      coalesce(sum(d.subtotal), 0),
      coalesce(sum(d.amount_received), 0)
      into v_prev_pre_tax, v_prev_received
    from public.documents d
    where d.user_id = p_user_id
      and d.id = any(v_receipt_ids)
      and d.doc_type = 'receipt'
      and d.status not in ('voided', 'draft');
  end if;

  v_remaining := greatest(0, coalesce(v_source.subtotal, 0) - v_prev_pre_tax);
  v_receipt_pre_tax := coalesce(v_receipt.subtotal, 0);
  if v_receipt_pre_tax > v_remaining + 0.01 then
    raise exception 'ยอดในใบเสร็จเกินยอดค้างชำระ ฿%',
      to_char(v_remaining, 'FM999,999,999,990.00');
  end if;

  v_new_total := v_prev_pre_tax + v_receipt_pre_tax;
  v_is_fully_paid := v_new_total >= (coalesce(v_source.subtotal, 0) - 0.01);
  v_new_status := case when v_is_fully_paid then 'paid' else 'partially_paid' end::public.document_status;
  v_paid_at := coalesce(v_receipt.paid_at, now());

  -- 1. Source document accumulates the confirmed payment.
  update public.documents
  set status = v_new_status,
      paid_at = v_paid_at,
      payment_method = v_receipt.payment_method,
      bank_account_id = v_receipt.bank_account_id,
      amount_received = v_prev_received + coalesce(v_receipt.net_payable, 0),
      wht_certificate_no = v_receipt.wht_certificate_no
  where id = v_source.id;

  -- 2. Billing-note case: sync its linked invoices.
  if v_source.doc_type = 'billing_note' and cardinality(v_invoice_ids) > 0 then
    update public.documents
    set status = case when v_is_fully_paid then 'paid' else 'in_billing' end::public.document_status,
        paid_at = v_paid_at
    where id = any(v_invoice_ids)
      and user_id = p_user_id;
  end if;

  -- 3. Receipt-invoice links (created here, not at draft time), with the same
  --    proportional allocation as buildReceiptInvoiceRecords.
  if not exists (
    select 1 from public.receipt_invoices where receipt_id = p_receipt_id
  ) then
    if v_source.doc_type = 'billing_note' then
      select coalesce(count(*), 0) into v_count from public.documents
      where user_id = p_user_id
        and id = any(v_invoice_ids)
        and doc_type in ('invoice', 'tax_invoice_receipt');
    elsif v_source.doc_type in ('invoice', 'tax_invoice_receipt') then
      v_count := 1;
    else
      v_count := 0;
    end if;

    if v_count > 0 and v_source.doc_type = 'billing_note' then
      select coalesce(sum(coalesce(d.net_payable, d.total_amount, 0)), 0)
        into v_total_invoice_amounts
      from public.documents d
      where d.user_id = p_user_id
        and d.id = any(v_invoice_ids)
        and d.doc_type in ('invoice', 'tax_invoice_receipt');

      v_allocated_sum := 0;
      v_idx := 0;
      for v_invoice_sources in
        select d.id, d.doc_number, d.issue_date, d.subtotal, d.vat_amount,
               d.total_amount, coalesce(d.net_payable, d.total_amount, 0) as invoice_total
        from public.documents d
        where d.user_id = p_user_id
          and d.id = any(v_invoice_ids)
          and d.doc_type in ('invoice', 'tax_invoice_receipt')
        order by d.issue_date asc
      loop
        v_idx := v_idx + 1;
        if v_idx = v_count then
          v_allocated := coalesce(v_receipt.net_payable, 0) - v_allocated_sum;
        else
          v_allocated := case
            when v_total_invoice_amounts > 0
              then round(coalesce(v_receipt.net_payable, 0) * v_invoice_sources.invoice_total / v_total_invoice_amounts, 2)
            else round(coalesce(v_receipt.net_payable, 0) / v_count, 2)
          end;
          v_allocated_sum := v_allocated_sum + v_allocated;
        end if;

        insert into public.receipt_invoices (
          receipt_id, invoice_id, source_billing_note_id, user_id,
          invoice_number, issue_date, subtotal, vat_amount, total_amount, paid_amount
        ) values (
          p_receipt_id, v_invoice_sources.id, v_source.id, p_user_id,
          coalesce(v_invoice_sources.doc_number, left(v_invoice_sources.id::text, 8)),
          v_invoice_sources.issue_date,
          coalesce(v_invoice_sources.subtotal, 0),
          coalesce(v_invoice_sources.vat_amount, 0),
          coalesce(v_invoice_sources.total_amount, 0),
          greatest(0, v_allocated)
        );
      end loop;
    elsif v_count > 0 and v_source.doc_type in ('invoice', 'tax_invoice_receipt') then
      insert into public.receipt_invoices (
        receipt_id, invoice_id, source_billing_note_id, user_id,
        invoice_number, issue_date, subtotal, vat_amount, total_amount, paid_amount
      ) values (
        p_receipt_id, v_source.id, null, p_user_id,
        coalesce(v_source.doc_number, left(v_source.id::text, 8)),
        v_source.issue_date,
        coalesce(v_source.subtotal, 0),
        coalesce(v_source.vat_amount, 0),
        coalesce(v_source.total_amount, 0),
        greatest(0, coalesce(v_receipt.net_payable, 0))
      );
    end if;
  end if;

  -- 4. Confirm the receipt itself.
  update public.documents
  set status = 'generated'
  where id = p_receipt_id;
end;
$$;

revoke execute on function public.confirm_draft_receipt(uuid, uuid) from public;
grant execute on function public.confirm_draft_receipt(uuid, uuid) to authenticated;
