-- ============================================================
-- MIGRATION: shared pdf_* font-scale columns
--
-- Generalizes the Classic-V2 font-scale model into template-neutral
-- columns shared by Modern and Classic V2. ADDITIVE ONLY:
--   * new columns are added and backfilled from classic_v2_*;
--   * the classic_v2_* columns are NOT renamed or dropped, so the
--     currently-deployed code keeps working and rollback is instant.
--
-- A later cleanup migration may drop classic_v2_* once the new code
-- has been live and verified.
--
-- Applied MANUALLY (Supabase SQL editor or Management API) per
-- AGENTS.md. Safe to re-run (idempotent).
-- ============================================================

alter table client_profiles
  add column if not exists pdf_font_scale text not null default 'normal';
alter table client_profiles
  add column if not exists pdf_section_font_scales jsonb default null;
alter table client_profiles
  add column if not exists pdf_type_font_scales jsonb default null;

-- Backfill from the Classic V2 columns. Only rows with a non-default
-- Classic V2 value and an untouched pdf_* value are copied, so re-runs
-- and later edits are never clobbered.
update client_profiles
   set pdf_font_scale = classic_v2_font_scale
 where classic_v2_font_scale is not null
   and classic_v2_font_scale <> 'normal'
   and pdf_font_scale = 'normal';

update client_profiles
   set pdf_section_font_scales = classic_v2_section_font_scales
 where classic_v2_section_font_scales is not null
   and pdf_section_font_scales is null;

update client_profiles
   set pdf_type_font_scales = classic_v2_type_font_scales
 where classic_v2_type_font_scales is not null
   and pdf_type_font_scales is null;

notify pgrst, 'reload schema';
