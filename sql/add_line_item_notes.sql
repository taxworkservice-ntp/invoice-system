-- MIGRATION: document line item notes
-- Adds optional per-line notes for item-level remarks on printed documents.

alter table public.document_line_items
  add column if not exists line_note text;

notify pgrst, 'reload schema';
