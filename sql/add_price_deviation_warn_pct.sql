-- ============================================================
-- Configurable catalog-price deviation warning threshold.
-- Owner sets it in ตั้งค่า › รูปแบบเอกสาร ("แจ้งเตือนเมื่อราคา
-- ต่างจากแค็ตตาล็อกเกิน ___ %"). 0 = off, default 10%.
--
-- Apply manually in Supabase SQL editor (per repo convention).
-- ============================================================

alter table public.client_profiles
  add column if not exists price_deviation_warn_pct numeric(5,2) not null default 10.00;

-- Sanity check (existing rows backfill to 10 via the default)
select count(*) as clients_with_threshold
from public.client_profiles
where price_deviation_warn_pct is not null;
