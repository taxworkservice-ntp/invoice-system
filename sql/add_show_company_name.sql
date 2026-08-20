-- ============================================================
-- MIGRATION: hide company name on print (Classic V2)
-- Adds:
--   client_profiles.show_company_name — when false, the company
--     name is hidden on the print header and the logo is used
--     as the main visual element instead.
-- ============================================================

alter table client_profiles add column if not exists show_company_name boolean not null default true;
