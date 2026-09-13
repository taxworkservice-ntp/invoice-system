-- ============================================================
-- Team & permissions hardening (professional access control)
--
-- 1. client_workspace_can v2: custom-role fallback (permissions merge:
--    member.permissions wins over client_roles.permissions, then role
--    defaults) + new canManagePayroll branch (manager default).
-- 2. Backfill: current managers get explicit canManagePayroll=true
--    (one-time; going forward the manager template grants it).
-- 3. is_workspace_owner(): the missing helper referenced by the
--    payroll_audit_log policy (writes currently always fail).
-- 4. payroll_line_items: add missing WITH CHECK to the client policy.
-- 5. enforce_line_item_draft_permission v2: close the INSERT-into-issued
--    gap (INSERTs into non-draft docs now need the send permission too).
-- 6. admin_reset_client_documents v2: in-function is_admin() check +
--    REVOKE FROM public/anon (mirrors the toggle_dev_mode lockdown).
-- 7. Admin payroll policies: FOR ALL (read+write, incl. audit delete)
--    → FOR SELECT read-only, like every other business table.
-- ============================================================

-- ------------------------------------------------------------
-- 1. client_workspace_can v2
-- ------------------------------------------------------------
create or replace function public.client_workspace_can(
  p_workspace_user_id uuid,
  p_permission text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_role text;
  member_permissions jsonb;
  custom_permissions jsonb;
  effective_permissions jsonb;
  override_value boolean;
begin
  -- Server-side calls (service role / no user JWT context) bypass action guards.
  -- Preserved from 20260822_service_role_bypass_action_permissions.sql:
  -- the admin API runs with the service-role key, which has no auth.uid().
  -- Unauthenticated callers can never reach triggers because RLS rejects
  -- their queries first.
  if auth.uid() is null then
    return true;
  end if;

  if public.client_workspace_role(p_workspace_user_id) = 'owner' then
    return true;
  end if;

  select m.role::text, m.permissions, r.permissions
    into member_role, member_permissions, custom_permissions
  from public.client_members m
  left join public.client_roles r
    on r.id = m.custom_role_id
   and r.workspace_user_id = m.workspace_user_id
  where m.workspace_user_id = p_workspace_user_id
    and m.member_user_id = auth.uid()
    and m.status = 'active';

  if member_role is null then
    return false;
  end if;

  -- Custom-role permissions are the base; per-member overrides win.
  effective_permissions :=
    coalesce(custom_permissions, '{}'::jsonb) || coalesce(member_permissions, '{}'::jsonb);

  if effective_permissions ? p_permission then
    override_value := nullif(effective_permissions ->> p_permission, '')::boolean;
    return coalesce(override_value, false);
  end if;

  return case p_permission
    when 'canCreateEditDocuments' then member_role in ('manager', 'officer')
    when 'canSendDocuments' then member_role = 'manager'
    when 'canSendQuotations' then member_role = 'manager'
    when 'canSendDeliveryNotes' then member_role = 'manager'
    when 'canSendFinancialDocuments' then member_role = 'manager'
    when 'canRecordPayments' then member_role = 'manager'
    when 'canVoidDocuments' then member_role = 'manager'
    when 'canDeleteDocuments' then false
    when 'canManagePayroll' then member_role = 'manager'
    when 'canManageWht' then member_role = 'manager'
    else false
  end;
end;
$$;

-- ------------------------------------------------------------
-- 2. One-time backfill: managers keep payroll access
-- ------------------------------------------------------------
update public.client_members
set permissions = coalesce(permissions, '{}'::jsonb) || '{"canManagePayroll": true}'::jsonb
where role = 'manager'
  and status = 'active'
  and coalesce((permissions ->> 'canManagePayroll')::boolean, false) = false;

-- ------------------------------------------------------------
-- 3. Missing is_workspace_owner() helper
-- ------------------------------------------------------------
create or replace function public.is_workspace_owner(p_workspace_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select public.client_workspace_role(p_workspace_user_id) = 'owner'
$$;

-- Re-create the audit policy against the now-existing helper
-- (creation previously failed / writes always errored).
drop policy if exists "Client manages workspace audit log" on public.payroll_audit_log;
create policy "Client manages workspace audit log"
  on public.payroll_audit_log for all
  using (public.is_client_workspace_member(user_id))
  with check (public.is_workspace_owner(user_id));

-- ------------------------------------------------------------
-- 4. payroll_line_items: missing WITH CHECK
-- ------------------------------------------------------------
drop policy if exists "Client manages workspace line items" on public.payroll_line_items;
create policy "Client manages workspace line items"
  on public.payroll_line_items for all
  using (
    public.is_client_workspace_member(
      (select user_id from public.payroll_runs where id = payroll_line_items.payroll_run_id)
    )
  )
  with check (
    public.is_client_workspace_member(
      (select user_id from public.payroll_runs where id = payroll_line_items.payroll_run_id)
    )
  );

-- ------------------------------------------------------------
-- 5. Line-item trigger: close INSERT-into-issued gap
-- ------------------------------------------------------------
create or replace function public.enforce_line_item_draft_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  document_user_id uuid;
  document_status text;
  document_type text;
begin
  select user_id, status::text, doc_type::text
    into document_user_id, document_status, document_type
  from public.documents
  where id = coalesce(new.document_id, old.document_id);

  if document_status = 'draft' then
    if not public.client_workspace_can(document_user_id, 'canCreateEditDocuments') then
      raise exception 'Only permitted users can edit draft line items';
    end if;
  elsif not public.client_workspace_can(document_user_id, public.document_type_permission(document_type)) then
    raise exception 'You do not have permission to edit line items of this document';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 6. admin_reset_client_documents: in-function auth + REVOKE
-- ------------------------------------------------------------
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
  -- the caller. Mirrors client_workspace_can(). Direct anon/public calls
  -- stay blocked by the REVOKE below.
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

-- ------------------------------------------------------------
-- 7. Admin payroll policies: ALL → SELECT (read-only, like the
--    rest of the business tables; the panel has no payroll UI and
--    server handlers use service_role).
-- ------------------------------------------------------------
drop policy if exists "Admin manages all employees" on public.employees;
create policy "Admin reads all employees"
  on public.employees for select
  using (public.is_admin());

drop policy if exists "Admin manages all payroll runs" on public.payroll_runs;
create policy "Admin reads all payroll runs"
  on public.payroll_runs for select
  using (public.is_admin());

drop policy if exists "Admin manages all line items" on public.payroll_line_items;
create policy "Admin reads all line items"
  on public.payroll_line_items for select
  using (public.is_admin());

drop policy if exists "Admin manages all payroll settings" on public.client_payroll_settings;
create policy "Admin reads all payroll settings"
  on public.client_payroll_settings for select
  using (public.is_admin());

drop policy if exists "Admin manages all audit log" on public.payroll_audit_log;
create policy "Admin reads all audit log"
  on public.payroll_audit_log for select
  using (public.is_admin());

drop policy if exists "Admin manages all recurring items" on public.payroll_recurring_items;
create policy "Admin reads all recurring items"
  on public.payroll_recurring_items for select
  using (public.is_admin());
