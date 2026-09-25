-- Admin reset safety net — professional-grade destructive-action guards.
--
-- What this adds on top of 20260920000000_admin_reset_backups.sql:
--   1. v2 payload for admin_reset_client_documents: the junction tables
--      (receipt_invoices, invoice_delivery_notes, billing_note_invoices)
--      are deleted by the reset but were NOT snapshotted, so no restore
--      could ever relink billing graphs. schema_version bumps 1 → 2.
--   2. admin_reset_client_all: atomic reset-all (snapshot + delete +
--      sequence reseed + backup + audit in ONE transaction). Replaces the
--      handler's ~13 independent error-ignoring deletes, and additionally
--      clears orphaned files + deal_activities rows the old path left behind.
--   3. admin_delete_client_workspace: atomic table wipe for client DELETE
--      (snapshot + deletes + profiles row + backup + audit). The caller
--      still deletes the auth user afterwards (auth.admin is not reachable
--      from SQL) and cleans R2 keys returned in the summary.
--   4. Read-only previews for the confirm dialogs:
--      admin_preview_reset_client_all, admin_preview_reset_workspace.
--
-- Semantics preserved: reset-all keeps account/profile/members/features/
-- audit/backups; delete removes client_profiles + profiles rows.
-- generate_deal_number() self-heals a missing deal_number_sequences row
-- (insert-on-missing), so deal sequences are deleted, not reseeded.
-- R2 bytes are metadata-only (unrecoverable by design); keys are returned
-- for best-effort cleanup after commit.
--
-- Apply manually (Supabase SQL editor or Management API) per AGENTS.md.

-- ---------------------------------------------------------------------------
-- 1. v2 payload for admin_reset_client_documents (junction tables included)
-- ---------------------------------------------------------------------------
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
  --    v2: junction tables added (deleted below, previously unsnapshotted).
  v_payload := jsonb_build_object(
    'schema_version', 2,
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
    'receipt_invoices', coalesce((
      select jsonb_agg(to_jsonb(ri)) from public.receipt_invoices ri where ri.user_id = p_target_user_id
    ), '[]'::jsonb),
    'invoice_delivery_notes', coalesce((
      select jsonb_agg(to_jsonb(idn)) from public.invoice_delivery_notes idn where idn.user_id = p_target_user_id
    ), '[]'::jsonb),
    'billing_note_invoices', coalesce((
      select jsonb_agg(to_jsonb(bni)) from public.billing_note_invoices bni where bni.user_id = p_target_user_id
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

-- ---------------------------------------------------------------------------
-- 2. Atomic reset-all (snapshot + delete + reseed + backup + audit, one txn)
-- ---------------------------------------------------------------------------
create or replace function public.admin_reset_client_all(
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
  v_backup_id   uuid := gen_random_uuid();
  v_reason      text := nullif(btrim(coalesce(p_reason, '')), '');
  v_payload     jsonb;
  v_before      jsonb;
  v_r2_keys     text[];
  v_summary     jsonb;
  v_documents   bigint := 0;
  v_deals       bigint := 0;
  v_line_items  bigint := 0;
  v_stock_moves bigint := 0;
  v_wht         bigint := 0;
  v_files       bigint := 0;
  v_activities  bigint := 0;
  v_customers   bigint := 0;
  v_items       bigint := 0;
begin
  if auth.uid() is null then
    null;
  elsif not public.is_admin() then
    raise exception 'admin_reset_client_all: admin only' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = p_target_user_id) then
    raise exception 'Client not found';
  end if;

  -- 0. Snapshot everything the wipe removes (pre-delete, same transaction).
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
      select jsonb_agg(to_jsonb(f)) from public.files f where f.user_id = p_target_user_id
    ), '[]'::jsonb),
    'customers', coalesce((
      select jsonb_agg(to_jsonb(c)) from public.customers c where c.user_id = p_target_user_id
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(to_jsonb(i)) from public.items i where i.user_id = p_target_user_id
    ), '[]'::jsonb),
    'receipt_invoices', coalesce((
      select jsonb_agg(to_jsonb(ri)) from public.receipt_invoices ri where ri.user_id = p_target_user_id
    ), '[]'::jsonb),
    'invoice_delivery_notes', coalesce((
      select jsonb_agg(to_jsonb(idn)) from public.invoice_delivery_notes idn where idn.user_id = p_target_user_id
    ), '[]'::jsonb),
    'billing_note_invoices', coalesce((
      select jsonb_agg(to_jsonb(bni)) from public.billing_note_invoices bni where bni.user_id = p_target_user_id
    ), '[]'::jsonb),
    'deal_activities', coalesce((
      select jsonb_agg(to_jsonb(da)) from public.deal_activities da
      where da.deal_id in (select dd.id from public.deals dd where dd.user_id = p_target_user_id)
    ), '[]'::jsonb),
    'doc_number_sequences', coalesce((
      select jsonb_agg(to_jsonb(ds)) from public.doc_number_sequences ds where ds.user_id = p_target_user_id
    ), '[]'::jsonb),
    'deal_number_sequences', coalesce((
      select jsonb_agg(to_jsonb(ds)) from public.deal_number_sequences ds where ds.user_id = p_target_user_id
    ), '[]'::jsonb)
  );

  v_before := jsonb_build_object(
    'documents', (select count(*) from public.documents where user_id = p_target_user_id),
    'document_line_items', (select count(*) from public.document_line_items where user_id = p_target_user_id),
    'deals', (select count(*) from public.deals where user_id = p_target_user_id),
    'stock_movements', (select count(*) from public.stock_movements where user_id = p_target_user_id),
    'wht_records', (select count(*) from public.wht_records where user_id = p_target_user_id),
    'files', (select count(*) from public.files where user_id = p_target_user_id),
    'customers', (select count(*) from public.customers where user_id = p_target_user_id),
    'items', (select count(*) from public.items where user_id = p_target_user_id)
  );

  -- R2 keys for post-commit cleanup by the caller.
  select coalesce(array_agg(r2_key) filter (where r2_key is not null), '{}'::text[])
  into v_r2_keys
  from public.files
  where user_id = p_target_user_id;

  -- 1. Wipe (junctions first; deals before documents: deal_id is SET NULL).
  delete from public.receipt_invoices where user_id = p_target_user_id;
  delete from public.invoice_delivery_notes where user_id = p_target_user_id;
  delete from public.billing_note_invoices where user_id = p_target_user_id;
  delete from public.document_line_items where user_id = p_target_user_id;
  get diagnostics v_line_items = row_count;
  delete from public.stock_movements where user_id = p_target_user_id;
  get diagnostics v_stock_moves = row_count;
  -- Activities reference deals: delete BEFORE deals go away.
  delete from public.deal_activities
  where deal_id in (select dd.id from public.deals dd where dd.user_id = p_target_user_id);
  get diagnostics v_activities = row_count;
  delete from public.deals where user_id = p_target_user_id;
  get diagnostics v_deals = row_count;
  delete from public.documents where user_id = p_target_user_id;
  get diagnostics v_documents = row_count;
  delete from public.wht_records where user_id = p_target_user_id;
  get diagnostics v_wht = row_count;
  delete from public.files where user_id = p_target_user_id;
  get diagnostics v_files = row_count;
  delete from public.customers where user_id = p_target_user_id;
  get diagnostics v_customers = row_count;
  delete from public.items where user_id = p_target_user_id;
  get diagnostics v_items = row_count;
  delete from public.doc_number_sequences where user_id = p_target_user_id;
  delete from public.deal_number_sequences where user_id = p_target_user_id;
  -- deal_number_sequences is NOT reseeded: generate_deal_number()
  -- insert-on-missing self-heals the next deal creation.

  -- 2. Reseed document numbering (config defaults).
  insert into public.doc_number_sequences
    (user_id, doc_type, prefix, reset_yearly, last_sequence, last_year, last_month)
  select p_target_user_id, t.doc_type, t.prefix, false, 0, null, null
  from (values
    ('quotation', 'QT'),
    ('invoice', 'INV'),
    ('tax_invoice_receipt', 'TAX'),
    ('billing_note', 'BN'),
    ('receipt', 'RC'),
    ('delivery_note', 'DN'),
    ('credit_note', 'CN')
  ) as t(doc_type, prefix);

  -- 3. Backup + audit (same transaction — both roll back on any failure).
  v_summary := jsonb_build_object(
    'documents_deleted', v_documents,
    'deals_deleted', v_deals,
    'line_items_deleted', v_line_items,
    'stock_movements_deleted', v_stock_moves,
    'wht_records_deleted', v_wht,
    'files_deleted', v_files,
    'activities_deleted', v_activities,
    'customers_deleted', v_customers,
    'items_deleted', v_items,
    'sequences_recreated', true,
    'r2_keys', to_jsonb(v_r2_keys),
    'backup_id', v_backup_id,
    'reason', v_reason
  );

  insert into public.admin_reset_backups (
    id, workspace_user_id, actor_user_id, action, reason, summary, payload
  ) values (
    v_backup_id, p_target_user_id, p_actor_user_id, 'reset-all', v_reason, v_summary, v_payload
  );

  insert into public.client_permission_audit (
    workspace_user_id, actor_user_id, target_member_id, action, before, after
  ) values (
    p_target_user_id, p_actor_user_id, null, 'reset-all', v_before, v_summary
  );

  return v_summary;
end;
$$;

revoke all on function public.admin_reset_client_all(uuid, uuid, text) from public, anon;
grant execute on function public.admin_reset_client_all(uuid, uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Atomic client-delete table wipe (auth user deleted by caller afterwards)
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_client_workspace(
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
  v_backup_id uuid := gen_random_uuid();
  v_reason    text := nullif(btrim(coalesce(p_reason, '')), '');
  v_payload   jsonb;
  v_before    jsonb;
  v_r2_keys   text[];
  v_summary   jsonb;
begin
  if auth.uid() is null then
    null;
  elsif not public.is_admin() then
    raise exception 'admin_delete_client_workspace: admin only' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = p_target_user_id) then
    raise exception 'Client not found';
  end if;

  -- 0. Snapshot (pre-delete, same transaction). client_profiles included
  --    for the record; profiles/auth rows cannot be meaningfully restored.
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
      select jsonb_agg(to_jsonb(f)) from public.files f where f.user_id = p_target_user_id
    ), '[]'::jsonb),
    'customers', coalesce((
      select jsonb_agg(to_jsonb(c)) from public.customers c where c.user_id = p_target_user_id
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(to_jsonb(i)) from public.items i where i.user_id = p_target_user_id
    ), '[]'::jsonb),
    'receipt_invoices', coalesce((
      select jsonb_agg(to_jsonb(ri)) from public.receipt_invoices ri where ri.user_id = p_target_user_id
    ), '[]'::jsonb),
    'invoice_delivery_notes', coalesce((
      select jsonb_agg(to_jsonb(idn)) from public.invoice_delivery_notes idn where idn.user_id = p_target_user_id
    ), '[]'::jsonb),
    'billing_note_invoices', coalesce((
      select jsonb_agg(to_jsonb(bni)) from public.billing_note_invoices bni where bni.user_id = p_target_user_id
    ), '[]'::jsonb),
    'client_profiles', coalesce((
      select jsonb_agg(to_jsonb(cp)) from public.client_profiles cp where cp.user_id = p_target_user_id
    ), '[]'::jsonb),
    'doc_number_sequences', coalesce((
      select jsonb_agg(to_jsonb(ds)) from public.doc_number_sequences ds where ds.user_id = p_target_user_id
    ), '[]'::jsonb),
    'deal_number_sequences', coalesce((
      select jsonb_agg(to_jsonb(ds)) from public.deal_number_sequences ds where ds.user_id = p_target_user_id
    ), '[]'::jsonb)
  );

  v_before := jsonb_build_object(
    'documents', (select count(*) from public.documents where user_id = p_target_user_id),
    'deals', (select count(*) from public.deals where user_id = p_target_user_id),
    'customers', (select count(*) from public.customers where user_id = p_target_user_id),
    'items', (select count(*) from public.items where user_id = p_target_user_id)
  );

  select coalesce(array_agg(r2_key) filter (where r2_key is not null), '{}'::text[])
  into v_r2_keys
  from public.files
  where user_id = p_target_user_id;

  -- 1. Wipe workspace tables + profile rows (auth user deleted by caller).
  delete from public.receipt_invoices where user_id = p_target_user_id;
  delete from public.invoice_delivery_notes where user_id = p_target_user_id;
  delete from public.billing_note_invoices where user_id = p_target_user_id;
  delete from public.document_line_items where user_id = p_target_user_id;
  delete from public.stock_movements where user_id = p_target_user_id;
  delete from public.deals where user_id = p_target_user_id;
  delete from public.documents where user_id = p_target_user_id;
  delete from public.customers where user_id = p_target_user_id;
  delete from public.doc_number_sequences where user_id = p_target_user_id;
  delete from public.items where user_id = p_target_user_id;
  delete from public.client_profiles where user_id = p_target_user_id;
  delete from public.profiles where id = p_target_user_id;

  -- 2. Backup + audit (fail-closed: any failure rolls everything back,
  --    including the deletes above — no silent partial wipe).
  v_summary := jsonb_build_object(
    'before', v_before,
    'r2_keys', to_jsonb(v_r2_keys),
    'backup_id', v_backup_id,
    'reason', v_reason
  );

  insert into public.admin_reset_backups (
    id, workspace_user_id, actor_user_id, action, reason, summary, payload
  ) values (
    v_backup_id, p_target_user_id, p_actor_user_id, 'client-deleted', v_reason, v_summary, v_payload
  );

  insert into public.client_permission_audit (
    workspace_user_id, actor_user_id, target_member_id, action, before, after
  ) values (
    p_target_user_id, p_actor_user_id, null, 'client.deleted', v_before, v_summary
  );

  return v_summary;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Read-only previews for the confirm dialogs
-- ---------------------------------------------------------------------------
create or replace function public.admin_preview_reset_client_all(
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    null;
  elsif not public.is_admin() then
    raise exception 'admin_preview_reset_client_all: admin only' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = p_target_user_id) then
    raise exception 'Client not found';
  end if;

  return jsonb_build_object(
    'documents', (select count(*) from public.documents where user_id = p_target_user_id),
    'document_line_items', (select count(*) from public.document_line_items where user_id = p_target_user_id),
    'deals', (select count(*) from public.deals where user_id = p_target_user_id),
    'stock_movements', (select count(*) from public.stock_movements where user_id = p_target_user_id),
    'wht_records', (select count(*) from public.wht_records where user_id = p_target_user_id),
    'files', (select count(*) from public.files where user_id = p_target_user_id),
    'customers', (select count(*) from public.customers where user_id = p_target_user_id),
    'items', (select count(*) from public.items where user_id = p_target_user_id)
  );
end;
$$;

create or replace function public.admin_preview_reset_workspace(
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    null;
  elsif not public.is_admin() then
    raise exception 'admin_preview_reset_workspace: admin only' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = p_target_user_id) then
    raise exception 'Client not found';
  end if;

  return jsonb_build_object(
    'active_deals', (select count(*) from public.deals where user_id = p_target_user_id and is_active = true),
    'active_customers', (select count(*) from public.customers where user_id = p_target_user_id and is_active = true),
    'active_items', (select count(*) from public.items where user_id = p_target_user_id and is_active = true),
    'doc_sequences', (select count(*) from public.doc_number_sequences where user_id = p_target_user_id),
    'deal_sequences', (select count(*) from public.deal_number_sequences where user_id = p_target_user_id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants (mirror the existing convention: no public/anon, service_role +
--    authenticated; in-function is_admin() check is the real gate)
-- ---------------------------------------------------------------------------
revoke all on function public.admin_delete_client_workspace(uuid, uuid, text) from public, anon;
grant execute on function public.admin_delete_client_workspace(uuid, uuid, text) to authenticated, service_role;

revoke all on function public.admin_preview_reset_client_all(uuid) from public, anon;
grant execute on function public.admin_preview_reset_client_all(uuid) to authenticated, service_role;

revoke all on function public.admin_preview_reset_workspace(uuid) from public, anon;
grant execute on function public.admin_preview_reset_workspace(uuid) to authenticated, service_role;
