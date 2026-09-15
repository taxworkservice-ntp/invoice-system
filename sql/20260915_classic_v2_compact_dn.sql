-- Classic V2: opt-in compact vertical spacing for delivery notes.
-- Reduces paddings/margins/line-height on DN printouts (header, info band,
-- item rows, group gaps) WITHOUT changing any font size, so more lines fit per
-- page. Scoped to delivery notes only; invoices/quotations are unaffected.
--
-- Applied manually (Supabase SQL editor or Management API) — this repo does not
-- auto-run sql/. Safe/idempotent to re-run.

alter table public.client_profiles
  add column if not exists classic_v2_compact_dn boolean not null default false;
