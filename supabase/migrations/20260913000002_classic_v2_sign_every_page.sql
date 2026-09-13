-- Classic V2 per-page signature initials.
--
-- client_profiles.classic_v2_sign_every_page: print a compact
-- signature-initials strip at the bottom of every non-final page of
-- multi-page classic V2 documents (opt-in, default off — full signature
-- band stays on the last page only).

alter table public.client_profiles
  add column if not exists classic_v2_sign_every_page boolean not null default false;
