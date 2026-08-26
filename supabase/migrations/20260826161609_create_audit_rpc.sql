-- Create RPC function to query audit log (bypasses schema cache issues)
create or replace function get_audit_log(p_entity_type text, p_entity_id uuid)
returns table (
  id uuid,
  user_id uuid,
  action text,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz
)
language sql
security definer
as $$
  select id, user_id, action, entity_type, entity_id, details, created_at
  from payroll_audit_log
  where entity_type = p_entity_type and entity_id = p_entity_id
  order by created_at desc
  limit 50;
$$;

-- Also create a function to insert audit events
create or replace function log_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language sql
security definer
as $$
  insert into payroll_audit_log (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_details)
  returning id;
$$;
