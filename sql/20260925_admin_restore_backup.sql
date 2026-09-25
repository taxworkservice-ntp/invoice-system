-- Admin backup restore + retention.
--
-- admin_restore_backup(p_backup_id, p_actor_user_id, p_dry_run, p_acknowledge_data_loss)
--   Restores an admin_reset_backups payload written by reset-documents /
--   reset-all / client-deleted. Everything runs in ONE transaction.
--
--   Dry run (default) is read-only and returns a reconciliation report:
--     per-table {payload, current} counts, a newer-data warning (current
--     rows that the restore would replace), and the count of file rows
--     whose R2 bytes are gone for good (metadata is restored, attachment
--     bytes are NOT — R2 is never backed up, by design).
--
--   Execute mode replaces, per table present in the payload, current
--   workspace rows with the snapshot rows (original UUIDs preserved, so
--   billing graphs relink). Tables absent from the payload (e.g.
--   customers/items in a reset-documents backup) are left untouched.
--   Account rows (profiles/auth) are never restored and are reported as
--   skipped. If current rows would be replaced, the caller must pass
--   p_acknowledge_data_loss = true, otherwise the RPC raises.
--
--   Sequences are restored to their snapshot values (any newer documents
--   were wiped as part of the replace, so snapshot values are correct).
--
-- admin_prune_reset_backups(p_workspace_user_id, p_keep) keeps the newest
-- p_keep backups per workspace and deletes the rest. Returns pruned count.
--
-- Apply manually (Supabase SQL editor or Management API) per AGENTS.md.

-- ---------------------------------------------------------------------------
-- 1. Restore RPC (dry-run by default)
-- ---------------------------------------------------------------------------
create or replace function public.admin_restore_backup(
  p_backup_id            uuid,
  p_actor_user_id        uuid,
  p_dry_run              boolean default true,
  p_acknowledge_data_loss boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_backup    record;
  v_target    uuid;
  v_payload   jsonb;
  v_tables    text[] := array[
    'customers', 'items', 'deals', 'documents', 'document_line_items',
    'receipt_invoices', 'invoice_delivery_notes', 'billing_note_invoices',
    'stock_movements', 'wht_records', 'files', 'deal_activities',
    'doc_number_sequences', 'deal_number_sequences'
  ];
  v_tbl       text;
  v_report    jsonb := '[]'::jsonb;
  v_payload_n bigint;
  v_current_n bigint;
  v_has_newer boolean := false;
  v_files_r2  bigint := 0;
  v_summary   jsonb;
begin
  if auth.uid() is null then
    null;
  elsif not public.is_admin() then
    raise exception 'admin_restore_backup: admin only' using errcode = '42501';
  end if;

  select * into v_backup from public.admin_reset_backups where id = p_backup_id;
  if not found then
    raise exception 'Backup not found';
  end if;

  v_target := v_backup.workspace_user_id;
  v_payload := coalesce(v_backup.payload, '{}'::jsonb);

  if coalesce(v_payload->>'schema_version', '1') not in ('1', '2') then
    raise exception 'Unsupported backup schema version: %', v_payload->>'schema_version';
  end if;

  -- Per-table reconciliation: payload count vs live count.
  foreach v_tbl in array v_tables loop
    if not (v_payload ? v_tbl) then
      continue;
    end if;
    v_payload_n := coalesce(jsonb_array_length(v_payload->v_tbl), 0);
    if v_tbl = 'deal_activities' then
      select count(*) into v_current_n from public.deal_activities da
      where da.deal_id in (select dd.id from public.deals dd where dd.user_id = v_target);
    else
      execute format('select count(*) from public.%I where user_id = $1', v_tbl)
        into v_current_n using v_target;
    end if;
    if v_current_n > 0 then
      v_has_newer := true;
    end if;
    v_report := v_report || jsonb_build_object(
      'table', v_tbl, 'payload', v_payload_n, 'current', v_current_n
    );
  end loop;

  -- File rows whose R2 bytes are gone (metadata restores, bytes do not).
  if v_payload ? 'files' then
    select count(*) into v_files_r2
    from jsonb_to_recordset(v_payload->'files') as f(r2_key text)
    where f.r2_key is not null;
  end if;

  if p_dry_run then
    return jsonb_build_object(
      'dry_run', true,
      'backup_id', p_backup_id,
      'action', v_backup.action,
      'backup_created_at', v_backup.created_at,
      'reason', v_backup.reason,
      'tables', v_report,
      'newer_data_warning', v_has_newer,
      'files_without_bytes', v_files_r2,
      'skipped', jsonb_build_array('profiles', 'auth users (account rows are never restored)')
    );
  end if;

  if v_has_newer and not p_acknowledge_data_loss then
    raise exception 'Newer data would be replaced — acknowledge explicitly (p_acknowledge_data_loss)';
  end if;

  -- Execute: wipe-then-insert per payload table. Deletes run junctions/
  -- children first; inserts run parents first. Original UUIDs are
  -- preserved, so cross-table links survive intact.
  foreach v_tbl in array array[
    'receipt_invoices', 'invoice_delivery_notes', 'billing_note_invoices',
    'document_line_items', 'stock_movements', 'deal_activities',
    'files', 'wht_records', 'documents', 'deals',
    'customers', 'items', 'doc_number_sequences', 'deal_number_sequences'
  ] loop
    if not (v_payload ? v_tbl) then
      continue;
    end if;
    if v_tbl = 'deal_activities' then
      delete from public.deal_activities da
      where da.deal_id in (select dd.id from public.deals dd where dd.user_id = v_target);
    else
      execute format('delete from public.%I where user_id = $1', v_tbl) using v_target;
    end if;
  end loop;

  foreach v_tbl in array array[
    'customers', 'items', 'deals', 'documents', 'document_line_items',
    'receipt_invoices', 'invoice_delivery_notes', 'billing_note_invoices',
    'stock_movements', 'wht_records', 'files', 'deal_activities',
    'doc_number_sequences', 'deal_number_sequences'
  ] loop
    if not (v_payload ? v_tbl) then
      continue;
    end if;
    execute format(
      'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)',
      v_tbl, v_tbl
    ) using (v_payload->v_tbl);
  end loop;

  v_summary := jsonb_build_object(
    'backup_id', p_backup_id,
    'action', v_backup.action,
    'tables', v_report,
    'files_without_bytes', v_files_r2
  );

  insert into public.client_permission_audit (
    workspace_user_id, actor_user_id, target_member_id, action, before, after
  ) values (
    v_target, p_actor_user_id, null, 'backup.restored', v_report, v_summary
  );

  return v_summary || jsonb_build_object('dry_run', false);
end;
$$;

revoke all on function public.admin_restore_backup(uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.admin_restore_backup(uuid, uuid, boolean, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Retention: keep newest N backups per workspace
-- ---------------------------------------------------------------------------
create or replace function public.admin_prune_reset_backups(
  p_workspace_user_id uuid,
  p_keep              integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pruned bigint := 0;
begin
  if auth.uid() is null then
    null;
  elsif not public.is_admin() then
    raise exception 'admin_prune_reset_backups: admin only' using errcode = '42501';
  end if;

  if p_keep is null or p_keep < 1 then
    raise exception 'p_keep must be at least 1';
  end if;

  delete from public.admin_reset_backups
  where workspace_user_id = p_workspace_user_id
    and id not in (
      select id from public.admin_reset_backups
      where workspace_user_id = p_workspace_user_id
      order by created_at desc
      limit p_keep
    );
  get diagnostics v_pruned = row_count;

  return jsonb_build_object('pruned', v_pruned, 'kept', p_keep);
end;
$$;

revoke all on function public.admin_prune_reset_backups(uuid, integer) from public, anon;
grant execute on function public.admin_prune_reset_backups(uuid, integer) to authenticated, service_role;
