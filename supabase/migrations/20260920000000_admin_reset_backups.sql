-- Admin "Clear Documents & Numbering" — backup + preview hardening.
--
-- Motivation (professional admin control):
--   The trial-cleanup reset in 20260913000000_admin_reset_service_role_bypass.sql
--   is destructive with no recovery path, no dry-run, and only an `after`
--   audit summary. This migration makes it accountable:
--     1. A full JSON snapshot of everything about to be deleted is written to
--        public.admin_reset_backups BEFORE the delete, in the same transaction.
--        The admin panel can list and download these snapshots later.
--     2. A read-only preview RPC returns what WOULD be deleted (counts + per-item
--        stock before/after) so the confirm dialog can show it up front.
--     3. The reset RPC accepts an optional reason, records the pre-reset counts
--        in client_permission_audit.before, and returns the backup id.
--
-- The delete/restore/numbering semantics are UNCHANGED — this only wraps them
-- with a recoverable snapshot, a preview, and richer audit. Setup data
-- (customers, items, wht_vendors, profiles) is still preserved.
--
-- Apply manually (Supabase SQL editor or Management API) per AGENTS.md.

-- ---------------------------------------------------------------------------
-- 1. Backup store
-- ---------------------------------------------------------------------------
create table if not exists public.admin_reset_backups (
  id                uuid primary key default gen_random_uuid(),
  workspace_user_id uuid not null,
  actor_user_id     uuid not null,
  action            text not null default 'reset-documents',
  reason            text,
  summary           jsonb not null default '{}'::jsonb,
  payload           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  downloaded_at     timestamptz
);

create index if not exists idx_admin_reset_backups_workspace
  on public.admin_reset_backups (workspace_user_id, created_at desc);

alter table public.admin_reset_backups enable row level security;

drop policy if exists "Workspace owner and admin read reset backups" on public.admin_reset_backups;
create policy "Workspace owner and admin read reset backups"
  on public.admin_reset_backups for select
  using (public.is_admin() or workspace_user_id = auth.uid());

revoke all on table public.admin_reset_backups from public, anon;
grant select on table public.admin_reset_backups to authenticated;
grant all on table public.admin_reset_backups to service_role;

-- ---------------------------------------------------------------------------
-- 2. Reset RPC (backup-aware). Signature changes from (uuid, uuid) to
--    (uuid, uuid, text default null) so the old 2-arg version must be dropped
--    explicitly to avoid an ambiguous overload.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_reset_client_documents(uuid, uuid);

create or replace function public.admin_reset_client_documents(
  p_target_user_id uuid,
  p_actor_user_id  uuid,
  p_reason         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_backup_id      uuid := gen_random_uuid();
  v_reason         text := nullif(btrim(coalesce(p_reason, '')), '');
  v_payload        jsonb;
  v_before         jsonb;
  v_r2_keys        text[];
  v_documents      bigint := 0;
  v_deals          bigint := 0;
  v_line_items     bigint := 0;
  v_stock_moves    bigint := 0;
  v_wht_records    bigint := 0;
  v_files          bigint := 0;
  v_items_restored bigint := 0;
  v_doc_seq_reset  bigint := 0;
  v_deal_seq_reset bigint := 0;
  v_summary        jsonb;
begin
  -- Service-role (server-side admin API, no user JWT context) bypasses the
  -- in-function admin check; authorization is enforced by requireAdmin() in
  -- the caller. Direct authenticated callers must still be admins.
  if auth.uid() is null then
    null;
  elsif not public.is_admin() then
    raise exception 'admin_reset_client_documents: admin only' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = p_target_user_id) then
    raise exception 'Client not found';
  end if;

  -- 0. Full snapshot of everything about to be deleted (captured BEFORE any
  --    mutation, so it is a faithful pre-reset copy). Stored in the same
  --    transaction as the delete: if anything below fails, both roll back.
  v_payload := jsonb_build_object(
    'schema_version', 1,
    'captured_at', to_jsonb(now()),
    'workspace_user_id', p_target_user_id,
    'documents', coalesce((
      select jsonb_agg(to_jsonb(d)) from public.documents d where d.user_id = p_target_user_id
    ), '[]'::jsonb),
    'document_line_items', coalesce((
      select jsonb_agg(to_jsonb(li)) from public.document_line_items li where li.user_id = p_target_user_id
    ), '[]'::jsonb),
    'deals', coalesce((
      select jsonb_agg(to_jsonb(de)) from public.deals de where de.user_id = p_target_user_id
    ), '[]'::jsonb),
    'stock_movements', coalesce((
      select jsonb_agg(to_jsonb(sm)) from public.stock_movements sm where sm.user_id = p_target_user_id
    ), '[]'::jsonb),
    'wht_records', coalesce((
      select jsonb_agg(to_jsonb(wr)) from public.wht_records wr where wr.user_id = p_target_user_id
    ), '[]'::jsonb),
    'files', coalesce((
      select jsonb_agg(to_jsonb(f)) from public.files f
      where f.user_id = p_target_user_id and f.document_id is not null
    ), '[]'::jsonb),
    'doc_number_sequences', coalesce((
      select jsonb_agg(to_jsonb(ds)) from public.doc_number_sequences ds where ds.user_id = p_target_user_id
    ), '[]'::jsonb),
    'deal_number_sequences', coalesce((
      select jsonb_agg(to_jsonb(ds)) from public.deal_number_sequences ds where ds.user_id = p_target_user_id
    ), '[]'::jsonb)
  );

  -- Pre-reset counts for the audit `before` column (also reused for the
  -- files_deleted summary — files cascade away with documents below).
  v_files := (select count(*) from public.files where user_id = p_target_user_id and document_id is not null);

  v_before := jsonb_build_object(
    'documents', (select count(*) from public.documents where user_id = p_target_user_id),
    'document_line_items', (select count(*) from public.document_line_items where user_id = p_target_user_id),
    'deals', (select count(*) from public.deals where user_id = p_target_user_id),
    'stock_movements', (select count(*) from public.stock_movements where user_id = p_target_user_id),
    'wht_records', (select count(*) from public.wht_records where user_id = p_target_user_id),
    'files', v_files
  );

  -- 1. R2 keys of document attachments (deleted by caller after commit)
  select coalesce(
    array_agg(r2_key) filter (where r2_key is not null),
    '{}'::text[]
  )
  into v_r2_keys
  from public.files
  where user_id = p_target_user_id
    and document_id is not null;

  -- 2. Revert stock polluted by document-driven movements.
  update public.items i
  set stock_count = round(i.stock_count - m.total_qty, 3),
      stock_value = round((i.stock_count - m.total_qty) * i.avg_cost, 2),
      updated_at  = now()
  from (
    select item_id, sum(qty_base) as total_qty
    from public.stock_movements
    where user_id = p_target_user_id
      and document_id is not null
    group by item_id
  ) m
  where i.id = m.item_id
    and i.user_id = p_target_user_id;
  get diagnostics v_items_restored = row_count;

  -- 3. Delete trial data (junction tables first; deals before documents:
  --    documents.deal_id is SET NULL).
  delete from public.receipt_invoices where user_id = p_target_user_id;

  delete from public.invoice_delivery_notes where user_id = p_target_user_id;

  delete from public.billing_note_invoices where user_id = p_target_user_id;

  delete from public.document_line_items where user_id = p_target_user_id;
  get diagnostics v_line_items = row_count;

  delete from public.stock_movements where user_id = p_target_user_id;
  get diagnostics v_stock_moves = row_count;

  delete from public.deals where user_id = p_target_user_id;
  get diagnostics v_deals = row_count;

  delete from public.documents where user_id = p_target_user_id;
  get diagnostics v_documents = row_count;

  delete from public.wht_records where user_id = p_target_user_id;
  get diagnostics v_wht_records = row_count;

  -- 4. Restart numbering (config preserved).
  update public.doc_number_sequences
  set last_sequence = 0,
      last_year     = null,
      last_month    = null
  where user_id = p_target_user_id;
  get diagnostics v_doc_seq_reset = row_count;

  update public.deal_number_sequences
  set last_sequence = 0,
      last_month    = 0
  where user_id = p_target_user_id;
  get diagnostics v_deal_seq_reset = row_count;

  -- 5. Persist the backup row (payload captured pre-delete).
  v_summary := jsonb_build_object(
    'documents_deleted',    v_documents,
    'deals_deleted',        v_deals,
    'line_items_deleted',   v_line_items,
    'stock_movements_deleted', v_stock_moves,
    'wht_records_deleted',  v_wht_records,
    'files_deleted',        v_files,
    'items_stock_restored', v_items_restored,
    'doc_sequences_reset',  v_doc_seq_reset,
    'deal_sequences_reset', v_deal_seq_reset,
    'r2_keys',              to_jsonb(v_r2_keys),
    'backup_id',            v_backup_id,
    'reason',               v_reason
  );

  insert into public.admin_reset_backups (
    id, workspace_user_id, actor_user_id, action, reason, summary, payload
  ) values (
    v_backup_id, p_target_user_id, p_actor_user_id, 'reset-documents', v_reason, v_summary, v_payload
  );

  -- 6. Audit trail (before + after + reason)
  insert into public.client_permission_audit (
    workspace_user_id, actor_user_id, target_member_id, action, before, after
  ) values (
    p_target_user_id, p_actor_user_id, null, 'reset-documents', v_before, v_summary
  );

  return v_summary;
end;
$$;

revoke all on function public.admin_reset_client_documents(uuid, uuid, text) from public, anon;
grant execute on function public.admin_reset_client_documents(uuid, uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Read-only preview RPC (dry run) for the confirm dialog.
-- ---------------------------------------------------------------------------
create or replace function public.admin_preview_reset_client_documents(
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_items jsonb;
begin
  if auth.uid() is null then
    null;
  elsif not public.is_admin() then
    raise exception 'admin_preview_reset_client_documents: admin only' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = p_target_user_id) then
    raise exception 'Client not found';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'name', i.name,
           'stock_before', i.stock_count,
           'stock_after', round(i.stock_count - m.total_qty, 3),
           'avg_cost', i.avg_cost
         ) order by i.name), '[]'::jsonb)
  into v_items
  from public.items i
  join (
    select item_id, sum(qty_base) as total_qty
    from public.stock_movements
    where user_id = p_target_user_id
      and document_id is not null
    group by item_id
  ) m on m.item_id = i.id
  where i.user_id = p_target_user_id;

  return jsonb_build_object(
    'documents', (select count(*) from public.documents where user_id = p_target_user_id),
    'document_line_items', (select count(*) from public.document_line_items where user_id = p_target_user_id),
    'deals', (select count(*) from public.deals where user_id = p_target_user_id),
    'stock_movements', (select count(*) from public.stock_movements where user_id = p_target_user_id),
    'wht_records', (select count(*) from public.wht_records where user_id = p_target_user_id),
    'files', (select count(*) from public.files where user_id = p_target_user_id and document_id is not null),
    'items', v_items,
    'items_affected', jsonb_array_length(v_items),
    'customers_preserved', (select count(*) from public.customers where user_id = p_target_user_id),
    'items_preserved', (select count(*) from public.items where user_id = p_target_user_id)
  );
end;
$$;

revoke all on function public.admin_preview_reset_client_documents(uuid) from public, anon;
grant execute on function public.admin_preview_reset_client_documents(uuid) to authenticated, service_role;
