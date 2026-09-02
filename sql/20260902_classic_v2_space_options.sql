-- Classic V2 vertical-space options (self-contained).
-- client_profiles.classic_v2_hide_english_labels: hide EN sub-labels
--   (thead, meta, totals, signatures) on printed classic V2 documents.
-- client_profiles.classic_v2_compact_signature: compact signature band
--   (single-line titles, merged date line, reduced fill heights).
-- Run this whole file in the Supabase SQL editor.

alter table public.client_profiles
  add column if not exists classic_v2_hide_english_labels boolean not null default false;

alter table public.client_profiles
  add column if not exists classic_v2_compact_signature boolean not null default false;
