-- ============================================================
-- MIGRATION: pdf_template — add 'classic' as a second option
--
-- Tightens client_profiles.pdf_template from a free-form string to
-- a constrained 'modern' | 'classic' union.
--
-- Modern is the default (preserves existing behavior). Classic is
-- opt-in via the Settings page "เทมเพลตใบ PDF" select.
--
-- This migration is non-breaking for existing rows:
--   1. Any NULL / empty / unknown pdf_template is normalized to
--      'modern' (and any value outside the union is also forced).
--   2. The column is forced to NOT NULL with a 'modern' default.
--   3. A CHECK constraint enforces the union at the DB level.
--   4. PostgREST's schema cache is force-reloaded.
--
-- RECOVERY: if the application starts returning 400 errors on
-- /rest/v1/client_profiles (GET or PATCH) after this migration,
-- run this single statement to refresh PostgREST's cache:
--     NOTIFY pgrst, 'reload schema';
-- ============================================================

-- 1. Normalize existing values to the allowed union. The WHERE
--    clause catches NULL, empty string, AND any unexpected value
--    (e.g. legacy 'light' / 'dark' strings) so the CHECK constraint
--    added in step 3 cannot fail on a legacy row.
update client_profiles
   set pdf_template = 'modern'
 where pdf_template is null
    or pdf_template = ''
    or pdf_template not in ('modern', 'classic');

-- 2. Force NOT NULL and set 'modern' as the column default for
--    future inserts that don't specify the field. Idempotent.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'client_profiles'
       and column_name = 'pdf_template'
       and is_nullable = 'YES'
  ) then
    alter table client_profiles
      alter column pdf_template set not null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'client_profiles'
       and column_name = 'pdf_template'
       and column_default is not null
     ) then
    alter table client_profiles
      alter column pdf_template set default 'modern';
  end if;
end $$;

-- 3. Constrain the allowed values. Idempotent.
--    Important: the original table definition already created a
--    CHECK constraint for "pdf_template = 'modern'", normally named
--    client_profiles_pdf_template_check. We must replace it, not skip
--    it, otherwise saving "classic" will keep failing with HTTP 400.
do $$
begin
  alter table client_profiles
    drop constraint if exists client_profiles_pdf_template_check;

  alter table client_profiles
    add constraint client_profiles_pdf_template_check
      check (pdf_template in ('modern', 'classic'));
end $$;

-- 4. Force PostgREST to reload its schema cache. After changing a
--    column's constraints (NOT NULL, default, CHECK), the PostgREST
--    layer can serve a stale schema description that mismatches the
--    actual table — causing /rest/v1/client_profiles GET or PATCH
--    to return 400 Bad Request even though the table itself is
--    valid. NOTIFY pgrst, 'reload schema' asks PostgREST to refresh.
NOTIFY pgrst, 'reload schema';
