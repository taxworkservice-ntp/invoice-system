-- ============================================================
-- The quotation guard must not freeze an EXISTING invoice.
--
-- BEFORE: `trg_guard_invoice_per_quotation` fired on every
--   `update of status`, so an invoice whose source quotation was already
--   fully billed ('converted') could not change its status at all:
--   sent -> in_billing (behind a billing note) and -> paid / partially_paid
--   (the payment) were both rejected with
--   'ใบเสนอราคานี้ถูกออกใบแจ้งหนี้ครบแล้ว'.
--   The invoice-from-quotation flow always converts its source quotation,
--   so EVERY invoice made from a quotation was frozen — the billing note
--   could not be saved and the payment could not be recorded.
--
-- AFTER: the guard only rejects a NEW invoice (or one re-pointed at
--   another quotation) whose source quotation is already fully billed.
--   An invoice that already exists may move through the flow freely.
--
-- Run manually in the Supabase SQL editor.
-- ============================================================

create or replace function public.guard_invoice_per_quotation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_status text;
  v_check_source boolean;
begin
  if new.doc_type = 'invoice'
     and new.converted_from_id is not null
     and new.status <> 'voided' then
    -- Only the creation of an invoice is guarded. Once it exists it must be
    -- free to move: sent -> in_billing -> paid / partially_paid / overdue.
    -- An UPDATE that re-points `converted_from_id` is a creation in disguise.
    if tg_op = 'INSERT' then
      v_check_source := true;
    else
      v_check_source := (new.converted_from_id is distinct from old.converted_from_id);
    end if;

    if v_check_source then
      select status into v_source_status
        from public.documents
        where id = new.converted_from_id
          and user_id = new.user_id
          and doc_type = 'quotation';

      if v_source_status = 'converted' then
        raise exception 'ใบเสนอราคานี้ถูกออกใบแจ้งหนี้ครบแล้ว';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_invoice_per_quotation on public.documents;
create trigger trg_guard_invoice_per_quotation
  before insert or update of status, converted_from_id on public.documents
  for each row execute function public.guard_invoice_per_quotation();
