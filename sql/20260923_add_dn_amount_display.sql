-- Default "amount display" mode for new delivery notes (company settings).
-- Values: 'full' | 'hidden' | 'blank'; NULL = ไม่กำหนด — the user must choose
-- on each delivery note. Adding the column with a default backfills existing
-- rows to 'hidden', preserving today's behaviour.
-- Applied manually (Supabase SQL editor / Management API).

alter table public.client_profiles
  add column if not exists delivery_note_amount_display text default 'hidden'
  check (delivery_note_amount_display in ('full', 'hidden', 'blank'));
