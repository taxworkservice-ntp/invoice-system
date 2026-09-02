-- ============================================================
-- Classic V2: repeat the full document header (logo, company info,
-- customer info band) on every page of multi-page documents instead of
-- the compact continuation strip.
--
-- Run manually in the Supabase SQL editor.
-- ============================================================

alter table client_profiles
  add column if not exists classic_v2_full_page_header boolean not null default false;
