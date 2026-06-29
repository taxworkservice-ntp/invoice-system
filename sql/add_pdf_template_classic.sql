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
--   1. Any NULL or empty pdf_template is normalized to 'modern'.
--   2. The column is forced to NOT NULL with a 'modern' default.
--   3. A CHECK constraint enforces the union at the DB level.
-- ============================================================

-- 1. Normalize existing NULL / empty values to 'modern' so the
--    NOT NULL + CHECK additions below don't fail on legacy rows.
update client_profiles
   set pdf_template = 'modern'
 where pdf_template is null
    or pdf_template = '';

-- 2. Force NOT NULL and set 'modern' as the column default for
--    future inserts that don't specify the field. Idempotent.
do $$
begin
  -- Force NOT NULL if the column is still nullable
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
  -- Set default if it isn't 'modern' already
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'client_profiles'
       and column_name = 'pdf_template'
       and column_default = '''modern''::text'
  ) then
    alter table client_profiles
      alter column pdf_template set default 'modern';
  end if;
end $$;

-- 3. Constrain the allowed values. Use DO $$ so the migration is
--    idempotent — safe to re-run if the constraint already exists.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'client_profiles_pdf_template_check'
  ) then
    alter table client_profiles
      add constraint client_profiles_pdf_template_check
        check (pdf_template in ('modern', 'classic'));
  end if;
end $$;

-- 4. Force PostgREST to reload its schema cache. After changing a
--    column's constraints (NOT NULL, default, CHECK), the PostgREST
--    layer can serve a stale schema description that mismatches the
--    actual table — causing read queries like
--    /rest/v1/client_profiles?user_id=eq.<uuid> to return 400.
--    NOTIFY pgrst, 'reload schema' asks PostgREST to refresh.
NOTIFY pgrst, 'reload schema';
