-- Separate the PDF cache version from the user-facing "last edited" timestamp.
--
-- Problem: 20260913000001_pdf_cache_invalidation.sql made every render input
-- bump `documents.updated_at`. Triggers 5/6 update ALL of a workspace's (or a
-- customer's) documents on any profile/customer change, so saving Settings
-- restamped every document and the home "แก้ไขล่าสุด" column showed the same
-- time on every row.
--
-- Fix: give PDF invalidation its own `render_updated_at` column. The
-- touch-triggers bump THAT; `updated_at` keeps its normal meaning (bumped only
-- by a real document UPDATE via trg_documents_updated_at). The server/client
-- cache comparison switches from updated_at → render_updated_at.
--
-- Applied manually (Supabase SQL editor / Management API). Idempotent.

-- 1. Add + backfill the render version. Add nullable, copy updated_at, then
--    enforce not-null/default so existing rows keep a sensible version.
alter table public.documents
  add column if not exists render_updated_at timestamptz;

update public.documents
  set render_updated_at = updated_at
  where render_updated_at is null;

alter table public.documents
  alter column render_updated_at set default now();
alter table public.documents
  alter column render_updated_at set not null;

-- 2. Any real document UPDATE invalidates the cache. Runs alongside
--    trg_documents_updated_at (which keeps updated_at correct) — a BEFORE
--    trigger so it composes with the existing updated_at trigger.
create or replace function public.handle_render_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.render_updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_documents_render_updated_at on public.documents;
create trigger trg_documents_render_updated_at
  before update on public.documents
  for each row execute function public.handle_render_updated_at();

-- 3. Retarget the touch-triggers at render_updated_at. The trigger definitions
--    are unchanged (they call these functions); only the bodies move.
create or replace function public.touch_document(p_document_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.documents set render_updated_at = now() where id = p_document_id;
$$;

create or replace function public.touch_documents_on_customer_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.documents set render_updated_at = now() where customer_id = new.id;
  return new;
end;
$$;

create or replace function public.touch_documents_on_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.documents set render_updated_at = now() where user_id = new.user_id;
  return new;
end;
$$;

create or replace function public.touch_documents_on_bank_account_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.documents
  set render_updated_at = now()
  where bank_account_id = coalesce(new.id, old.id);
  return coalesce(new, old);
end;
$$;

create or replace function public.touch_documents_on_source_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.documents
  set render_updated_at = now()
  where id <> new.id
    and (converted_from_id = new.id or copied_from_id = new.id);
  return new;
end;
$$;
