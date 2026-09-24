-- Deal activity money trail: capture status transitions with money context.
--
-- Extends the metadata written by public.log_document_deal_activity() so the
-- owner monitoring feed can show a real money trail without extra queries:
--   - old_status: status before the change (new status is already in `status`)
--   - amount_before: money figure before the change (mirrors `amount` priority)
--   - voided_reason: reason given at void time (null otherwise)
--
-- Backwards compatible: old rows simply lack the new keys; readers must
-- treat them as optional.
--
-- APPLY MANUALLY in the Supabase SQL editor (sql/ migrations are not
-- auto-applied). Safe to re-run (create or replace + drop-if-exists trigger).

create or replace function public.log_document_deal_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_email text;
  actor_role_name text;
  activity_type text;
  activity_description text;
begin
  if coalesce(new.deal_id, old.deal_id) is null then
    return new;
  end if;

  select coalesce(email, 'ผู้ใช้งาน') into actor_email
  from auth.users
  where id = auth.uid();

  actor_email := coalesce(actor_email, 'ผู้ใช้งาน');
  select coalesce(public.client_workspace_role(coalesce(new.user_id, old.user_id)), 'officer')
    into actor_role_name;

  if tg_op = 'INSERT' then
    activity_type := 'document_created';
    activity_description := case
      when new.status = 'draft' then 'สร้างเอกสารฉบับร่าง'
      else 'สร้างเอกสารและออกเอกสาร'
    end;
  elsif old.status is distinct from new.status then
    activity_type := 'document_status_changed';
    activity_description := case new.status::text
      when 'sent' then 'ส่งเอกสารให้ลูกค้าแล้ว'
      when 'issued' then 'ออกเอกสารแล้ว'
      when 'paid' then 'บันทึกรับเงินครบแล้ว'
      when 'partially_paid' then 'บันทึกรับเงินบางส่วน'
      when 'generated' then 'สร้างใบเสร็จแล้ว'
      when 'voided' then 'ยกเลิกเอกสารแล้ว'
      when 'converted' then 'แปลงเอกสารแล้ว'
      else 'เปลี่ยนสถานะเอกสาร'
    end;
  else
    return new;
  end if;

  insert into public.deal_activities (
    deal_id,
    document_id,
    user_id,
    actor_name,
    actor_role,
    event_type,
    description,
    metadata
  ) values (
    coalesce(new.deal_id, old.deal_id),
    coalesce(new.id, old.id),
    auth.uid(),
    actor_email,
    actor_role_name,
    activity_type,
    activity_description,
    jsonb_build_object(
      'doc_type', coalesce(new.doc_type, old.doc_type)::text,
      'doc_number', coalesce(new.doc_number, old.doc_number),
      'status', coalesce(new.status, old.status)::text,
      'amount', coalesce(new.amount_received, new.net_payable, new.total_amount, old.amount_received, old.net_payable, old.total_amount),
      'old_status', case when tg_op = 'UPDATE' then old.status::text else null end,
      'amount_before', case when tg_op = 'UPDATE' then coalesce(old.amount_received, old.net_payable, old.total_amount) else null end,
      'voided_reason', new.voided_reason
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_log_document_deal_activity on public.documents;
create trigger trg_log_document_deal_activity
  after insert or update of status on public.documents
  for each row execute function public.log_document_deal_activity();
