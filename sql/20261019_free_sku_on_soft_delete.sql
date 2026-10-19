-- Free an item's SKU when the item is hidden (soft-deleted).
--
-- Deleting an item in the catalog is a soft delete (`is_active = false`): the
-- row is kept so its stock ledger and the document lines that reference it
-- survive. The uniqueness rule, however, was created without looking at
-- `is_active` —
--
--   btree (user_id, lower(sku)) WHERE (sku IS NOT NULL)
--
-- — so a hidden item held its SKU forever: creating a new item with that SKU
-- failed with 23505 and the UI reported "SKU ซ้ำ" even though the item had been
-- removed from the catalog. Making the index partial on active rows frees the
-- SKU at the moment it is hidden, while still rejecting two *active* items with
-- the same SKU (case-insensitively) per workspace.
--
-- Note for a future restore feature: an active item may now hold a SKU that a
-- hidden item still carries, so restoring a hidden item has to check for that
-- (and either rename the restored item or refuse) — today there is no restore
-- path, and an ordinary edit never touches `is_active`.
--
-- Apply manually (Supabase SQL editor or Management API).

drop index if exists public.idx_items_user_sku_unique;

create unique index if not exists idx_items_user_sku_unique
  on public.items (user_id, lower(sku))
  where sku is not null and is_active;
