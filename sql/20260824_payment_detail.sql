-- ============================================================
-- 20260824b: payment reference details (cheque no / bank / date)
-- ============================================================

alter table public.documents
  add column if not exists payment_detail jsonb default null;

-- Optional verification:
-- select column_name, data_type from information_schema.columns
--   where table_name = 'documents' and column_name = 'payment_detail';
