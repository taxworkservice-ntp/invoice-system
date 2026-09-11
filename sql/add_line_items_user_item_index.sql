-- ============================================================
-- Speed up per-item price-history lookups ("ราคาที่เคยขาย"):
-- document_line_items filtered by (user_id, item_id), newest first.
-- ============================================================

create index if not exists idx_line_items_user_item_created
  on public.document_line_items (user_id, item_id, created_at desc);
