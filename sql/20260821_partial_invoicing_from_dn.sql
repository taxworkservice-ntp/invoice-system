-- Partial invoicing from delivery notes.
-- A delivery note may now be billed across several invoices (bill part of the
-- delivered quantity now, the remainder later). Therefore the constraint that
-- allowed only ONE active invoice per delivery note must be removed.
-- Billed-vs-remaining is tracked at the application level by summing invoice
-- line items that reference each delivery-note line (source_line_item_id /
-- source_document_id), so no new columns are required.

drop index if exists public.idx_idn_one_active_invoice_per_dn;
