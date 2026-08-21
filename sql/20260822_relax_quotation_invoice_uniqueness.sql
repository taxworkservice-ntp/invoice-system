-- ============================================================
-- Relax quotation -> invoice uniqueness to support partial billing
-- (parity with the delivery-note flow).
--
-- BEFORE: a partial unique index allowed at most one active invoice per
--         quotation, so incremental billing from a quotation was impossible.
-- AFTER:  multiple partial invoices are allowed while the quotation is still
--         'sent'. A guard trigger blocks any new active invoice whose source
--         quotation is already fully billed ('converted').
--
-- Run manually in the Supabase SQL editor.
-- ============================================================

drop index if exists uq_documents_active_invoice_per_quotation;

create or replace function public.guard_invoice_per_quotation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_status text;
begin
  if new.doc_type = 'invoice'
     and new.converted_from_id is not null
     and new.status <> 'voided' then
    select status into v_source_status
      from public.documents
      where id = new.converted_from_id
        and user_id = new.user_id
        and doc_type = 'quotation';

    if v_source_status = 'converted' then
      raise exception 'ใบเสนอราคานี้ถูกออกใบแจ้งหนี้ครบแล้ว';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_invoice_per_quotation on public.documents;
create trigger trg_guard_invoice_per_quotation
  before insert or update of status, converted_from_id on public.documents
  for each row execute function public.guard_invoice_per_quotation();
