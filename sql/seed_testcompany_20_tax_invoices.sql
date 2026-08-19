-- ============================================================
-- SEED: DL-2026-00051 - 20 pure tax invoices -> 1 receipt
-- Run this in the Supabase SQL editor (as postgres / owner).
--
-- Exercises the limit of bundling many TAX INVOICES (doc_type
-- = 'invoice', vat_registered = true, prints as "ใบกำกับภาษี")
-- into a single billing note and settling them with ONE receipt.
--
-- Chain: 20 x INV-2026-08-008..027 -> BN-2026-08-010 -> RC-2026-08-020
--
-- Math: VAT 7%, WHT 3%, receipts stored on pre-VAT basis.
-- The document action-permission trigger is disabled around the
-- inserts and re-enabled at the end. Do not use for production.
-- ============================================================

begin;

-- ------------------------------------------------------------------
-- 0. Disable action-permission triggers first
-- ------------------------------------------------------------------
alter table public.documents disable trigger trg_enforce_document_action_permission;
alter table public.document_line_items disable trigger trg_enforce_line_item_draft_permission;

-- ------------------------------------------------------------------
-- 0a. Clean up any previous run of this seed (idempotent re-runs)
-- ------------------------------------------------------------------
delete from public.receipt_invoices
where receipt_id = '70000000-0000-4000-8000-000000000022';

delete from public.billing_note_invoices
where billing_note_id = '70000000-0000-4000-8000-000000000021';

delete from public.document_line_items
where document_id in (
  '70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002',
  '70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000004',
  '70000000-0000-4000-8000-000000000005','70000000-0000-4000-8000-000000000006',
  '70000000-0000-4000-8000-000000000007','70000000-0000-4000-8000-000000000008',
  '70000000-0000-4000-8000-000000000009','70000000-0000-4000-8000-000000000010',
  '70000000-0000-4000-8000-000000000011','70000000-0000-4000-8000-000000000012',
  '70000000-0000-4000-8000-000000000013','70000000-0000-4000-8000-000000000014',
  '70000000-0000-4000-8000-000000000015','70000000-0000-4000-8000-000000000016',
  '70000000-0000-4000-8000-000000000017','70000000-0000-4000-8000-000000000018',
  '70000000-0000-4000-8000-000000000019','70000000-0000-4000-8000-000000000020'
);

delete from public.documents
where id in (
  '70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002',
  '70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000004',
  '70000000-0000-4000-8000-000000000005','70000000-0000-4000-8000-000000000006',
  '70000000-0000-4000-8000-000000000007','70000000-0000-4000-8000-000000000008',
  '70000000-0000-4000-8000-000000000009','70000000-0000-4000-8000-000000000010',
  '70000000-0000-4000-8000-000000000011','70000000-0000-4000-8000-000000000012',
  '70000000-0000-4000-8000-000000000013','70000000-0000-4000-8000-000000000014',
  '70000000-0000-4000-8000-000000000015','70000000-0000-4000-8000-000000000016',
  '70000000-0000-4000-8000-000000000017','70000000-0000-4000-8000-000000000018',
  '70000000-0000-4000-8000-000000000019','70000000-0000-4000-8000-000000000020',
  '70000000-0000-4000-8000-000000000021','70000000-0000-4000-8000-000000000022'
);

delete from public.deals
where id = '70000000-0000-4000-8000-000000000001';

-- ============================================================
-- Deal DL-2026-00051
-- Customer: Blue Ocean Trading Co., Ltd.
-- ============================================================
insert into public.deals (id, user_id, customer_id, deal_number, title, is_active)
values (
  '70000000-0000-4000-8000-000000000001',
  '7871919e-e4d3-4467-a195-00e82e419f9e',
  '9721a63f-b048-4869-ab48-4633898c3874',
  'DL-2026-00051',
  'Monthly packaging supply - 20 tax invoices settled in one receipt',
  true
);

-- ------------------------------------------------------------------
-- 20 tax invoices (INV-2026-08-008 .. 027). All paid 2026-08-20 via
-- the billing note below (app sets linked invoices to 'paid' + paid_at
-- when the billing note is fully settled).
-- ------------------------------------------------------------------
insert into public.documents (
  id, user_id, deal_id, customer_id, doc_type, doc_number, status, issue_date, due_date,
  vat_registered, vat_rate, wht_rate, discount_percent, discount_amount,
  subtotal, vat_amount, total_amount, wht_amount, net_payable, note, hide_amounts_on_print,
  paid_at
) values
  ('70000000-0000-4000-8000-000000000001', '7871919e-e4d3-4467-a195-00e82e419f9e', '70000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'invoice', 'INV-2026-08-008', 'paid', '2026-08-01', '2026-09-01', true, 7, 3, 0, 0, 85000, 5950, 90950, 2550, 88400, 'Carton supply week 1 - batch 1', true, '2026-08-20T10:00:00Z'),
  ('70000000-0000-4000-8000-000000000002', '7871919e-e4d3-4467-a195-00e82e419f9e', '70000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'invoice', 'INV-2026-08-009', 'paid', '2026-08-02', '2026-09-02', true, 7, 3, 0, 0, 120000, 8400, 128400, 3600, 124800, 'Carton supply week 1 - batch 2', true, '2026-08-20T10:00:00Z'),
  ('70000000-0000-4000-8000-000000000003', '7871919e-e4d3-4467-a195-00e82e419f9e', '70000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'invoice', 'INV-2026-08-010', 'paid', '2026-08-03', '2026-09-03', true, 7, 3, 0, 0, 65000, 4550, 69550, 1950, 67600, 'Carton supply week 1 - batch 3', true, '2026-08-20T10:00:00Z'),
  ('70000000-0000-4000-8000-000000000004', '7871919e-e4d3-4467-a195-00e82e419f9e', '70000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'invoice', 'INV-2026-08-011', 'paid', '2026-08-04', '2026-09-04', true, 7, 3, 0, 0, 200000, 14000, 214000, 6000, 208000, 'Carton supply week 1 - batch 4', true, '2026-08-20T10:00:00Z'),
  ('70000000-0000-4000-8000-000000000005', '7871919e-e4d3-4467-a195-00e82e419f9e', '70000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'invoice', 'INV-2026-08-012', 'paid', '2026-08-05', '2026-09-05', true, 7, 3, 0, 0, 45000, 3150, 48150, 1350, 46800, 'Carton supply week 1 - batch 5', true, '2026-08-20T10:00:00Z'),
  ('70000000-0000-4000-8000-000000000006', '7871919e-e4d3-4467-a195-00e82e419f9e', '70000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'invoice', 'INV-2026-08-013', 'paid', '2026-08-06', '2026-09-06', true, 7, 3, 0, 0, 175000, 12250, 187250, 5250, 182000, 'Carton supply week 1 - batch 6', true, '2026-08-20T10:00:00Z'),
  ('70000000-0000-4000-8000-000000000007', '7871919e-e4d3-4467-a195-00e82e419f9e', '70000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'invoice', 'INV-2026-08-014', 'paid', '2026-08-07', '2026-09-07', true, 7, 3, 0, 0, 95000, 6650, 101650, 2850, 98800, 'Carton supply week 1 - batch 7', true, '2026-08-20T10:00:00Z'),
  ('70000000-0000-4000-8000-000000000008', '7871919e-e4d3-4467-a195-00e82e419f9e', '70000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'invoice', 'INV-2026-08-015', 'paid', '2026-08-08', '2026-09-08', true, 7, 3, 0, 0, 145000, 10150, 155150, 4350, 150800, 'Carton supply week 1 - batch 8', true, '2026-08-20T10:00:00Z'),
  ('70000000-0000-4000-8000-000000000009', '7871919e-e4d3-4467-a195-00e82e419f9e', '70000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'invoice', 'INV-2026-08-016', 'paid', '2026-08-09', '2026-09-09', true, 7, 3, 0, 0, 30000, 2100, 32100, 900, 31200, 'Carton supply week 1 - batch 9', true, '2026-08-20T10:00:00Z'),
  ('70000000-0000-4000-8000-000000000010', '7871919e-e4d3-4467-a195-00e82e419f9e', '70000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'invoice', 'INV-2026-08-017', 'paid', '2026-08-10', '2026-09-10', true, 7, 3, 0, 0, 210000, 14700, 224700, 6300, 218400, 'Carton supply week 1 - batch 10', true, '2026-08-20T10:00:00Z'),
  ('70000000-0000-4000-8000-000000000011', '7871919e-e4d3-4467-a195-00e82e419f9e', '70000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'invoice', 'INV-2026-08-018', 'paid', '2026-08-11', '2026-09-11', true, 7, 3, 0, 0, 75000, 5250, 80250, 2250, 78000, 'Carton supply week 2 - batch 1', true, '2026-08-20T10:00:00Z'),
  ('70000000-0000-4000-8000-000000000012', '7871919e-e4d3-4467-a195-00e82e419f9e', '70000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'invoice', 'INV-2026-08-019', 'paid', '2026-08-12', '2026-09-12', true, 7, 3, 0, 0, 185000, 12950, 197950, 5550, 192400, 'Carton supply week 2 - batch 2', true, '2026-08-20T10:00:00Z'),
  ('70000000-0000-4000-8000-000000000013', '7871919e-e4d3-4467-a195-00e82e419f9e', '70000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'invoice', 'INV-2026-08-020', 'paid', '2026-08-13', '2026-09-13', true, 7, 3, 0, 0, 55000, 3850, 58850, 1650, 57200, 'Carton supply week 2 - batch 3', true, '2026-08-20T10:00:00Z'),
  ('70000000-0000-4000-8000-000000000014', '7871919e-e4d3-4467-a195-00e82e419f9e', '70000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'invoice', 'INV-2026-08-021', 'paid', '2026-08-14', '2026-09-14', true, 7, 3, 0, 0, 160000, 11200, 171200, 4800, 166400, 'Carton supply week 2 - batch 4', true, '2026-08-20T10:00:00Z'),
  ('70000000-0000-4000-8000-000000000015', '7871919e-e4d3-4467-a195-00e82e419f9e', '70000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'invoice', 'INV-2026-08-022', 'paid', '2026-08-15', '2026-09-15', true, 7, 3, 0, 0, 90000, 6300, 96300, 2700, 93600, 'Carton supply week 2 - batch 5', true, '2026-08-20T10:00:00Z'),
  ('70000000-0000-4000-8000-000000000016', '7871919e-e4d3-4467-a195-00e82e419f9e', '70000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'invoice', 'INV-2026-08-023', 'paid', '2026-08-16', '2026-09-16', true, 7, 3, 0, 0, 230000, 16100, 246100, 6900, 239200, 'Carton supply week 2 - batch 6', true, '2026-08-20T10:00:00Z'),
  ('70000000-0000-4000-8000-000000000017', '7871919e-e4d3-4467-a195-00e82e419f9e', '70000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'invoice', 'INV-2026-08-024', 'paid', '2026-08-17', '2026-09-17', true, 7, 3, 0, 0, 120000, 8400, 128400, 3600, 124800, 'Carton supply week 2 - batch 7', true, '2026-08-20T10:00:00Z'),
  ('70000000-0000-4000-8000-000000000018', '7871919e-e4d3-4467-a195-00e82e419f9e', '70000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'invoice', 'INV-2026-08-025', 'paid', '2026-08-18', '2026-09-18', true, 7, 3, 0, 0, 68000, 4760, 72760, 2040, 70720, 'Carton supply week 2 - batch 8', true, '2026-08-20T10:00:00Z'),
  ('70000000-0000-4000-8000-000000000019', '7871919e-e4d3-4467-a195-00e82e419f9e', '70000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'invoice', 'INV-2026-08-026', 'paid', '2026-08-19', '2026-09-19', true, 7, 3, 0, 0, 195000, 13650, 208650, 5850, 202800, 'Carton supply week 2 - batch 9', true, '2026-08-20T10:00:00Z'),
  ('70000000-0000-4000-8000-000000000020', '7871919e-e4d3-4467-a195-00e82e419f9e', '70000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'invoice', 'INV-2026-08-027', 'paid', '2026-08-20', '2026-09-20', true, 7, 3, 0, 0, 88000, 6160, 94160, 2640, 91520, 'Carton supply week 2 - batch 10', true, '2026-08-20T10:00:00Z');

-- line items for each invoice
insert into public.document_line_items (document_id, user_id, item_id, item_name, item_sku, item_type, unit, unit_price, quantity, base_quantity, discount_percent, discount_amount, line_total, sort_order)
select d.id, d.user_id, null, d.note, 'CARTON-SUP-' || lpad(row_number() over (order by d.doc_number)::text, 2, '0'), 'product', 'piece', d.subtotal, 1, 1, 0, 0, d.subtotal, 1
from public.documents d
where d.deal_id = '70000000-0000-4000-8000-000000000001' and d.doc_type = 'invoice';

-- ------------------------------------------------------------------
-- 1 billing note bundling all 20 (BN-2026-08-010)
-- ------------------------------------------------------------------
insert into public.documents (
  id, user_id, deal_id, customer_id, doc_type, doc_number, status, issue_date, due_date,
  vat_registered, vat_rate, wht_rate, discount_percent, discount_amount,
  subtotal, vat_amount, total_amount, wht_amount, net_payable, note, hide_amounts_on_print,
  paid_at, amount_received
) values (
  '70000000-0000-4000-8000-000000000021', '7871919e-e4d3-4467-a195-00e82e419f9e',
  '70000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874',
  'billing_note', 'BN-2026-08-010', 'paid', '2026-08-20', '2026-09-05',
  true, 7, 3, 0, 0,
  2436000, 170520, 2606520, 73080, 2533440,
  'Consolidated billing for 20 August tax invoices', true,
  '2026-08-20T10:00:00Z', 2533440
);

insert into public.billing_note_invoices (billing_note_id, invoice_id, user_id, invoice_number, issue_date, subtotal, vat_amount, total_amount)
select '70000000-0000-4000-8000-000000000021', d.id, d.user_id, d.doc_number, d.issue_date, d.subtotal, d.vat_amount, d.total_amount
from public.documents d
where d.deal_id = '70000000-0000-4000-8000-000000000001' and d.doc_type = 'invoice'
order by d.doc_number;

-- ------------------------------------------------------------------
-- 1 receipt covering the whole billing note (RC-2026-08-020)
-- bank transfer -> Siam Commercial Bank
-- ------------------------------------------------------------------
insert into public.documents (
  id, user_id, deal_id, customer_id, doc_type, doc_number, status, issue_date,
  converted_from_id, vat_registered, vat_rate, wht_rate, discount_percent, discount_amount,
  subtotal, vat_amount, total_amount, wht_amount, net_payable, note, hide_amounts_on_print,
  payment_method, bank_account_id, wht_certificate_no, paid_at, amount_received
) values (
  '70000000-0000-4000-8000-000000000022', '7871919e-e4d3-4467-a195-00e82e419f9e',
  '70000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874',
  'receipt', 'RC-2026-08-020', 'generated', '2026-08-20',
  '70000000-0000-4000-8000-000000000021', true, 7, 3, 0, 0,
  2436000, 170520, 2606520, 73080, 2533440,
  'Full payment for consolidated billing of 20 tax invoices', true,
  'bank_transfer', '60000000-0000-4000-8000-000000000002', 'WHT-2026-08-201', '2026-08-20T10:00:00Z', 2533440
);

insert into public.receipt_invoices (receipt_id, invoice_id, source_billing_note_id, user_id, invoice_number, issue_date, subtotal, vat_amount, total_amount, paid_amount)
select '70000000-0000-4000-8000-000000000022', d.id, '70000000-0000-4000-8000-000000000021', d.user_id, d.doc_number, d.issue_date, d.subtotal, d.vat_amount, d.total_amount, d.net_payable
from public.documents d
where d.deal_id = '70000000-0000-4000-8000-000000000001' and d.doc_type = 'invoice'
order by d.doc_number;

-- ------------------------------------------------------------------
-- 1. Re-enable triggers
-- ------------------------------------------------------------------
alter table public.document_line_items enable trigger trg_enforce_line_item_draft_permission;
alter table public.documents enable trigger trg_enforce_document_action_permission;

-- ------------------------------------------------------------------
-- 2. Update numbering sequences so the next app-generated numbers
--    continue cleanly after the seeded ones
-- ------------------------------------------------------------------
update public.deal_number_sequences
set last_year = 2026, last_month = 0, last_sequence = 51
where user_id = '7871919e-e4d3-4467-a195-00e82e419f9e';

update public.doc_number_sequences
set last_year = 2026, last_month = 8, last_sequence = 27
where user_id = '7871919e-e4d3-4467-a195-00e82e419f9e' and doc_type = 'invoice';

update public.doc_number_sequences
set last_year = 2026, last_month = 8, last_sequence = 10
where user_id = '7871919e-e4d3-4467-a195-00e82e419f9e' and doc_type = 'billing_note';

update public.doc_number_sequences
set last_year = 2026, last_month = 8, last_sequence = 20
where user_id = '7871919e-e4d3-4467-a195-00e82e419f9e' and doc_type = 'receipt';

commit;

-- ============================================================
-- Verification queries (run after commit to sanity-check)
-- ============================================================
-- select d.deal_number, d.title,
--        count(doc.id) filter (where doc.doc_type = 'invoice') as invoices,
--        count(doc.id) filter (where doc.doc_type = 'billing_note') as billing_notes,
--        count(doc.id) filter (where doc.doc_type = 'receipt') as receipts
-- from public.deals d
-- left join public.documents doc on doc.deal_id = d.id
-- where d.deal_number = 'DL-2026-00051'
-- group by d.deal_number, d.title;

-- Expected reconciliation:
--   20 invoices, subtotal 2,436,000 / VAT 170,520 / total 2,606,520 / WHT 73,080 / net 2,533,440
--   BN-2026-08-010 net 2,533,440 == RC-2026-08-020 amount_received 2,533,440
--   Each receipt_invoices row links one invoice with paid_amount = invoice net_payable