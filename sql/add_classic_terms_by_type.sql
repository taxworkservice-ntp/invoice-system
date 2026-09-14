-- ============================================================
-- Per-document-type closing-terms text (Classic V2 print templates read
-- one list per doc type instead of the single workspace-global text).
-- The map is seeded from today's global text so every previously issued
-- document reprints identically; owners then customize per type in
-- ตั้งค่า › รูปแบบเอกสาร. Empty string for a type = no terms on it.
-- The legacy client_profiles.classic_terms column stays, ignored.
--
-- Apply manually in Supabase SQL editor (per repo convention), or via:
-- POST /v1/projects/{ref}/database/query (Management API).
-- ============================================================

alter table public.client_profiles
  add column if not exists classic_terms_by_type jsonb null;

-- Seed: copy the current global text into every printing type
-- (delivery notes never print terms, so they get no slot).
update public.client_profiles
set classic_terms_by_type = jsonb_build_object(
  'quotation', classic_terms,
  'invoice', classic_terms,
  'billing_note', classic_terms,
  'receipt', classic_terms,
  'credit_note', classic_terms,
  'debit_note', classic_terms
)
where classic_terms_by_type is null
  and classic_terms is not null
  and btrim(classic_terms) <> '';

-- Sanity check
select count(*) as clients_with_typed_terms
from public.client_profiles
where classic_terms_by_type is not null;
