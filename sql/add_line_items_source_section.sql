-- ============================================================
-- Frozen DN section index on invoice lines (Classic V2 per-section groups).
-- When an invoice is billed from a multi-section delivery note, each billed
-- line records which marker-led section of the source DN it came from
-- (0-based; NULL = ungrouped or pre-section lines). The invoice then prints
-- one group per section (DN number/date repeated, continuous numbering),
-- frozen at billing time — later DN edits never regroup issued invoices.
--
-- NULL keeps every legacy line on today's single-group path, so no backfill
-- is needed. Written app-side right after create_invoice_from_sources
-- (same pattern as the invoice_delivery_notes.so_header freeze) — the RPC
-- itself is untouched.
--
-- Apply manually in Supabase SQL editor (per repo convention), or via:
-- POST /v1/projects/{ref}/database/query (Management API).
-- ============================================================

alter table public.document_line_items
  add column if not exists source_section smallint null;

-- Sanity check (all existing rows stay NULL = legacy single-group path)
select count(*) as lines_with_section
from public.document_line_items
where source_section is not null;
