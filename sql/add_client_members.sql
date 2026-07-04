do $$
begin
  if not exists (select 1 from pg_type where typname = 'client_member_role') then
    create type public.client_member_role as enum ('owner', 'manager', 'officer');
  end if;
  if not exists (select 1 from pg_type where typname = 'client_member_status') then
    create type public.client_member_status as enum ('active', 'disabled');
  end if;
end $$;

create table if not exists public.client_members (
  id                uuid primary key default uuid_generate_v4(),
  workspace_user_id uuid not null references public.profiles(id) on delete cascade,
  member_user_id    uuid not null references public.profiles(id) on delete cascade,
  role              public.client_member_role not null,
  status            public.client_member_status not null default 'active',
  permissions       jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (workspace_user_id, member_user_id)
);

alter table public.client_members
  add column if not exists permissions jsonb;

alter table public.client_members enable row level security;

create or replace function public.is_client_workspace_member(p_workspace_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select auth.uid() = p_workspace_user_id or exists (
    select 1
    from public.client_members
    where workspace_user_id = p_workspace_user_id
      and member_user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.client_workspace_role(p_workspace_user_id uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select case
    when auth.uid() = p_workspace_user_id then 'owner'
    else (
      select role::text
      from public.client_members
      where workspace_user_id = p_workspace_user_id
        and member_user_id = auth.uid()
        and status = 'active'
      limit 1
    )
  end;
$$;

insert into public.client_members (workspace_user_id, member_user_id, role, status)
select id, id, 'owner', 'active'
from public.profiles
where role = 'client'
on conflict (workspace_user_id, member_user_id) do nothing;

drop policy if exists "Client members read workspace membership" on public.client_members;
drop policy if exists "Admin manages client members" on public.client_members;

create policy "Client members read workspace membership"
  on public.client_members for select
  using (public.is_admin() or workspace_user_id = auth.uid() or member_user_id = auth.uid());

create policy "Admin manages client members"
  on public.client_members for all
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists idx_client_members_member_status
  on public.client_members (member_user_id, status);

drop trigger if exists trg_client_members_updated_at on public.client_members;
create trigger trg_client_members_updated_at
  before update on public.client_members
  for each row execute function public.handle_updated_at();

drop policy if exists "Client manages own profile" on public.client_profiles;
drop policy if exists "Client reads workspace profile" on public.client_profiles;
drop policy if exists "Owner manages workspace profile" on public.client_profiles;
drop policy if exists "Client creates own workspace profile" on public.client_profiles;
create policy "Client reads workspace profile"
  on public.client_profiles for select
  using (public.is_client_workspace_member(user_id));
create policy "Owner manages workspace profile"
  on public.client_profiles for update
  using (public.client_workspace_role(user_id) = 'owner')
  with check (public.client_workspace_role(user_id) = 'owner');
create policy "Client creates own workspace profile"
  on public.client_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "Client reads own features" on public.client_features;
drop policy if exists "Client reads workspace features" on public.client_features;
create policy "Client reads workspace features"
  on public.client_features for select
  using (public.is_client_workspace_member(user_id));

drop policy if exists "Client manages own sequences" on public.doc_number_sequences;
drop policy if exists "Client reads workspace sequences" on public.doc_number_sequences;
drop policy if exists "Owner manages workspace sequences" on public.doc_number_sequences;
create policy "Client reads workspace sequences"
  on public.doc_number_sequences for select
  using (public.is_client_workspace_member(user_id));
create policy "Owner manages workspace sequences"
  on public.doc_number_sequences for all
  using (public.client_workspace_role(user_id) = 'owner')
  with check (public.client_workspace_role(user_id) = 'owner');

drop policy if exists "Client manages own customers" on public.customers;
drop policy if exists "Client manages workspace customers" on public.customers;
create policy "Client manages workspace customers"
  on public.customers for all
  using (public.is_client_workspace_member(user_id))
  with check (public.is_client_workspace_member(user_id));

drop policy if exists "Client manages own items" on public.items;
drop policy if exists "Client manages workspace items" on public.items;
create policy "Client manages workspace items"
  on public.items for all
  using (public.is_client_workspace_member(user_id))
  with check (public.is_client_workspace_member(user_id));

drop policy if exists "Client manages own job detail presets" on public.item_job_detail_presets;
drop policy if exists "Client manages workspace job detail presets" on public.item_job_detail_presets;
create policy "Client manages workspace job detail presets"
  on public.item_job_detail_presets for all
  using (public.is_client_workspace_member(user_id))
  with check (public.is_client_workspace_member(user_id));

drop policy if exists "Client manages own job detail fields" on public.item_job_detail_fields;
drop policy if exists "Client manages workspace job detail fields" on public.item_job_detail_fields;
create policy "Client manages workspace job detail fields"
  on public.item_job_detail_fields for all
  using (public.is_client_workspace_member(user_id))
  with check (public.is_client_workspace_member(user_id));

drop policy if exists "Client manages own stock movements" on public.stock_movements;
drop policy if exists "Client manages workspace stock movements" on public.stock_movements;
create policy "Client manages workspace stock movements"
  on public.stock_movements for all
  using (public.is_client_workspace_member(user_id))
  with check (public.is_client_workspace_member(user_id));

drop policy if exists "Client manages own deals" on public.deals;
drop policy if exists "Client manages workspace deals" on public.deals;
create policy "Client manages workspace deals"
  on public.deals for all
  using (public.is_client_workspace_member(user_id))
  with check (public.is_client_workspace_member(user_id));

drop policy if exists "Client manages own documents" on public.documents;
drop policy if exists "Client manages workspace documents" on public.documents;
create policy "Client manages workspace documents"
  on public.documents for all
  using (public.is_client_workspace_member(user_id))
  with check (public.is_client_workspace_member(user_id));

drop policy if exists "Client manages own file metadata" on public.files;
drop policy if exists "Client manages workspace file metadata" on public.files;
create policy "Client manages workspace file metadata"
  on public.files for all
  using (public.is_client_workspace_member(user_id))
  with check (public.is_client_workspace_member(user_id));

drop policy if exists "Client manages own line items" on public.document_line_items;
drop policy if exists "Client manages workspace line items" on public.document_line_items;
create policy "Client manages workspace line items"
  on public.document_line_items for all
  using (public.is_client_workspace_member(user_id))
  with check (public.is_client_workspace_member(user_id));

drop policy if exists "Client manages own invoice delivery notes" on public.invoice_delivery_notes;
drop policy if exists "Client manages workspace invoice delivery notes" on public.invoice_delivery_notes;
create policy "Client manages workspace invoice delivery notes"
  on public.invoice_delivery_notes for all
  using (public.is_client_workspace_member(user_id))
  with check (public.is_client_workspace_member(user_id));

drop policy if exists "Client manages own billing note invoices" on public.billing_note_invoices;
drop policy if exists "Client manages workspace billing note invoices" on public.billing_note_invoices;
create policy "Client manages workspace billing note invoices"
  on public.billing_note_invoices for all
  using (public.is_client_workspace_member(user_id))
  with check (public.is_client_workspace_member(user_id));

drop policy if exists "Client manages own receipt invoices" on public.receipt_invoices;
drop policy if exists "Client manages workspace receipt invoices" on public.receipt_invoices;
create policy "Client manages workspace receipt invoices"
  on public.receipt_invoices for all
  using (public.is_client_workspace_member(user_id))
  with check (public.is_client_workspace_member(user_id));
