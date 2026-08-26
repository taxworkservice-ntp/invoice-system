-- ============================================================
-- 20260825: DN appendix print option
-- ============================================================

alter table public.documents
  add column if not exists dn_appendix boolean not null default false;

-- Verification:
-- select column_name, data_type, column_default from information_schema.columns
--   where table_name = 'documents' and column_name = 'dn_appendix';
