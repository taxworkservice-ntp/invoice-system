-- Fix admin_reset_client_documents v2: allow service_role bypass.
--
-- Root cause of 500 on "Clear all documents and numbering":
-- the v2 guard (20260911_team_permissions_hardening.sql) calls
-- public.is_admin(), which checks auth.uid(). The admin API handler
-- (server/handlers/admin/clients/[id]/index.js) calls this RPC with the
-- service-role key, which has NO auth.uid() — so is_admin() is always
-- false and every call raised 42501 'admin only', surfacing as a generic
-- 500. Direct anon/public calls stay blocked by the REVOKE below; the
-- handler enforces requireAdmin + requireClientTarget before reaching here.
-- Mirrors the service-role bypass already used in client_workspace_can().

create or replace function public.admin_reset_client_documents(
  p_target_user_id uuid,
  p_actor_user_id  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r2_keys        text[];
  v_documents      bigint := 0;
  v_deals          bigint := 0;
  v_line_items     bigint := 0;
  v_stock_moves    bigint := 0;
  v_wht_records    bigint := 0;
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

  -- 3. Delete trial data (junction tables first).
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

  -- 5. Summary + audit trail
  v_summary := jsonb_build_object(
    'documents_deleted',    v_documents,
    'deals_deleted',        v_deals,
    'line_items_deleted',   v_line_items,
    'stock_movements_deleted', v_stock_moves,
    'wht_records_deleted',  v_wht_records,
    'items_stock_restored', v_items_restored,
    'doc_sequences_reset',  v_doc_seq_reset,
    'deal_sequences_reset', v_deal_seq_reset,
    'r2_keys',              to_jsonb(v_r2_keys)
  );

  insert into public.client_permission_audit (
    workspace_user_id, actor_user_id, target_member_id, action, after
  ) values (
    p_target_user_id, p_actor_user_id, null, 'reset-documents', v_summary
  );

  return v_summary;
end;
$$;

revoke all on function public.admin_reset_client_documents(uuid, uuid) from public, anon;
grant execute on function public.admin_reset_client_documents(uuid, uuid) to authenticated, service_role;
