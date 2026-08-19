-- Test-data migration for DL-2026-00039.
-- Installment inputs are pre-VAT: 200,000 / 300,000 / 500,000.
-- Gross = pre-VAT + VAT; WHT = pre-VAT x 3%; net cash = gross - WHT.
--
-- This intentionally updates issued test documents. Do not use this pattern
-- for production documents; production corrections must void and recreate.

begin;

alter table public.documents disable trigger trg_enforce_document_action_permission;

update public.documents
set
  subtotal = 200000,
  vat_amount = 14000,
  total_amount = 214000,
  wht_amount = 6000,
  net_payable = 208000,
  amount_received = 208000
where id = '1fa51b2f-11fc-43d3-ae79-97c536ed84cf'
  and doc_number = 'RC-2026-08-005';

update public.documents
set
  subtotal = 300000,
  vat_amount = 21000,
  total_amount = 321000,
  wht_amount = 9000,
  net_payable = 312000,
  amount_received = 312000
where id = '5f48217f-7d44-4959-9b8c-f2b68d44e04f'
  and doc_number = 'RC-2026-08-006';

update public.documents
set
  subtotal = 500000,
  vat_amount = 35000,
  total_amount = 535000,
  wht_amount = 15000,
  net_payable = 520000,
  amount_received = 520000
where id = 'eae3cec8-ca05-410f-b8af-5d1abf7fb194'
  and doc_number = 'RC-2026-08-007';

update public.receipt_invoices
set paid_amount = 208000
where receipt_id = '1fa51b2f-11fc-43d3-ae79-97c536ed84cf';

update public.receipt_invoices
set paid_amount = 312000
where receipt_id = '5f48217f-7d44-4959-9b8c-f2b68d44e04f';

update public.receipt_invoices
set paid_amount = 520000
where receipt_id = 'eae3cec8-ca05-410f-b8af-5d1abf7fb194';

update public.documents
set amount_received = 1040000,
    wht_amount = 30000,
    net_payable = 1040000
where id = '5b03a93e-35a4-4587-bd31-f25e264d6f10'
  and doc_number = 'BN-2026-08-004';

alter table public.documents enable trigger trg_enforce_document_action_permission;

commit;

-- Expected reconciliation:
-- pre-VAT 1,000,000 + VAT 70,000 = gross 1,070,000
-- gross 1,070,000 - WHT 30,000 = net cash 1,040,000
