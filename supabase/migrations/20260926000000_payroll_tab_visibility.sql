-- Per-client payroll tab visibility (admin 3-state control).
-- Adds sub-keys refining the master "payroll" flag:
--   payroll_runs      -> รอบเงินเดือน (/payroll)
--   payroll_employees -> พนักงาน (/payroll/employees)
-- Read rule is fail-open (absent rows = both tabs visible), so no backfill
-- is needed: existing clients are unaffected until an admin configures them.
do $$
begin
  if exists (select from pg_tables where schemaname = 'public' and tablename = 'client_features') then
    alter table client_features drop constraint if exists client_features_feature_key_check;
    alter table client_features add constraint client_features_feature_key_check
      check (feature_key in ('service_job_details', 'classic_v2_template', 'dn_appendix', 'payroll', 'payroll_runs', 'payroll_employees'));
  end if;
end $$;
