-- ============================================================
-- MIGRATION: retire the Classic v1 PDF template
--
-- Leaves only 'modern' and 'classic_v2'. Supersedes
-- sql/add_pdf_template_classic.sql (which must not be re-run: it
-- would re-widen the CHECK to include 'classic').
--
-- Remap is feature-aware so no workspace ends up in an unsupported
-- state (pdf_template='classic_v2' while the classic_v2_template
-- feature is disabled):
--   * classic + classic_v2_template enabled  -> classic_v2
--   * classic + feature disabled             -> modern
--
-- Applied MANUALLY (Supabase SQL editor or Management API) per
-- AGENTS.md. Safe to re-run (idempotent).
-- ============================================================

-- 1. Workspaces that can actually use Classic V2 keep a classic look.
update client_profiles p
   set pdf_template = 'classic_v2'
 where p.pdf_template = 'classic'
   and exists (
     select 1
       from client_features f
      where f.user_id = p.user_id
        and f.feature_key = 'classic_v2_template'
        and f.enabled
   );

-- 2. Everyone else falls back to Modern.
update client_profiles
   set pdf_template = 'modern'
 where pdf_template = 'classic';

-- 3. Tighten the allowed union to the two remaining templates.
alter table client_profiles drop constraint if exists client_profiles_pdf_template_check;
alter table client_profiles add constraint client_profiles_pdf_template_check
  check (pdf_template in ('modern', 'classic_v2'));

-- 4. Refresh PostgREST's cached schema after the constraint change.
notify pgrst, 'reload schema';
