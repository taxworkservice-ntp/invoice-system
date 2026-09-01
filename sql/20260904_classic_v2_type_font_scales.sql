-- ============================================================
-- Per-document-type font-size overrides for the Classic V2 template.
--
-- classic_v2_type_font_scales (jsonb): { [doc_type]: { section: preset } }
-- where section is one of 'global' | 'header' | 'items' | 'totals' |
-- 'footer' and preset is 'small'|'normal'|'large'|'xlarge'|'xxlarge'|
-- 'xxxlarge'. Unset/'inherit' values fall through to the workspace-level
-- section scales, then the global classic_v2_font_scale.
--
-- Run manually in the Supabase SQL editor.
-- ============================================================

alter table client_profiles
  add column if not exists classic_v2_type_font_scales jsonb default null;
