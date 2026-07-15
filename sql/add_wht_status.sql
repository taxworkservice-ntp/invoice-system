-- Add status column to wht_records for done/active tracking
alter table wht_records
  add column if not exists status text not null default 'active'
  check (status in ('active', 'done'));
