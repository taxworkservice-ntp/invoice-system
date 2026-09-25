-- Employee date of birth — required for the Thai SSO age-60 rule.
--
-- Rule (Social Security Act, Section 33): only hires aged 15–60 may newly
-- register. Someone already 60+ on their start date is never filed; someone
-- hired before 60 keeps filing normally past 60. The app evaluates age ON
-- start_date, so birthdate is the missing input. Nullable: legacy rows
-- backfill by hand; the app requires it for new hires and defaults to
-- covered (today's behavior) while it is missing.
--
-- Apply manually (Supabase SQL editor or Management API) per AGENTS.md.

alter table public.employees
  add column if not exists date_of_birth date;
