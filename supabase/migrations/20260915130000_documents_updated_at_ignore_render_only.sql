-- Make documents.updated_at mean "row modified" again, immune to the PDF-cache
-- touch-triggers.
--
-- Context: 20260913000001_pdf_cache_invalidation.sql added AFTER-UPDATE touch
-- triggers (line items, profile, customer, bank account, derivatives) to
-- invalidate cached PDFs. 20260915120000_pdf_render_version.sql moved those
-- writes onto documents.render_updated_at so updated_at could go back to being
-- the user-facing "last edited".
--
-- The retarget was incomplete: the touch functions still run
--   UPDATE public.documents SET render_updated_at = now() ...
-- which is an UPDATE, so the generic BEFORE UPDATE trigger trg_documents_updated_at
-- (handle_updated_at) still fired and forced new.updated_at = now(). Two visible
-- consequences:
--   * the 20260915120000 backfill (UPDATE ... SET render_updated_at = updated_at)
--     stamped EVERY document with a single timestamp; and
--   * any profile/customer/bank/source change kept bulk-bumping every document's
--     updated_at afterwards.
-- The home "แก้ไขล่าสุด" column (max of deals.updated_at and the deal's latest
-- document.updated_at) therefore showed the same time on every deal row.
--
-- Fix: a documents-specific updated_at trigger that bumps updated_at only when a
-- column other than render_updated_at actually changes. Real edits still bump it;
-- render-only touches do not.
--
-- Historical bulk-stamped values are intentionally left as-is (true per-document
-- edit times are unrecoverable); they self-correct as documents are edited.
--
-- Applied manually (Supabase SQL editor / Management API). Idempotent.

create or replace function public.handle_document_updated_at()
returns trigger
language plpgsql
as $$
begin
  -- Ignore the render version: it is bumped on every touch for PDF-cache
  -- invalidation and must not move the user-facing "last edited" time.
  if (to_jsonb(new) - 'render_updated_at')
     is distinct from (to_jsonb(old) - 'render_updated_at') then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_documents_updated_at on public.documents;
create trigger trg_documents_updated_at
  before update on public.documents
  for each row execute function public.handle_document_updated_at();
