-- ============================================================
-- MIGRATION: Multiple bank accounts
-- Adds:
--   bank_accounts            — managed company bank accounts
--   documents.bank_account_id — destination account recorded on receipts / paid docs
-- Backfills bank_accounts from legacy client_profiles.bank_name/bank_account.
-- The primary account stays synced to the legacy columns for backward compat.
-- ============================================================

create table if not exists bank_accounts (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid not null references profiles(id) on delete cascade,

  bank_name            text not null,
  account_number       text not null,
  account_holder_name  text,

  is_primary           boolean not null default false,
  is_active            boolean not null default true,
  sort_order           integer not null default 0,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table bank_accounts enable row level security;

create policy "Client manages workspace bank accounts"
  on bank_accounts for all
  using (public.is_client_workspace_member(user_id))
  with check (public.is_client_workspace_member(user_id));

create policy "Admin reads all bank accounts"
  on bank_accounts for select
  using (public.is_admin());

create trigger trg_bank_accounts_updated_at
  before update on bank_accounts
  for each row execute function handle_updated_at();

create index idx_bank_accounts_user on bank_accounts(user_id);

-- At most one primary account per workspace
create unique index uq_bank_accounts_primary
  on bank_accounts(user_id)
  where is_primary;

-- Backfill legacy single bank into bank_accounts as the primary account
insert into bank_accounts (user_id, bank_name, account_number, is_primary)
select
  cp.user_id,
  cp.bank_name,
  cp.bank_account,
  true
from client_profiles cp
where cp.bank_name is not null and cp.bank_account is not null
  and not exists (
    select 1 from bank_accounts ba where ba.user_id = cp.user_id
  )
on conflict do nothing;

-- Destination bank account recorded on receipts / paid documents
alter table documents
  add column if not exists bank_account_id uuid references bank_accounts(id) on delete set null;

-- Extend create_deal_document RPC to persist bank_account_id for paid docs
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
    payment_method, bank_account_id, paid_at, amount_received, note, hide_amounts_on_print
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
    coalesce((p_document->>'hide_amounts_on_print')::boolean, true)
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

revoke execute on function public.create_deal_document(uuid, uuid, jsonb, jsonb, text) from public;
grant execute on function public.create_deal_document(uuid, uuid, jsonb, jsonb, text) to authenticated;