-- ============================================================
-- Classic V2: render item-table text in regular weight (opt-in).
-- Owner sets it in ตั้งค่า › เทมเพลตเอกสาร ("ตัวหนังสือปกติใน
-- ตารางรายการ"). Off (default) = today's look with bold headers
-- and amount cells.
--
-- Apply manually in Supabase SQL editor (per repo convention).
-- ============================================================

alter table public.client_profiles
  add column if not exists classic_v2_regular_item_font boolean not null default false;

-- Sanity check (existing rows backfill to false via the default)
select count(*) as clients_with_regular_item_font
from public.client_profiles
where classic_v2_regular_item_font is not null;
