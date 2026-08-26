-- Create a view to trigger schema cache refresh
create or replace view audit_log_view as
select id, user_id, action, entity_type, entity_id, details, created_at
from payroll_audit_log;

-- Grant access
grant select on audit_log_view to anon, authenticated, service_role;
