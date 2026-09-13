-- PDF cache invalidation via touch-triggers.
--
-- The server PDF endpoint (server/handlers/documents/[id]/pdf.js) caches
-- rendered PDFs in R2 (`pdfs/<userId>/<docId>/<variant>.pdf`) with a `files`
-- row per key, and serves the cache while `files.updated_at >=
-- documents.updated_at`. That comparison is only trustworthy if EVERYTHING
-- the renderer reads bumps the document's updated_at — but line items,
-- junction snapshots, customers, profiles, and bank accounts are written
-- directly without touching the parent document row.
--
-- These triggers close that gap at the database level (no app-code changes
-- needed on any write path). They are fail-safe by direction: an over-broad
-- touch only causes one slow re-render on next download, while a missed
-- touch would serve a stale invoice — so when in doubt we touch.
--
-- Render inputs covered (see src/lib/print.ts getPrintDocumentData):
--   documents row itself      → existing trg_documents_updated_at
--   document_line_items       → trigger 1 (snapshots rendered verbatim)
--   invoice_delivery_notes    → trigger 2 (invoice render reads rows live)
--   billing_note_invoices     → trigger 3 (receipt/BN render reads rows live)
--   receipt_invoices          → trigger 4 (receipt render reads rows live)
--   customers                 → trigger 5 (name/address/tax printed)
--   client_profiles           → trigger 6 (company info, logo, template, fonts)
--   bank_accounts             → trigger 7 (printed when selected on the doc)
--   downstream derivatives    → trigger 8 (receipts/BN embed source snapshots;
--                               editing a source re-renders its derivatives)

-- Supporting indexes: without these, triggers 7 and 8 would seq-scan the
-- whole documents table on every bank-account / document update.
create index if not exists idx_documents_bank_account
  on public.documents(bank_account_id);
create index if not exists idx_documents_converted_from
  on public.documents(converted_from_id);
create index if not exists idx_documents_copied_from
  on public.documents(copied_from_id);

-- Security definer so the touch bypasses RLS: the triggering statement
-- already passed its own table's policies; the parent document belongs to
-- the same workspace by FK.
create or replace function public.touch_document(p_document_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.documents set updated_at = now() where id = p_document_id;
$$;

-- 1. Line-item snapshots feed the items table verbatim.
create or replace function public.touch_document_on_line_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  v_ids := array_remove(array[coalesce(new.document_id, old.document_id)], null);
  if tg_op = 'UPDATE' and old.document_id is distinct from new.document_id then
    v_ids := array_append(v_ids, old.document_id);
  end if;
  perform public.touch_document(v_id) from unnest(v_ids) as v_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_touch_document_on_line_change on public.document_line_items;
create trigger trg_touch_document_on_line_change
  after insert or update or delete on public.document_line_items
  for each row execute function public.touch_document_on_line_change();

-- 2. Invoice ↔ delivery-note links (invoice render reads the rows live).
create or replace function public.touch_document_on_invoice_dn_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.touch_document(coalesce(new.invoice_id, old.invoice_id));
  if tg_op = 'UPDATE' and old.invoice_id is distinct from new.invoice_id then
    perform public.touch_document(old.invoice_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_touch_document_on_invoice_dn_link on public.invoice_delivery_notes;
create trigger trg_touch_document_on_invoice_dn_link
  after insert or update or delete on public.invoice_delivery_notes
  for each row execute function public.touch_document_on_invoice_dn_link();

-- 3. Billing-note ↔ invoice links (BN/receipt render reads the rows live).
create or replace function public.touch_document_on_bn_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.touch_document(coalesce(new.billing_note_id, old.billing_note_id));
  if tg_op = 'UPDATE' and old.billing_note_id is distinct from new.billing_note_id then
    perform public.touch_document(old.billing_note_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_touch_document_on_bn_link on public.billing_note_invoices;
create trigger trg_touch_document_on_bn_link
  after insert or update or delete on public.billing_note_invoices
  for each row execute function public.touch_document_on_bn_link();

-- 4. Receipt ↔ invoice links (receipt render reads the rows live).
create or replace function public.touch_document_on_receipt_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.touch_document(coalesce(new.receipt_id, old.receipt_id));
  if tg_op = 'UPDATE' and old.receipt_id is distinct from new.receipt_id then
    perform public.touch_document(old.receipt_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_touch_document_on_receipt_link on public.receipt_invoices;
create trigger trg_touch_document_on_receipt_link
  after insert or update or delete on public.receipt_invoices
  for each row execute function public.touch_document_on_receipt_link();

-- 5. Customer master data is printed on every document.
create or replace function public.touch_documents_on_customer_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.documents set updated_at = now() where customer_id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_touch_documents_on_customer_change on public.customers;
create trigger trg_touch_documents_on_customer_change
  after update on public.customers
  for each row execute function public.touch_documents_on_customer_change();

-- 6. Company profile (info, logo, template, fonts) affects every document.
create or replace function public.touch_documents_on_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.documents set updated_at = now() where user_id = new.user_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_documents_on_profile_change on public.client_profiles;
create trigger trg_touch_documents_on_profile_change
  after update on public.client_profiles
  for each row execute function public.touch_documents_on_profile_change();

-- 7. Bank account printed on the document when selected.
create or replace function public.touch_documents_on_bank_account_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.documents
  set updated_at = now()
  where bank_account_id = coalesce(new.id, old.id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_touch_documents_on_bank_account_change on public.bank_accounts;
create trigger trg_touch_documents_on_bank_account_change
  after update or delete on public.bank_accounts
  for each row execute function public.touch_documents_on_bank_account_change();

-- 8. Downstream derivatives embed source snapshots (converted_from /
-- copied_from chains): editing a source re-renders its derivatives.
-- Chains terminate (references form a DAG); self-references are excluded.
create or replace function public.touch_documents_on_source_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.documents
  set updated_at = now()
  where id <> new.id
    and (converted_from_id = new.id or copied_from_id = new.id);
  return new;
end;
$$;

drop trigger if exists trg_touch_documents_on_source_change on public.documents;
create trigger trg_touch_documents_on_source_change
  after update on public.documents
  for each row execute function public.touch_documents_on_source_change();
