-- ============================================================
-- PAYROLL — Audit Log
-- ============================================================

create table if not exists payroll_audit_log (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  action          text not null,
  entity_type     text not null,
  entity_id       uuid not null,
  details         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

drop index if exists idx_audit_log_user;
create index idx_audit_log_user on payroll_audit_log (user_id);
drop index if exists idx_audit_log_entity;
create index idx_audit_log_entity on payroll_audit_log (entity_type, entity_id);
drop index if exists idx_audit_log_created;
create index idx_audit_log_created on payroll_audit_log (created_at desc);
