-- ============================================================
-- MIGRATION: WHT Module
-- Adds:
--   wht_vendors   — supplier/contractor profiles (payees)
--   wht_records   — individual withholding tax records
-- ============================================================

-- ============================================================
-- WHT VENDORS
-- ============================================================

create table if not exists wht_vendors (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references profiles(id) on delete cascade,

  name         text not null,
  tax_id       text,
  address      text,
  contact_name text,
  phone        text,
  email        text,
  note         text,

  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table wht_vendors enable row level security;

create policy "Client manages workspace wht vendors"
  on wht_vendors for all
  using (public.is_client_workspace_member(user_id))
  with check (public.is_client_workspace_member(user_id));

create policy "Admin reads all wht vendors"
  on wht_vendors for select
  using (public.is_admin());

create trigger trg_wht_vendors_updated_at
  before update on wht_vendors
  for each row execute function handle_updated_at();


-- ============================================================
-- WHT RECORDS
-- ============================================================

create table if not exists wht_records (
  id                      uuid primary key default uuid_generate_v4(),
  user_id                 uuid not null references profiles(id) on delete cascade,
  vendor_id               uuid not null references wht_vendors(id) on delete restrict,

  form_type               text not null default 'pnd3'
                          check (form_type in (
                            'pnd1','pnd1_special','pnd2','pnd3',
                            'pnd2a','pnd3a','pnd53'
                          )),

  issue_date              date not null default current_date,
  amount                  numeric(15,2) not null default 0,
  wht_rate                numeric(5,2) not null default 0,
  wht_amount              numeric(15,2) not null default 0,

  certificate_no          text,
  certificate_generated_at timestamptz,

  description             text,
  note                    text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table wht_records enable row level security;

create policy "Client manages workspace wht records"
  on wht_records for all
  using (public.is_client_workspace_member(user_id))
  with check (public.is_client_workspace_member(user_id));

create policy "Admin reads all wht records"
  on wht_records for select
  using (public.is_admin());

create trigger trg_wht_records_updated_at
  before update on wht_records
  for each row execute function handle_updated_at();

create unique index uq_wht_records_cert_no
  on wht_records(user_id, certificate_no)
  where certificate_no is not null;

create index idx_wht_records_user_vendor on wht_records(user_id, vendor_id);
create index idx_wht_records_issue_date on wht_records(user_id, issue_date);
create index idx_wht_records_user_month on wht_records(user_id, (extract(year from issue_date)::int * 100 + extract(month from issue_date)::int));


-- ============================================================
-- Auto-generate WHT certificate number
-- Format: YYMMxxx (e.g. 6809001 for Sep 2025, seq 1)
-- ============================================================

create or replace function generate_wht_certificate_no(
  p_user_id   uuid,
  p_issue_date date,
  p_skip_id   uuid default null
)
returns text as $$
declare
  v_yymm    text;
  v_seq     int;
begin
  v_yymm := to_char(p_issue_date, 'YYMM');

  select coalesce(max(
    nullif(right(certificate_no, 3), '')::int
  ), 0) + 1
  into v_seq
  from wht_records
  where user_id = p_user_id
    and certificate_no is not null
    and to_char(issue_date, 'YYMM') = v_yymm
    and (p_skip_id is null or id != p_skip_id);

  return v_yymm || lpad(v_seq::text, 3, '0');
end;
$$ language plpgsql security definer;
