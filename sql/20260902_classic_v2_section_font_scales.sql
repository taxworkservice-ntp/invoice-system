-- ============================================================
-- Per-section font-size overrides for the Classic V2 template.
--
-- classic_v2_section_font_scales (jsonb) holds optional section
-- presets keyed by section: {"header","items","totals","footer"}.
-- Values use the same presets as classic_v2_font_scale; "inherit"
-- (or a missing key) follows the global classic_v2_font_scale.
--
-- Run manually in the Supabase SQL editor.
-- ============================================================

alter table client_profiles
  add column if not exists classic_v2_section_font_scales jsonb default null;
