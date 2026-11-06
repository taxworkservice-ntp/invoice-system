-- Numbering settings: owner-only, confirmed, audited changes.
--
-- This migration does NOT change document-number formats or the generator.
-- It adds:
--   1. a reason column used by the trigger,
--   2. an immutable audit table,
--   3. an AFTER trigger that records every change with actor + reason,
--   4. an owner-only RPC that validates and writes all rows in one transaction.
--
-- Apply manually via the Supabase SQL editor or Management API.

alter table public.doc_number_sequences
  add column if not exists last_change_reason text;

create table if not exists public.doc_number_sequence_audit (
  id                 uuid primary key default gen_random_uuid(),
  change_id          bigint not null,
  workspace_user_id  uuid not null references public.profiles(id) on delete cascade,
  actor_user_id      uuid references public.profiles(id) on delete set null,
  doc_type           public.document_type not null,
  action             text not null check (action in ('insert', 'update', 'delete')),
  before             jsonb,
  after              jsonb,
  reason             text,
  created_at         timestamptz not null default now()
);

create index if not exists idx_doc_number_sequence_audit_workspace
  on public.doc_number_sequence_audit (workspace_user_id, created_at desc);

create index if not exists idx_doc_number_sequence_audit_change
  on public.doc_number_sequence_audit (change_id);

alter table public.doc_number_sequence_audit enable row level security;

drop policy if exists "Members read numbering audit" on public.doc_number_sequence_audit;
create policy "Members read numbering audit"
  on public.doc_number_sequence_audit for select
  using (
    public.is_admin()
    or public.is_client_workspace_member(workspace_user_id)
  );

-- No insert/update/delete policies: only the security-definer trigger writes.

create or replace function public.audit_doc_number_sequence_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action    text;
  v_before    jsonb;
  v_after     jsonb;
  v_doc_type  public.document_type;
  v_workspace uuid;
  v_reason    text;
begin
  if tg_op = 'DELETE' then
    v_action := 'delete';
    v_before := to_jsonb(old);
    v_after := null;
    v_doc_type := old.doc_type;
    v_workspace := old.user_id;
    v_reason := old.last_change_reason;
  elsif tg_op = 'INSERT' then
    v_action := 'insert';
    v_before := null;
    v_after := to_jsonb(new);
    v_doc_type := new.doc_type;
    v_workspace := new.user_id;
    v_reason := new.last_change_reason;
  else
    v_action := 'update';
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
    v_doc_type := new.doc_type;
    v_workspace := new.user_id;
    v_reason := coalesce(new.last_change_reason, old.last_change_reason);
  end if;

  insert into public.doc_number_sequence_audit (
    change_id,
    workspace_user_id,
    actor_user_id,
    doc_type,
    action,
    before,
    after,
    reason
  ) values (
    txid_current(),
    v_workspace,
    auth.uid(),
    v_doc_type,
    v_action,
    v_before,
    v_after,
    v_reason
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_doc_number_sequence on public.doc_number_sequences;
create trigger trg_audit_doc_number_sequence
  after insert or update or delete on public.doc_number_sequences
  for each row execute function public.audit_doc_number_sequence_change();

create or replace function public.save_doc_number_sequences(
  p_workspace_user_id uuid,
  p_rows jsonb,
  p_reason text
)
returns setof public.doc_number_sequences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row       jsonb;
  v_doc_type  public.document_type;
  v_prefix    text;
  v_start     int;
  v_reset     boolean;
  v_reason    text := trim(coalesce(p_reason, ''));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_workspace_owner(p_workspace_user_id) then
    raise exception 'Only the workspace owner can change document numbering';
  end if;

  if length(v_reason) < 5 then
    raise exception 'A reason of at least 5 characters is required';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    begin
      v_doc_type := (v_row ->> 'doc_type')::public.document_type;
    exception when others then
      raise exception 'Invalid doc_type in payload';
    end;

    v_prefix := trim(coalesce(v_row ->> 'prefix', ''));
    if v_prefix = '' then
      raise exception 'Prefix is required for %', v_doc_type;
    end if;

    v_start := greatest(1, coalesce((v_row ->> 'start_sequence')::int, 1));
    v_reset := coalesce((v_row ->> 'reset_yearly')::boolean, true);

    insert into public.doc_number_sequences (
      user_id,
      doc_type,
      prefix,
      reset_yearly,
      last_sequence,
      start_sequence,
      last_change_reason
    ) values (
      p_workspace_user_id,
      v_doc_type,
      v_prefix,
      v_reset,
      0,
      v_start,
      v_reason
    )
    on conflict (user_id, doc_type) do update
      set prefix = excluded.prefix,
          reset_yearly = excluded.reset_yearly,
          start_sequence = excluded.start_sequence,
          last_change_reason = excluded.last_change_reason
      where public.doc_number_sequences.prefix is distinct from excluded.prefix
         or public.doc_number_sequences.reset_yearly is distinct from excluded.reset_yearly
         or public.doc_number_sequences.start_sequence is distinct from excluded.start_sequence;
  end loop;

  return query
    select *
    from public.doc_number_sequences
    where user_id = p_workspace_user_id
    order by doc_type;
end;
$$;

revoke all on function public.save_doc_number_sequences(uuid, jsonb, text) from public, anon;
grant execute on function public.save_doc_number_sequences(uuid, jsonb, text) to authenticated, service_role;
