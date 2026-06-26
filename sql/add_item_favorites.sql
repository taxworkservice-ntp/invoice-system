-- ============================================================
-- MIGRATION: items.favorite
-- Adds is_favorite boolean to items for per-user favorites
-- ============================================================

alter table items
  add column if not exists is_favorite boolean not null default false;

-- Partial index for fast "favorites only" filtering
create index if not exists idx_items_favorite
  on items (user_id, is_favorite)
  where is_favorite = true;
