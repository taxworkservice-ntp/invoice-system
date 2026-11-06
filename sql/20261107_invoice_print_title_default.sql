-- Workspace default for the printed tax-invoice title.
--
-- Phase 1: VAT tax invoice only. The document keeps its snapshot in
-- documents.print_title_variant at creation; changing this setting affects NEW
-- documents, never reprints of already-issued documents.
--
-- Apply manually via the Supabase SQL editor or Management API.

alter table public.client_profiles
  add column if not exists print_titles_by_type jsonb not null default '{}'::jsonb;

create table if not exists public.document_print_title_audit (
  id                 uuid primary key default gen_random_uuid(),
  workspace_user_id  uuid not null references public.profiles(id) on delete cascade,
  actor_user_id      uuid references public.profiles(id) on delete set null,
  doc_type           public.document_type not null,
  before             jsonb,
  after              jsonb,
  reason             text,
  created_at         timestamptz not null default now()
);

create index if not exists idx_document_print_title_audit_workspace
  on public.document_print_title_audit (workspace_user_id, created_at desc);

alter table public.document_print_title_audit enable row level security;

drop policy if exists "Members read print title audit" on public.document_print_title_audit;
create policy "Members read print title audit"
  on public.document_print_title_audit for select
  using (
    public.is_admin()
    or public.is_client_workspace_member(workspace_user_id)
  );

create or replace function public.save_invoice_print_title(
  p_workspace_user_id uuid,
  p_preset text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason  text := trim(coalesce(p_reason, ''));
  v_preset  text := nullif(trim(coalesce(p_preset, '')), '');
  v_before  jsonb;
  v_after   jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_workspace_owner(p_workspace_user_id) then
    raise exception 'Only the workspace owner can change the printed title';
  end if;

  if length(v_reason) < 5 then
    raise exception 'A reason of at least 5 characters is required';
  end if;

  if v_preset is not null and v_preset not in (
    'tax_invoice_delivery',
    'tax_invoice_invoice',
    'tax_invoice_delivery_invoice',
    'tax_invoice_receipt'
  ) then
    raise exception 'Invalid print title preset';
  end if;

  select coalesce(print_titles_by_type, '{}'::jsonb)
    into v_before
    from public.client_profiles
    where user_id = p_workspace_user_id;

  if not found then
    raise exception 'Workspace profile not found';
  end if;

  v_after := case
    when v_preset is null
      then v_before #- '{invoice,preset}'
    else v_before || jsonb_build_object(
      'invoice',
      coalesce(v_before -> 'invoice', '{}'::jsonb)
        || jsonb_build_object('preset', v_preset)
    )
  end;

  if v_preset is null and (v_after -> 'invoice') = '{}'::jsonb then
    v_after := v_after - 'invoice';
  end if;

  update public.client_profiles
  set print_titles_by_type = v_after
  where user_id = p_workspace_user_id;

  insert into public.document_print_title_audit (
    workspace_user_id,
    actor_user_id,
    doc_type,
    before,
    after,
    reason
  ) values (
    p_workspace_user_id,
    auth.uid(),
    'invoice',
    jsonb_build_object('preset', v_before #>> '{invoice,preset}'),
    jsonb_build_object('preset', v_after #>> '{invoice,preset}'),
    v_reason
  );

  return v_after;
end;
$$;

revoke all on function public.save_invoice_print_title(uuid, text, text) from public, anon;
grant execute on function public.save_invoice_print_title(uuid, text, text) to authenticated, service_role;
