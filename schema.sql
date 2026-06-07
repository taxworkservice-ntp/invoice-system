-- ============================================================
-- Invoice System — Supabase PostgreSQL Schema
-- Stack: React + Supabase + Vercel
-- Currency: Thai Baht (฿) only
-- Auth: Supabase Auth (auth.users)
-- ============================================================


-- ============================================================
-- EXTENSIONS
-- ============================================================

create extension if not exists "uuid-ossp";


-- ============================================================
-- ENUMS
-- ============================================================

create type user_role as enum ('admin', 'client');

create type document_type as enum (
  'quotation',
  'invoice',
  'tax_invoice_receipt',
  'billing_note',
  'receipt',
  'delivery_note',
  'credit_note'
);

create type document_status as enum (
  'draft',
  'sent',
  'converted',   -- quotation converted to invoice
  'in_billing',  -- invoice bundled inside a billing note
  'paid',
  'overdue',
  'voided',
  'generated',   -- receipt only
  'issued'       -- credit note issued
);

create type item_type as enum ('product', 'service');

create type stock_movement_type as enum (
  'manual_in',
  'manual_out',
  'auto_out',    -- invoice/delivery_note confirmed
  'auto_in',     -- invoice/delivery_note voided (restore)
  'return_in'    -- user confirms stock return after void
);

create type payment_method as enum ('cash', 'bank_transfer', 'cheque');

create type wht_rate as enum ('0', '1', '2', '3', '5');


-- ============================================================
-- PROFILES
-- Links Supabase auth.users to app roles and client data
-- ============================================================

create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  role            user_role not null default 'client',
  created_at      timestamptz not null default now()
);

-- Admin can read all profiles
-- Clients can only read their own
alter table profiles enable row level security;

create policy "Admin reads all profiles"
  on profiles for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Client reads own profile"
  on profiles for select
  using (auth.uid() = id);


-- ============================================================
-- CLIENT PROFILES
-- Company info, tax settings, logo — one per client
-- ============================================================

create table client_profiles (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null unique references profiles(id) on delete cascade,

  -- Company info
  company_name_th       text not null,
  company_name_en       text,
  tax_id                char(13),            -- เลขผู้เสียภาษี
  address               text,
  phone                 text,
  contact_name          text,                -- ชื่อผู้ติดต่อ / ชื่อเจ้าของ
  logo_url              text,                -- Supabase Storage path

  -- Tax defaults (pre-fill on every new document)
  vat_registered        boolean not null default false,
  vat_rate              numeric(5,2) not null default 7.00,  -- editable, default 7%
  default_wht_rate      wht_rate not null default '0',

  -- Stock workflow setting
  stock_deduct_trigger  text not null default 'invoice'
                        check (stock_deduct_trigger in ('invoice', 'delivery_note')),

  -- PDF template preference
  pdf_template          text not null default 'classic'
                         check (pdf_template in ('classic', 'modern', 'bold', 'perforated')),

  -- Bank info for perforated template
  bank_name             text,
  bank_account          text,

  -- Signature & stamp images (R2 storage paths)
  signature_url         text,
  stamp_url             text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table client_profiles enable row level security;

create policy "Client manages own profile"
  on client_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Admin reads all client profiles"
  on client_profiles for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );


-- ============================================================
-- DOCUMENT NUMBER SEQUENCES
-- One row per client per document type — configurable prefix
-- ============================================================

create table doc_number_sequences (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references profiles(id) on delete cascade,
  doc_type        document_type not null,
  prefix          text not null,             -- e.g. 'INV', 'QT', 'BN'
  reset_yearly    boolean not null default true,
  last_year       int,                       -- year of last issued number
  last_month      int,                       -- month of last issued number
  last_sequence   int not null default 0,    -- last sequence number used
  unique (user_id, doc_type)
);

alter table doc_number_sequences enable row level security;

create policy "Client manages own sequences"
  on doc_number_sequences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ============================================================
-- CUSTOMERS
-- The client's own customers — stored per client
-- ============================================================

create table customers (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references profiles(id) on delete cascade,

  name            text not null,
  tax_id          text,
  address         text,
  contact_name    text,
  phone           text,
  email           text,
  note            text,

  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table customers enable row level security;

create policy "Client manages own customers"
  on customers for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ============================================================
-- ITEMS (CATALOG)
-- Products and services per client
-- ============================================================

create table items (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references profiles(id) on delete cascade,

  name                text not null,
  sku                 text,
  item_type           item_type not null default 'product',
  unit_price          numeric(15,2) not null default 0,

  -- Units
  base_unit           text not null default 'ชิ้น',   -- e.g. ream, piece, hour
  carton_unit         text,                            -- e.g. carton, box (null = no conversion)
  qty_per_carton      numeric(10,3),                   -- base units per carton unit

  -- Stock (products only)
  stock_count         numeric(15,3) not null default 0,
  low_stock_threshold numeric(15,3) not null default 5,

  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table items enable row level security;

create policy "Client manages own items"
  on items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create unique index idx_items_user_sku_unique
  on items (user_id, lower(sku))
  where sku is not null;


-- ============================================================
-- STOCK MOVEMENTS
-- Full log of every stock change per item
-- ============================================================

create table stock_movements (
  id              uuid primary key default uuid_generate_v4(),
  item_id         uuid not null references items(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,

  movement_type   stock_movement_type not null,

  -- Quantity in base unit (always)
  qty_base        numeric(15,3) not null,

  -- Optional: original entry in carton unit (for stock-in via carton)
  qty_carton      numeric(15,3),
  carton_unit     text,

  balance_after   numeric(15,3) not null,    -- stock count after this movement
  reason          text,                       -- manual note or auto reference
  document_id     uuid,                       -- reference to invoice if auto movement

  created_at      timestamptz not null default now()
);

alter table stock_movements enable row level security;

create policy "Client manages own stock movements"
  on stock_movements for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ============================================================
-- DEALS
-- Parent container for a full transaction lifecycle
-- ============================================================

create table deals (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references profiles(id) on delete cascade,
  customer_id     uuid not null references customers(id),

  title           text,                  -- optional short label (auto-generated from items if blank)
  is_active       boolean not null default true,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table deals enable row level security;

create policy "Client manages own deals"
  on deals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ============================================================
-- DOCUMENTS
-- Every document type — one table, differentiated by doc_type
-- ============================================================

create table documents (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references profiles(id) on delete cascade,
  deal_id             uuid references deals(id) on delete set null,
  customer_id         uuid not null references customers(id),

  doc_type            document_type not null,
  doc_number          text,                        -- assigned on save, e.g. INV-2025-001
  status              document_status not null default 'draft',

  issue_date          date not null default current_date,
  due_date            date,                        -- billing note due date

  -- Tax settings (snapshot at time of save — do not recalculate later)
  vat_registered      boolean not null default false,
  vat_rate            numeric(5,2) not null default 7.00,
  wht_rate            numeric(5,2) not null default 0,
  discount_percent    numeric(5,2) not null default 0,
  discount_amount     numeric(15,2) not null default 0,

  -- Calculated amounts (stored at save time — never recomputed)
  subtotal            numeric(15,2) not null default 0,
  vat_amount          numeric(15,2) not null default 0,
  total_amount        numeric(15,2) not null default 0,  -- subtotal + vat
  wht_amount          numeric(15,2) not null default 0,
  net_payable         numeric(15,2) not null default 0,  -- total - wht

  note                text,

  -- Receipt-specific fields
  payment_method      payment_method,
  wht_certificate_no  text,
  paid_at             timestamptz,
  amount_received     numeric(15,2),               -- net payable actually received

  -- Void and copy tracking
  voided_at           timestamptz,
  voided_reason       text,
  copied_from_id      uuid references documents(id) on delete set null,

  -- Conversion tracking
  converted_from_id   uuid references documents(id) on delete set null,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table documents enable row level security;

create policy "Client manages own documents"
  on documents for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Admin reads all documents"
  on documents for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Index for common queries
create index idx_documents_user_status   on documents(user_id, status);
create index idx_documents_user_type     on documents(user_id, doc_type);
create index idx_documents_deal          on documents(deal_id);
create index idx_documents_customer      on documents(customer_id);
create index idx_documents_due_date      on documents(due_date) where status = 'sent';


-- ============================================================
-- DOCUMENT LINE ITEMS
-- Line items on quotation, invoice, delivery note, credit note
-- (Billing note uses billing_note_invoices instead)
-- ============================================================

create table document_line_items (
  id              uuid primary key default uuid_generate_v4(),
  document_id     uuid not null references documents(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,

  -- Item reference (null if free-text entry)
  item_id         uuid references items(id) on delete set null,

  -- Snapshot of item at time of save (do not rely on item table for history)
  item_name       text not null,
  item_sku        text,
  item_type       item_type not null default 'service',
  unit            text not null default 'ชิ้น',
  unit_price      numeric(15,2) not null,
  quantity        numeric(15,3) not null,
  discount_percent numeric(5,2) not null default 0,
  discount_amount numeric(15,2) not null default 0,

  -- Carton display (informational only — stock deducts in base unit)
  qty_carton      numeric(15,3),
  carton_unit     text,

  line_total      numeric(15,2) not null,     -- unit_price × quantity, stored at save time

  sort_order      int not null default 0,

  created_at      timestamptz not null default now()
);

alter table document_line_items enable row level security;

create policy "Client manages own line items"
  on document_line_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_line_items_document on document_line_items(document_id);


-- ============================================================
-- BILLING NOTE INVOICE LINKS
-- Invoices bundled inside a billing note (one-to-many)
-- ============================================================

create table billing_note_invoices (
  id                  uuid primary key default uuid_generate_v4(),
  billing_note_id     uuid not null references documents(id) on delete cascade,
  invoice_id          uuid not null references documents(id) on delete restrict,
  user_id             uuid not null references profiles(id) on delete cascade,

  -- Snapshot of invoice amounts at time of bundling
  invoice_number      text not null,
  issue_date          date,
  subtotal            numeric(15,2) not null,
  vat_amount          numeric(15,2) not null,
  total_amount        numeric(15,2) not null,

  unique (billing_note_id, invoice_id),

  created_at          timestamptz not null default now()
);

alter table billing_note_invoices enable row level security;

create policy "Client manages own billing note invoices"
  on billing_note_invoices for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_bni_billing_note on billing_note_invoices(billing_note_id);
create index idx_bni_invoice      on billing_note_invoices(invoice_id);


-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Auto-update updated_at timestamp
create or replace function handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_client_profiles_updated_at
  before update on client_profiles
  for each row execute function handle_updated_at();

create trigger trg_customers_updated_at
  before update on customers
  for each row execute function handle_updated_at();

create trigger trg_items_updated_at
  before update on items
  for each row execute function handle_updated_at();

create trigger trg_deals_updated_at
  before update on deals
  for each row execute function handle_updated_at();

create trigger trg_documents_updated_at
  before update on documents
  for each row execute function handle_updated_at();


-- Generate next document number
-- Call this inside a transaction when saving a new document
create or replace function generate_doc_number(
  p_user_id   uuid,
  p_doc_type  document_type,
  p_issue_date date
)
returns text as $$
declare
  v_seq         doc_number_sequences%rowtype;
  v_effective_date date := coalesce(p_issue_date, current_date);
  v_year        int := extract(year from v_effective_date)::int;
  v_month       int := extract(month from v_effective_date)::int;
  v_existing_max int := 0;
  v_next_seq    int;
  v_doc_number  text;
begin
  select * into v_seq
  from doc_number_sequences
  where user_id = p_user_id and doc_type = p_doc_type
  for update;

  if not found then
    raise exception 'No sequence configured for this document type';
  end if;

  if v_seq.reset_yearly then
    select coalesce(max(substring(doc_number from '([0-9]+)$')::int), 0)
      into v_existing_max
    from documents
    where user_id = p_user_id
      and doc_type = p_doc_type
      and doc_number is not null
      and extract(year from issue_date)::int = v_year
      and extract(month from issue_date)::int = v_month;
  else
    select coalesce(max(substring(doc_number from '([0-9]+)$')::int), 0)
      into v_existing_max
    from documents
    where user_id = p_user_id
      and doc_type = p_doc_type
      and doc_number is not null;
  end if;

  v_next_seq := v_existing_max + 1;

  -- Update sequence record
  update doc_number_sequences
  set last_sequence = v_next_seq,
      last_year     = v_year,
      last_month    = v_month
  where user_id = p_user_id and doc_type = p_doc_type;

  -- Format: PREFIX-YYYY-MM-001
  v_doc_number := v_seq.prefix || '-' || v_year || '-' || lpad(v_month::text, 2, '0') || '-' || lpad(v_next_seq::text, 3, '0');

  return v_doc_number;
end;
$$ language plpgsql security definer;


-- Repair document numbers for an existing client by rebuilding them from issue_date
-- Optionally force monthly-reset mode to match the current application behavior
create or replace function repair_doc_numbers(
  p_user_id uuid,
  p_doc_type document_type default null,
  p_force_reset_yearly boolean default false
)
returns table (
  doc_type document_type,
  repaired_count int,
  last_year int,
  last_month int,
  last_sequence int,
  last_doc_number text
) as $$
declare
  v_seq doc_number_sequences%rowtype;
begin
  if p_force_reset_yearly then
    update doc_number_sequences
    set reset_yearly = true
    where doc_number_sequences.user_id = p_user_id
      and (p_doc_type is null or doc_number_sequences.doc_type = p_doc_type);
  end if;

  for v_seq in
    select *
    from doc_number_sequences
    where doc_number_sequences.user_id = p_user_id
      and (p_doc_type is null or doc_number_sequences.doc_type = p_doc_type)
    order by doc_number_sequences.doc_type
    for update
  loop
    with ranked as (
      select
        d.id,
        extract(year from d.issue_date)::int as issue_year,
        extract(month from d.issue_date)::int as issue_month,
        (row_number() over (
          partition by
            case when v_seq.reset_yearly then extract(year from d.issue_date)::int else 1 end,
            case when v_seq.reset_yearly then extract(month from d.issue_date)::int else 1 end
          order by d.issue_date, d.created_at, d.id
        ))::int as bucket_sequence,
        (row_number() over (
          order by d.issue_date, d.created_at, d.id
        ))::int as global_sequence,
        (row_number() over (
          order by d.issue_date desc, d.created_at desc, d.id desc
        ))::int as reverse_order
      from documents d
      where d.user_id = p_user_id
        and d.doc_type = v_seq.doc_type
    )
    update documents d
    set doc_number =
      v_seq.prefix
      || '-' || ranked.issue_year
      || '-' || lpad(ranked.issue_month::text, 2, '0')
      || '-' || lpad(
        (
          case
            when v_seq.reset_yearly then ranked.bucket_sequence
            else ranked.global_sequence
          end
        )::text,
        3,
        '0'
      )
    from ranked
    where d.id = ranked.id;

    if exists (
      select 1
      from documents
      where documents.user_id = p_user_id
        and documents.doc_type = v_seq.doc_type
    ) then
      with ranked as (
        select
          d.id,
          extract(year from d.issue_date)::int as issue_year,
          extract(month from d.issue_date)::int as issue_month,
          (row_number() over (
            partition by
              case when v_seq.reset_yearly then extract(year from d.issue_date)::int else 1 end,
              case when v_seq.reset_yearly then extract(month from d.issue_date)::int else 1 end
            order by d.issue_date, d.created_at, d.id
          ))::int as bucket_sequence,
          (row_number() over (
            order by d.issue_date, d.created_at, d.id
          ))::int as global_sequence,
          (row_number() over (
            order by d.issue_date desc, d.created_at desc, d.id desc
          ))::int as reverse_order
        from documents d
        where d.user_id = p_user_id
          and d.doc_type = v_seq.doc_type
      ),
      latest as (
        select
          issue_year,
          issue_month,
          case
            when v_seq.reset_yearly then bucket_sequence
            else global_sequence
          end as effective_sequence
        from ranked
        where reverse_order = 1
      )
      update doc_number_sequences
      set last_year = latest.issue_year,
          last_month = latest.issue_month,
          last_sequence = latest.effective_sequence
      from latest
      where id = v_seq.id;

      return query
      with ranked as (
        select
          d.id,
          extract(year from d.issue_date)::int as issue_year,
          extract(month from d.issue_date)::int as issue_month,
          (row_number() over (
            partition by
              case when v_seq.reset_yearly then extract(year from d.issue_date)::int else 1 end,
              case when v_seq.reset_yearly then extract(month from d.issue_date)::int else 1 end
            order by d.issue_date, d.created_at, d.id
          ))::int as bucket_sequence,
          (row_number() over (
            order by d.issue_date, d.created_at, d.id
          ))::int as global_sequence,
          (row_number() over (
            order by d.issue_date desc, d.created_at desc, d.id desc
          ))::int as reverse_order
        from documents d
        where d.user_id = p_user_id
          and d.doc_type = v_seq.doc_type
      ),
      stats as (
        select count(*)::int as repaired_count
        from ranked
      )
      select
        v_seq.doc_type,
        stats.repaired_count,
        ranked.issue_year,
        ranked.issue_month,
        case
          when v_seq.reset_yearly then ranked.bucket_sequence
          else ranked.global_sequence
        end,
        v_seq.prefix
          || '-' || ranked.issue_year
          || '-' || lpad(ranked.issue_month::text, 2, '0')
          || '-' || lpad(
            (
              case
                when v_seq.reset_yearly then ranked.bucket_sequence
                else ranked.global_sequence
              end
            )::text,
            3,
            '0'
          )
      from ranked
      cross join stats
      where ranked.reverse_order = 1;
    else
      update doc_number_sequences
      set last_year = null,
          last_month = null,
          last_sequence = 0
      where doc_number_sequences.id = v_seq.id;

      return query
      select v_seq.doc_type, 0, null::int, null::int, 0, null::text;
    end if;
  end loop;
end;
$$ language plpgsql security definer;


-- Auto-mark overdue billing notes
-- Run this daily via Supabase pg_cron or a Vercel cron job
create or replace function mark_overdue_billing_notes()
returns void as $$
begin
  update documents
  set status = 'overdue'
  where doc_type    = 'billing_note'
    and status      = 'sent'
    and due_date    < current_date;
end;
$$ language plpgsql security definer;


-- ============================================================
-- DEFAULT DOCUMENT NUMBER SEQUENCES
-- Insert defaults when a new client profile is created
-- ============================================================

create or replace function create_default_sequences()
returns trigger as $$
begin
  insert into doc_number_sequences (user_id, doc_type, prefix, reset_yearly)
  values
    (new.user_id, 'quotation',      'QT',  true),
    (new.user_id, 'invoice',        'INV', true),
    (new.user_id, 'tax_invoice_receipt', 'TIR', true),
    (new.user_id, 'billing_note',   'BN',  true),
    (new.user_id, 'receipt',        'RC',  true),
    (new.user_id, 'delivery_note',  'DN',  true),
    (new.user_id, 'credit_note',    'CN',  true);
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_create_default_sequences
  after insert on client_profiles
  for each row execute function create_default_sequences();


-- ============================================================
-- STORAGE BUCKETS (run via Supabase dashboard or API)
-- ============================================================

-- Bucket: client-logos
-- Policy: authenticated users can upload/read their own logo only
-- Path convention: {user_id}/logo.{ext}

-- Bucket: document-pdfs (optional cache)
-- Policy: authenticated users can read their own PDFs only
-- Path convention: {user_id}/{document_id}.pdf
