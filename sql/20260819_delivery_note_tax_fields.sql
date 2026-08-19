-- Delivery notes are not tax documents: they carry no VAT/WHT liability.
-- Normalize any existing delivery notes that stored VAT/WHT/net-after-WHT amounts.
-- Reference value is the gross total; net_payable is kept equal to total for
-- display consistency (lists always surface total_amount for delivery notes).
--
-- The action-permission trigger blocks edits to issued documents outside the
-- app flow, and auth.uid() is null when run from the SQL editor. This is an
-- admin data backfill, so the trigger is temporarily disabled around it.
-- Requires table-owner / superuser privileges (dashboard SQL editor or postgres).

begin;

alter table public.documents disable trigger trg_enforce_document_action_permission;

UPDATE documents
SET vat_amount = 0,
    wht_amount = 0,
    net_payable = total_amount
WHERE doc_type = 'delivery_note'
  AND (vat_amount <> 0 OR wht_amount <> 0 OR net_payable IS DISTINCT FROM total_amount);

alter table public.documents enable trigger trg_enforce_document_action_permission;

commit;