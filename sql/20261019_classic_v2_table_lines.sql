-- ============================================================
-- Classic V2: how much of the items table's inner grid is drawn.
--
--   all  = row separators + column rules (today's default)
--   rows = row separators only, no column rules
--   none = no inner lines at all — the header separator, the divide between
--          DN groups and the table frame still print
--
-- The column rules and the row separators are the two borders on the items
-- table's body cells, so the option is two border-colour switches; everything
-- else (frame, header underline, the DN group divider) is a separate rule and
-- is untouched.
--
-- Per workspace, like the other classic V2 print options. Note that turning the
-- row separators off also removes the "filled" ruled look of the empty rows
-- that pad a short document to the bottom of the page.
--
-- Apply manually (Supabase SQL editor or Management API).
-- ============================================================

alter table public.client_profiles
  add column if not exists classic_v2_table_lines text not null default 'all'
  check (classic_v2_table_lines in ('all', 'rows', 'none'));
