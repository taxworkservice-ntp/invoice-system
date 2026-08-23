-- MIGRATION: deal manual stage override + change audit logging
-- 1) Officers can override the derived deal stage (manual_stage).
-- 2) Changing a deal's customer or manual stage is logged into deal_activities
--    automatically via trigger, consistent with document activity logging.

alter table public.deals
  add column if not exists manual_stage text;

create or replace function public.log_deal_field_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_email text;
  actor_role_name text;
begin
  select coalesce(email, 'ผู้ใช้งาน') into actor_email
  from auth.users
  where id = auth.uid();

  actor_email := coalesce(actor_email, 'ผู้ใช้งาน');
  select coalesce(public.client_workspace_role(auth.uid()), 'officer')
    into actor_role_name;

  if old.manual_stage is distinct from new.manual_stage then
    insert into public.deal_activities (
      deal_id, user_id, actor_name, actor_role, event_type, description, metadata
    ) values (
      new.id,
      auth.uid(),
      actor_email,
      actor_role_name,
      'deal_stage_changed',
      case
        when new.manual_stage is null then 'รีเซ็ตสถานะดีลกลับเป็นอัตโนมัติ'
        else 'ตั้งค่าสถานะดีลเอง'
      end,
      jsonb_build_object(
        'from', old.manual_stage,
        'to', new.manual_stage
      )
    );
  end if;

  if old.customer_id is distinct from new.customer_id then
    insert into public.deal_activities (
      deal_id, user_id, actor_name, actor_role, event_type, description, metadata
    ) values (
      new.id,
      auth.uid(),
      actor_email,
      actor_role_name,
      'deal_customer_changed',
      'เปลี่ยนลูกค้าของงานขาย',
      jsonb_build_object(
        'from_customer', old.customer_id,
        'to_customer', new.customer_id
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_log_deal_field_activity on public.deals;
create trigger trg_log_deal_field_activity
  after update of manual_stage, customer_id on public.deals
  for each row execute function public.log_deal_field_activity();
