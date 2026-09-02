-- Drop the ใบกำกับภาษี/ใบเสร็จรับเงิน (tax invoice/receipt) combined document.
--
-- The separate `tax_invoice_receipt` doc type is retired: a VAT invoice IS the
-- tax invoice, and payment is recorded on the invoice (status 'paid') instead
-- of a 2-in-1 document.
--
-- Existing tax_invoice_receipt documents become paid invoices — they keep
-- payment_method / paid_at / amount_received / payment_detail, so deal
-- financials treat them as collected. The enum value itself stays in the
-- database (Postgres cannot drop enum values) but the app no longer creates,
-- lists, or prints the type.
--
-- Run this whole file in the Supabase SQL editor.

update public.documents
set doc_type = 'invoice',
    status = 'paid'
where doc_type = 'tax_invoice_receipt'
  and status <> 'voided';
