-- Phase-1 employee records: resign reason + personal document set.
--
--   1. employees.resign_reason (preset key) + employees.resign_note.
--      Reason keys: resigned | contract_ended | terminated | retired | other.
--   2. employee_documents: ID card, house registration, bank book (one row
--      per slot) + free-form "other" attachments. R2 object bytes live in
--      the bucket; this table holds the keys + metadata. Employee delete
--      cascades the rows; object cleanup is best-effort in the app layer.
--
-- Apply manually (Supabase SQL editor or Management API) per AGENTS.md.

alter table public.employees
  add column if not exists resign_reason text;
alter table public.employees
  add column if not exists resign_note text;

create table if not exists public.employee_documents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  doc_type      text not null check (doc_type in ('id_card', 'house_registration', 'bank_book', 'other')),
  label         text,
  r2_key        text not null,
  file_name     text,
  mime_type     text,
  file_size     integer,
  uploaded_at   timestamptz not null default now()
);

-- One row per fixed slot; "other" allows multiples.
create unique index if not exists uq_employee_doc_slot
  on public.employee_documents (employee_id, doc_type)
  where doc_type <> 'other';
create index if not exists idx_employee_docs_employee
  on public.employee_documents (employee_id);
create index if not exists idx_employee_docs_user
  on public.employee_documents (user_id);

alter table public.employee_documents enable row level security;

drop policy if exists "Client reads workspace employee documents" on public.employee_documents;
create policy "Client reads workspace employee documents"
  on public.employee_documents for select
  using (public.is_client_workspace_member(user_id));

drop policy if exists "Client manages workspace employee documents" on public.employee_documents;
create policy "Client manages workspace employee documents"
  on public.employee_documents for all
  using (public.is_client_workspace_member(user_id))
  with check (public.is_client_workspace_member(user_id));

drop policy if exists "Admin manages all employee documents" on public.employee_documents;
create policy "Admin manages all employee documents"
  on public.employee_documents for all
  using (public.is_admin())
  with check (public.is_admin());
