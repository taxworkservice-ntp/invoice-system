-- ============================================================
-- User-adjustable font size for the Classic V2 print template.
--
-- Adds a font-scale preset (small/normal/large/xlarge ->
-- 0.9x/1x/1.1x/1.2x) applied to the classic V2 template only.
-- Mirrors the existing client_profiles.signature_scale preset
-- pattern.
--
-- Run manually in the Supabase SQL editor.
-- ============================================================

alter table client_profiles
  add column if not exists classic_v2_font_scale text not null default 'normal';
