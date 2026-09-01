-- Atomic admin reset: "Clear Documents & Numbering" (trial cleanup).
--
-- Replaces the old sequential JS deletes in
-- server/handlers/admin/clients/[id]/index.js (handleResetDocuments) with one
-- all-or-nothing transaction so a mid-way failure can never leave a client
-- half-wiped. The handler becomes a thin rpc() call.
--
-- Purpose: a trial client created mock deals/documents while keeping their
-- REAL customers and catalog. The reset wipes everything trial-related and
-- restarts numbering, but preserves setup data.
--
-- Steps inside one transaction:
--   1. Collect R2 object keys of document attachments (document_id not null,
--      so profile logos / non-document files are never touched). The DB rows
--      cascade away with documents; the caller deletes the R2 objects
--      best-effort AFTER this function commits.
--   2. Revert items.stock_count polluted by document-driven movements:
--      qty_base is signed (auto_out = negative, return_in = positive), and
--      only movements with document_id set are reverted, so the client's own
--      manual stock-ins/adjustments (document_id null) stay counted.
--      stock_value is recomputed from the unchanged avg_cost.
--   3. Delete all trial rows (order satisfies the ON DELETE RESTRICT FKs of
--      the junction tables): receipt_invoices, invoice_delivery_notes,
--      billing_note_invoices, document_line_items, stock_movements, deals
--      (cascades deal_activities), documents (cascades files rows),
--      wht_records. wht_vendors stay (master data).
--   4. Restart numbering: doc_number_sequences and deal_number_sequences
--      counters go back to 0. Config (prefix, start_sequence, reset_yearly)
--      is preserved.
--   5. Write an audit row into client_permission_audit so the existing admin
--      audit tab shows who cleared the workspace and what was removed.
--
-- Returns a jsonb summary (per-table delete counts, reverted item count,
-- r2 keys) used for the admin UI toast and the audit entry.

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
  --    Exact arithmetic (no clamp): movements mirror the deltas applied to
  --    the current stock, so removing them restores the pre-trial level.
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

  -- 3. Delete trial data (junction tables first: their FKs RESTRICT on
  --    documents; deals before documents: documents.deal_id is SET NULL)
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

  -- 4. Restart numbering (sequence config rows themselves are preserved)
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
