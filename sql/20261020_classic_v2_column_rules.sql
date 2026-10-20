-- ============================================================
-- Classic V2: run the items table's column rules through the merged band
-- rows (the DN group heading and the project heading).
--
-- The band rows are merged cells, so the column rules (the cell borders) stop
-- there. With this option the band row becomes a normal row: the heading text
-- sits in the description column and wraps there, and the four numeric cells
-- are empty but ruled — the grid runs through every row.
--
-- The heading text moves from the full band width (181mm) into the
-- description column (93mm), so a long heading takes more lines and the
-- pagination follows (the print height model charges the narrower width).
--
-- Per workspace, like the other classic V2 print options.
--
-- Apply manually (Supabase SQL editor or Management API).
-- ============================================================

alter table public.client_profiles
  add column if not exists classic_v2_column_rules_continuous boolean not null default false;
