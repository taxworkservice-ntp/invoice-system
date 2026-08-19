-- ============================================================
-- SEED: Realistic scenarios for testcompany@gmail.com
-- Run this in the Supabase SQL editor (as postgres / owner).
--
-- Creates 5 deals with full document chains that exercise real
-- workflows and stress the limits:
--   DL-2026-00044  10 tax invoices -> 1 billing note -> 1 receipt
--   DL-2026-00045  1 tax invoice -> 3 installment receipts
--   DL-2026-00046  Partially paid + outstanding balance (overdue)
--   DL-2026-00047  Quotation -> converted invoice -> receipt
--   DL-2026-00048  3 delivery notes -> 1 tax invoice -> 1 receipt
--
-- Math: VAT 7%, WHT 3%, receipts stored on pre-VAT basis.
-- The document action-permission trigger is disabled around the
-- inserts (same pattern as the other test-data migrations) and
-- re-enabled at the end. Do not use this pattern for production.
-- ============================================================

begin;

-- ------------------------------------------------------------------
-- 0. Disable action-permission triggers first (they block insert AND
--    delete of issued docs when auth.uid() is null in the SQL editor)
-- ------------------------------------------------------------------
alter table public.documents disable trigger trg_enforce_document_action_permission;
alter table public.document_line_items disable trigger trg_enforce_line_item_draft_permission;

-- ------------------------------------------------------------------
-- 0a. Clean up any previous run of this seed (idempotent re-runs)
-- ------------------------------------------------------------------
delete from public.invoice_delivery_notes
where invoice_id in (
  '11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002',
  '11000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000004',
  '11000000-0000-4000-8000-000000000005','11000000-0000-4000-8000-000000000006',
  '11000000-0000-4000-8000-000000000007','11000000-0000-4000-8000-000000000008',
  '11000000-0000-4000-8000-000000000009','11000000-0000-4000-8000-000000000010',
  '22000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001',
  '44000000-0000-4000-8000-000000000002','55000000-0000-4000-8000-000000000004'
) or delivery_note_id in (
  '55000000-0000-4000-8000-000000000001','55000000-0000-4000-8000-000000000002',
  '55000000-0000-4000-8000-000000000003'
);

delete from public.receipt_invoices
where receipt_id in (
  '11000000-0000-4000-8000-000000000012','22000000-0000-4000-8000-000000000002',
  '22000000-0000-4000-8000-000000000003','22000000-0000-4000-8000-000000000004',
  '33000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-000000000003',
  '55000000-0000-4000-8000-000000000005'
);

delete from public.billing_note_invoices
where billing_note_id in (
  '11000000-0000-4000-8000-000000000011'
);

delete from public.document_line_items
where document_id in (
  '11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002',
  '11000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000004',
  '11000000-0000-4000-8000-000000000005','11000000-0000-4000-8000-000000000006',
  '11000000-0000-4000-8000-000000000007','11000000-0000-4000-8000-000000000008',
  '11000000-0000-4000-8000-000000000009','11000000-0000-4000-8000-000000000010',
  '22000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001',
  '44000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000002',
  '55000000-0000-4000-8000-000000000001','55000000-0000-4000-8000-000000000002',
  '55000000-0000-4000-8000-000000000003','55000000-0000-4000-8000-000000000004'
);

delete from public.documents
where id in (
  '11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002',
  '11000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000004',
  '11000000-0000-4000-8000-000000000005','11000000-0000-4000-8000-000000000006',
  '11000000-0000-4000-8000-000000000007','11000000-0000-4000-8000-000000000008',
  '11000000-0000-4000-8000-000000000009','11000000-0000-4000-8000-000000000010',
  '11000000-0000-4000-8000-000000000011','11000000-0000-4000-8000-000000000012',
  '22000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002',
  '22000000-0000-4000-8000-000000000003','22000000-0000-4000-8000-000000000004',
  '33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000002',
  '44000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000002',
  '44000000-0000-4000-8000-000000000003',
  '55000000-0000-4000-8000-000000000001','55000000-0000-4000-8000-000000000002',
  '55000000-0000-4000-8000-000000000003','55000000-0000-4000-8000-000000000004',
  '55000000-0000-4000-8000-000000000005'
);

delete from public.deals
where id in (
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-000000000004',
  '50000000-0000-4000-8000-000000000005'
);

-- ------------------------------------------------------------------
-- 0b. Extra bank accounts so bank-transfer receipts hit real accounts
-- ------------------------------------------------------------------
insert into public.bank_accounts (id, user_id, bank_name, account_number, account_holder_name, is_primary, is_active, sort_order)
values
  ('60000000-0000-4000-8000-000000000001', '7871919e-e4d3-4467-a195-00e82e419f9e', 'Bangkok Bank', '154-8-23456-7', 'บริษัท เทสท์ คอมพานี จำกัด', false, true, 1),
  ('60000000-0000-4000-8000-000000000002', '7871919e-e4d3-4467-a195-00e82e419f9e', 'Siam Commercial Bank', '045-2-98765-4', 'บริษัท เทสท์ คอมพานี จำกัด', false, true, 2)
on conflict (id) do nothing;

-- ============================================================
-- SCENARIO 1: DL-2026-00044
-- 10 tax invoices -> 1 billing note -> 1 receipt
-- Customer: Blue Ocean Trading Co., Ltd.
-- ============================================================
insert into public.deals (id, user_id, customer_id, deal_number, title, is_active)
values (
  '10000000-0000-4000-8000-000000000001',
  '7871919e-e4d3-4467-a195-00e82e419f9e',
  '9721a63f-b048-4869-ab48-4633898c3874',
  'DL-2026-00044',
  'Monthly packaging supply - bulk consolidated billing',
  true
);

-- 10 tax invoices (TIR-2026-08-001 .. 010). All paid on 2026-08-19 via the billing note.
insert into public.documents (
  id, user_id, deal_id, customer_id, doc_type, doc_number, status, issue_date,
  vat_registered, vat_rate, wht_rate, discount_percent, discount_amount,
  subtotal, vat_amount, total_amount, wht_amount, net_payable, note, hide_amounts_on_print,
  paid_at
) values
  ('11000000-0000-4000-8000-000000000001', '7871919e-e4d3-4467-a195-00e82e419f9e', '10000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'tax_invoice_receipt', 'TIR-2026-08-001', 'paid', '2026-08-03', true, 7, 3, 0, 0, 250000, 17500, 267500, 7500, 260000, 'Corrugated board batch 1', true, '2026-08-19T10:00:00Z'),
  ('11000000-0000-4000-8000-000000000002', '7871919e-e4d3-4467-a195-00e82e419f9e', '10000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'tax_invoice_receipt', 'TIR-2026-08-002', 'paid', '2026-08-05', true, 7, 3, 0, 0, 180000, 12600, 192600, 5400, 187200, 'Carton boxes batch 2', true, '2026-08-19T10:00:00Z'),
  ('11000000-0000-4000-8000-000000000003', '7871919e-e4d3-4467-a195-00e82e419f9e', '10000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'tax_invoice_receipt', 'TIR-2026-08-003', 'paid', '2026-08-07', true, 7, 3, 0, 0, 320000, 22400, 342400, 9600, 332800, 'Heavy-duty carton batch 3', true, '2026-08-19T10:00:00Z'),
  ('11000000-0000-4000-8000-000000000004', '7871919e-e4d3-4467-a195-00e82e419f9e', '10000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'tax_invoice_receipt', 'TIR-2026-08-004', 'paid', '2026-08-08', true, 7, 3, 0, 0, 95000, 6650, 101650, 2850, 98800, 'Pallet batch 4', true, '2026-08-19T10:00:00Z'),
  ('11000000-0000-4000-8000-000000000005', '7871919e-e4d3-4467-a195-00e82e419f9e', '10000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'tax_invoice_receipt', 'TIR-2026-08-005', 'paid', '2026-08-10', true, 7, 3, 0, 0, 420000, 29400, 449400, 12600, 436800, 'Foam sheet batch 5', true, '2026-08-19T10:00:00Z'),
  ('11000000-0000-4000-8000-000000000006', '7871919e-e4d3-4467-a195-00e82e419f9e', '10000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'tax_invoice_receipt', 'TIR-2026-08-006', 'paid', '2026-08-12', true, 7, 3, 0, 0, 75000, 5250, 80250, 2250, 78000, 'Stretch film batch 6', true, '2026-08-19T10:00:00Z'),
  ('11000000-0000-4000-8000-000000000007', '7871919e-e4d3-4467-a195-00e82e419f9e', '10000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'tax_invoice_receipt', 'TIR-2026-08-007', 'paid', '2026-08-14', true, 7, 3, 0, 0, 265000, 18550, 283550, 7950, 275600, 'Edge protector batch 7', true, '2026-08-19T10:00:00Z'),
  ('11000000-0000-4000-8000-000000000008', '7871919e-e4d3-4467-a195-00e82e419f9e', '10000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'tax_invoice_receipt', 'TIR-2026-08-008', 'paid', '2026-08-16', true, 7, 3, 0, 0, 150000, 10500, 160500, 4500, 156000, 'Stretch film batch 8', true, '2026-08-19T10:00:00Z'),
  ('11000000-0000-4000-8000-000000000009', '7871919e-e4d3-4467-a195-00e82e419f9e', '10000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'tax_invoice_receipt', 'TIR-2026-08-009', 'paid', '2026-08-17', true, 7, 3, 0, 0, 340000, 23800, 363800, 10200, 353600, 'Carton box batch 9', true, '2026-08-19T10:00:00Z'),
  ('11000000-0000-4000-8000-000000000010', '7871919e-e4d3-4467-a195-00e82e419f9e', '10000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874', 'tax_invoice_receipt', 'TIR-2026-08-010', 'paid', '2026-08-18', true, 7, 3, 0, 0, 205000, 14350, 219350, 6150, 213200, 'Custom packaging batch 10', true, '2026-08-19T10:00:00Z');

insert into public.document_line_items (document_id, user_id, item_id, item_name, item_sku, item_type, unit, unit_price, quantity, base_quantity, discount_percent, discount_amount, line_total, sort_order)
select d.id, d.user_id, null, d.note, 'SEED-' || lpad(row_number() over (order by d.doc_number)::text, 2, '0'), 'product', 'piece', d.subtotal, 1, 1, 0, 0, d.subtotal, 1
from public.documents d
where d.deal_id = '10000000-0000-4000-8000-000000000001' and d.doc_type = 'tax_invoice_receipt';

-- 1 billing note bundling all 10
insert into public.documents (
  id, user_id, deal_id, customer_id, doc_type, doc_number, status, issue_date, due_date,
  vat_registered, vat_rate, wht_rate, discount_percent, discount_amount,
  subtotal, vat_amount, total_amount, wht_amount, net_payable, note, hide_amounts_on_print,
  paid_at, amount_received
) values (
  '11000000-0000-4000-8000-000000000011', '7871919e-e4d3-4467-a195-00e82e419f9e',
  '10000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874',
  'billing_note', 'BN-2026-08-009', 'paid', '2026-08-18', '2026-08-25',
  true, 7, 3, 0, 0,
  2300000, 161000, 2461000, 69000, 2392000,
  'Consolidated billing for August deliveries', true,
  '2026-08-19T10:00:00Z', 2392000
);

insert into public.billing_note_invoices (billing_note_id, invoice_id, user_id, invoice_number, issue_date, subtotal, vat_amount, total_amount)
select '11000000-0000-4000-8000-000000000011', d.id, d.user_id, d.doc_number, d.issue_date, d.subtotal, d.vat_amount, d.total_amount
from public.documents d
where d.deal_id = '10000000-0000-4000-8000-000000000001' and d.doc_type = 'tax_invoice_receipt'
order by d.doc_number;

-- 1 receipt covering the whole billing note (bank transfer -> Bangkok Bank)
insert into public.documents (
  id, user_id, deal_id, customer_id, doc_type, doc_number, status, issue_date,
  converted_from_id, vat_registered, vat_rate, wht_rate, discount_percent, discount_amount,
  subtotal, vat_amount, total_amount, wht_amount, net_payable, note, hide_amounts_on_print,
  payment_method, bank_account_id, wht_certificate_no, paid_at, amount_received
) values (
  '11000000-0000-4000-8000-000000000012', '7871919e-e4d3-4467-a195-00e82e419f9e',
  '10000000-0000-4000-8000-000000000001', '9721a63f-b048-4869-ab48-4633898c3874',
  'receipt', 'RC-2026-08-013', 'generated', '2026-08-19',
  '11000000-0000-4000-8000-000000000011', true, 7, 3, 0, 0,
  2300000, 161000, 2461000, 69000, 2392000,
  'Full payment for consolidated August billing', true,
  'bank_transfer', '60000000-0000-4000-8000-000000000001', 'WHT-2026-08-101', '2026-08-19T10:00:00Z', 2392000
);

insert into public.receipt_invoices (receipt_id, invoice_id, source_billing_note_id, user_id, invoice_number, issue_date, subtotal, vat_amount, total_amount, paid_amount)
select '11000000-0000-4000-8000-000000000012', d.id, '11000000-0000-4000-8000-000000000011', d.user_id, d.doc_number, d.issue_date, d.subtotal, d.vat_amount, d.total_amount, d.net_payable
from public.documents d
where d.deal_id = '10000000-0000-4000-8000-000000000001' and d.doc_type = 'tax_invoice_receipt'
order by d.doc_number;

-- ============================================================
-- SCENARIO 2: DL-2026-00045
-- 1 tax invoice -> 3 installment receipts (pre-VAT 400k/350k/250k)
-- Customer: Pacific Tech Solutions Ltd.
-- ============================================================
insert into public.deals (id, user_id, customer_id, deal_number, title, is_active)
values (
  '20000000-0000-4000-8000-000000000002',
  '7871919e-e4d3-4467-a195-00e82e419f9e',
  'b7087f73-e626-4838-8add-9c0d75b07616',
  'DL-2026-00045',
  'IT equipment packaging - installment payment plan',
  true
);

insert into public.documents (
  id, user_id, deal_id, customer_id, doc_type, doc_number, status, issue_date, due_date,
  vat_registered, vat_rate, wht_rate, discount_percent, discount_amount,
  subtotal, vat_amount, total_amount, wht_amount, net_payable, note, hide_amounts_on_print,
  paid_at, amount_received
) values (
  '22000000-0000-4000-8000-000000000001', '7871919e-e4d3-4467-a195-00e82e419f9e',
  '20000000-0000-4000-8000-000000000002', 'b7087f73-e626-4838-8add-9c0d75b07616',
  'tax_invoice_receipt', 'TIR-2026-08-011', 'paid', '2026-08-05', '2026-09-05',
  true, 7, 3, 0, 0,
  1000000, 70000, 1070000, 30000, 1040000,
  'Enterprise packaging supply - payable in 3 installments', true,
  '2026-08-19T12:00:00Z', 1040000
);

insert into public.document_line_items (document_id, user_id, item_id, item_name, item_sku, item_type, unit, unit_price, quantity, base_quantity, discount_percent, discount_amount, line_total, sort_order)
values
  ('22000000-0000-4000-8000-000000000001', '7871919e-e4d3-4467-a195-00e82e419f9e', null, 'Custom shipping crate', 'CRATE-XL', 'product', 'piece', 200, 5000, 5000, 0, 0, 1000000, 1);

-- Installment 1: cash 400,000 pre-VAT
insert into public.documents (
  id, user_id, deal_id, customer_id, doc_type, doc_number, status, issue_date,
  converted_from_id, vat_registered, vat_rate, wht_rate, discount_percent, discount_amount,
  subtotal, vat_amount, total_amount, wht_amount, net_payable, note, hide_amounts_on_print,
  payment_method, wht_certificate_no, paid_at, amount_received
) values (
  '22000000-0000-4000-8000-000000000002', '7871919e-e4d3-4467-a195-00e82e419f9e',
  '20000000-0000-4000-8000-000000000002', 'b7087f73-e626-4838-8add-9c0d75b07616',
  'receipt', 'RC-2026-08-014', 'generated', '2026-08-08',
  '22000000-0000-4000-8000-000000000001', true, 7, 3, 0, 0,
  400000, 28000, 428000, 12000, 416000, 'Installment 1/3', true,
  'cash', 'WHT-2026-08-102', '2026-08-08T10:00:00Z', 416000
);

-- Installment 2: bank transfer 350,000 pre-VAT -> Kasikorn
insert into public.documents (
  id, user_id, deal_id, customer_id, doc_type, doc_number, status, issue_date,
  converted_from_id, vat_registered, vat_rate, wht_rate, discount_percent, discount_amount,
  subtotal, vat_amount, total_amount, wht_amount, net_payable, note, hide_amounts_on_print,
  payment_method, bank_account_id, wht_certificate_no, paid_at, amount_received
) values (
  '22000000-0000-4000-8000-000000000003', '7871919e-e4d3-4467-a195-00e82e419f9e',
  '20000000-0000-4000-8000-000000000002', 'b7087f73-e626-4838-8add-9c0d75b07616',
  'receipt', 'RC-2026-08-015', 'generated', '2026-08-15',
  '22000000-0000-4000-8000-000000000001', true, 7, 3, 0, 0,
  350000, 24500, 374500, 10500, 364000, 'Installment 2/3', true,
  'bank_transfer', '3f6f8c46-0ab9-4909-bb2b-835d38654277', 'WHT-2026-08-103', '2026-08-15T10:00:00Z', 364000
);

-- Installment 3: cheque 250,000 pre-VAT
insert into public.documents (
  id, user_id, deal_id, customer_id, doc_type, doc_number, status, issue_date,
  converted_from_id, vat_registered, vat_rate, wht_rate, discount_percent, discount_amount,
  subtotal, vat_amount, total_amount, wht_amount, net_payable, note, hide_amounts_on_print,
  payment_method, wht_certificate_no, paid_at, amount_received
) values (
  '22000000-0000-4000-8000-000000000004', '7871919e-e4d3-4467-a195-00e82e419f9e',
  '20000000-0000-4000-8000-000000000002', 'b7087f73-e626-4838-8add-9c0d75b07616',
  'receipt', 'RC-2026-08-016', 'generated', '2026-08-19',
  '22000000-0000-4000-8000-000000000001', true, 7, 3, 0, 0,
  250000, 17500, 267500, 7500, 260000, 'Installment 3/3', true,
  'cheque', 'WHT-2026-08-104', '2026-08-19T12:00:00Z', 260000
);

insert into public.receipt_invoices (receipt_id, invoice_id, source_billing_note_id, user_id, invoice_number, issue_date, subtotal, vat_amount, total_amount, paid_amount)
values
  ('22000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000001', null, '7871919e-e4d3-4467-a195-00e82e419f9e', 'TIR-2026-08-011', '2026-08-05', 1000000, 70000, 1070000, 416000),
  ('22000000-0000-4000-8000-000000000003', '22000000-0000-4000-8000-000000000001', null, '7871919e-e4d3-4467-a195-00e82e419f9e', 'TIR-2026-08-011', '2026-08-05', 1000000, 70000, 1070000, 364000),
  ('22000000-0000-4000-8000-000000000004', '22000000-0000-4000-8000-000000000001', null, '7871919e-e4d3-4467-a195-00e82e419f9e', 'TIR-2026-08-011', '2026-08-05', 1000000, 70000, 1070000, 260000);

-- ============================================================
-- SCENARIO 3: DL-2026-00046
-- Partially paid + outstanding balance (overdue)
-- Customer: North Star Logistics Co., Ltd.
-- ============================================================
insert into public.deals (id, user_id, customer_id, deal_number, title, is_active)
values (
  '30000000-0000-4000-8000-000000000003',
  '7871919e-e4d3-4467-a195-00e82e419f9e',
  '09ddb457-17e9-4c24-ab15-d873d581bedd',
  'DL-2026-00046',
  'Warehouse packaging - partially paid',
  true
);

insert into public.documents (
  id, user_id, deal_id, customer_id, doc_type, doc_number, status, issue_date, due_date,
  vat_registered, vat_rate, wht_rate, discount_percent, discount_amount,
  subtotal, vat_amount, total_amount, wht_amount, net_payable, note, hide_amounts_on_print,
  paid_at, amount_received
) values (
  '33000000-0000-4000-8000-000000000001', '7871919e-e4d3-4467-a195-00e82e419f9e',
  '30000000-0000-4000-8000-000000000003', '09ddb457-17e9-4c24-ab15-d873d581bedd',
  'tax_invoice_receipt', 'TIR-2026-08-012', 'partially_paid', '2026-08-04', '2026-08-10',
  true, 7, 3, 0, 0,
  800000, 56000, 856000, 24000, 832000,
  'Quarterly warehouse packaging supply - partially paid, balance overdue', true,
  '2026-08-10T09:00:00Z', 312000
);

insert into public.document_line_items (document_id, user_id, item_id, item_name, item_sku, item_type, unit, unit_price, quantity, base_quantity, discount_percent, discount_amount, line_total, sort_order)
values
  ('33000000-0000-4000-8000-000000000001', '7871919e-e4d3-4467-a195-00e82e419f9e', null, 'Warehouse storage crates', 'WH-CRATE', 'product', 'piece', 160, 5000, 5000, 0, 0, 800000, 1);

-- Partial receipt: 300,000 pre-VAT (bank transfer -> Kasikorn). Balance 520,000 outstanding.
insert into public.documents (
  id, user_id, deal_id, customer_id, doc_type, doc_number, status, issue_date,
  converted_from_id, vat_registered, vat_rate, wht_rate, discount_percent, discount_amount,
  subtotal, vat_amount, total_amount, wht_amount, net_payable, note, hide_amounts_on_print,
  payment_method, bank_account_id, wht_certificate_no, paid_at, amount_received
) values (
  '33000000-0000-4000-8000-000000000002', '7871919e-e4d3-4467-a195-00e82e419f9e',
  '30000000-0000-4000-8000-000000000003', '09ddb457-17e9-4c24-ab15-d873d581bedd',
  'receipt', 'RC-2026-08-017', 'generated', '2026-08-10',
  '33000000-0000-4000-8000-000000000001', true, 7, 3, 0, 0,
  300000, 21000, 321000, 9000, 312000, 'Partial payment 300,000 pre-VAT', true,
  'bank_transfer', '3f6f8c46-0ab9-4909-bb2b-835d38654277', 'WHT-2026-08-105', '2026-08-10T09:00:00Z', 312000
);

insert into public.receipt_invoices (receipt_id, invoice_id, source_billing_note_id, user_id, invoice_number, issue_date, subtotal, vat_amount, total_amount, paid_amount)
values
  ('33000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000001', null, '7871919e-e4d3-4467-a195-00e82e419f9e', 'TIR-2026-08-012', '2026-08-04', 800000, 56000, 856000, 312000);

-- ============================================================
-- SCENARIO 4: DL-2026-00047
-- Quotation -> converted invoice -> receipt
-- Customer: Green Leaf Construction Ltd.
-- ============================================================
insert into public.deals (id, user_id, customer_id, deal_number, title, is_active)
values (
  '40000000-0000-4000-8000-000000000004',
  '7871919e-e4d3-4467-a195-00e82e419f9e',
  'fed089cf-d17b-45e5-8fbc-944dba418cc0',
  'DL-2026-00047',
  'Project site packaging - quote converted to invoice',
  true
);

insert into public.documents (
  id, user_id, deal_id, customer_id, doc_type, doc_number, status, issue_date, due_date,
  vat_registered, vat_rate, wht_rate, discount_percent, discount_amount,
  subtotal, vat_amount, total_amount, wht_amount, net_payable, note, hide_amounts_on_print
) values (
  '44000000-0000-4000-8000-000000000001', '7871919e-e4d3-4467-a195-00e82e419f9e',
  '40000000-0000-4000-8000-000000000004', 'fed089cf-d17b-45e5-8fbc-944dba418cc0',
  'quotation', 'QT-2026-08-001', 'converted', '2026-08-01', '2026-08-31',
  true, 7, 3, 0, 0,
  500000, 35000, 535000, 15000, 520000, 'Site packaging service proposal', true
);

insert into public.document_line_items (document_id, user_id, item_id, item_name, item_sku, item_type, unit, unit_price, quantity, base_quantity, discount_percent, discount_amount, line_total, sort_order)
values
  ('44000000-0000-4000-8000-000000000001', '7871919e-e4d3-4467-a195-00e82e419f9e', null, 'Project packaging service', 'PROJ-PKG', 'service', 'project', 500000, 1, 1, 0, 0, 500000, 1);

-- Converted invoice (source: quotation)
insert into public.documents (
  id, user_id, deal_id, customer_id, doc_type, doc_number, status, issue_date, due_date,
  converted_from_id, vat_registered, vat_rate, wht_rate, discount_percent, discount_amount,
  subtotal, vat_amount, total_amount, wht_amount, net_payable, note, hide_amounts_on_print,
  paid_at, amount_received
) values (
  '44000000-0000-4000-8000-000000000002', '7871919e-e4d3-4467-a195-00e82e419f9e',
  '40000000-0000-4000-8000-000000000004', 'fed089cf-d17b-45e5-8fbc-944dba418cc0',
  'invoice', 'INV-2026-08-007', 'paid', '2026-08-02', '2026-08-31',
  '44000000-0000-4000-8000-000000000001', true, 7, 3, 0, 0,
  500000, 35000, 535000, 15000, 520000, 'Converted from quotation QT-2026-08-001', true,
  '2026-08-12T10:00:00Z', 520000
);

insert into public.document_line_items (document_id, user_id, item_id, item_name, item_sku, item_type, unit, unit_price, quantity, base_quantity, discount_percent, discount_amount, line_total, sort_order)
values
  ('44000000-0000-4000-8000-000000000002', '7871919e-e4d3-4467-a195-00e82e419f9e', null, 'Project packaging service', 'PROJ-PKG', 'service', 'project', 500000, 1, 1, 0, 0, 500000, 1);

-- Receipt (cash)
insert into public.documents (
  id, user_id, deal_id, customer_id, doc_type, doc_number, status, issue_date,
  converted_from_id, vat_registered, vat_rate, wht_rate, discount_percent, discount_amount,
  subtotal, vat_amount, total_amount, wht_amount, net_payable, note, hide_amounts_on_print,
  payment_method, wht_certificate_no, paid_at, amount_received
) values (
  '44000000-0000-4000-8000-000000000003', '7871919e-e4d3-4467-a195-00e82e419f9e',
  '40000000-0000-4000-8000-000000000004', 'fed089cf-d17b-45e5-8fbc-944dba418cc0',
  'receipt', 'RC-2026-08-018', 'generated', '2026-08-12',
  '44000000-0000-4000-8000-000000000002', true, 7, 3, 0, 0,
  500000, 35000, 535000, 15000, 520000, 'Full payment in cash', true,
  'cash', 'WHT-2026-08-106', '2026-08-12T10:00:00Z', 520000
);

insert into public.receipt_invoices (receipt_id, invoice_id, source_billing_note_id, user_id, invoice_number, issue_date, subtotal, vat_amount, total_amount, paid_amount)
values
  ('44000000-0000-4000-8000-000000000003', '44000000-0000-4000-8000-000000000002', null, '7871919e-e4d3-4467-a195-00e82e419f9e', 'INV-2026-08-007', '2026-08-02', 500000, 35000, 535000, 520000);

-- ============================================================
-- SCENARIO 5: DL-2026-00048
-- 3 delivery notes -> 1 tax invoice -> 1 receipt
-- Customer: Fortune Auto Parts Ltd.
-- ============================================================
insert into public.deals (id, user_id, customer_id, deal_number, title, is_active)
values (
  '50000000-0000-4000-8000-000000000005',
  '7871919e-e4d3-4467-a195-00e82e419f9e',
  '848886ff-e19f-49a0-8400-9f6756a7b8bd',
  'DL-2026-00048',
  'Auto parts packaging - DNs bundled into one invoice',
  true
);

-- 3 delivery notes (DN-2026-08-006..008). DN docs carry vat_amount = 0,
-- total_amount already includes VAT (existing app convention).
insert into public.documents (
  id, user_id, deal_id, customer_id, doc_type, doc_number, status, issue_date,
  vat_registered, vat_rate, wht_rate, discount_percent, discount_amount,
  subtotal, vat_amount, total_amount, wht_amount, net_payable, note, hide_amounts_on_print
) values
  ('55000000-0000-4000-8000-000000000001', '7871919e-e4d3-4467-a195-00e82e419f9e', '50000000-0000-4000-8000-000000000005', '848886ff-e19f-49a0-8400-9f6756a7b8bd', 'delivery_note', 'DN-2026-08-006', 'converted', '2026-08-06', true, 7, 3, 0, 0, 100000, 0, 107000, 0, 107000, 'Delivery 1 - cartons', true),
  ('55000000-0000-4000-8000-000000000002', '7871919e-e4d3-4467-a195-00e82e419f9e', '50000000-0000-4000-8000-000000000005', '848886ff-e19f-49a0-8400-9f6756a7b8bd', 'delivery_note', 'DN-2026-08-007', 'converted', '2026-08-09', true, 7, 3, 0, 0, 150000, 0, 160500, 0, 160500, 'Delivery 2 - foam padding', true),
  ('55000000-0000-4000-8000-000000000003', '7871919e-e4d3-4467-a195-00e82e419f9e', '50000000-0000-4000-8000-000000000005', '848886ff-e19f-49a0-8400-9f6756a7b8bd', 'delivery_note', 'DN-2026-08-008', 'converted', '2026-08-13', true, 7, 3, 0, 0, 50000, 0, 53500, 0, 53500, 'Delivery 3 - strapping', true);

insert into public.document_line_items (document_id, user_id, item_id, item_name, item_sku, item_type, unit, unit_price, quantity, base_quantity, discount_percent, discount_amount, line_total, sort_order)
values
  ('55000000-0000-4000-8000-000000000001', '7871919e-e4d3-4467-a195-00e82e419f9e', null, 'Heavy carton box', 'CARTON-HVY', 'product', 'piece', 100, 1000, 1000, 0, 0, 100000, 1),
  ('55000000-0000-4000-8000-000000000002', '7871919e-e4d3-4467-a195-00e82e419f9e', null, 'Foam padding sheet', 'FOAM-SHT', 'product', 'piece', 150, 1000, 1000, 0, 0, 150000, 1),
  ('55000000-0000-4000-8000-000000000003', '7871919e-e4d3-4467-a195-00e82e419f9e', null, 'Steel strapping roll', 'STRAP-STL', 'product', 'roll', 50, 1000, 1000, 0, 0, 50000, 1);

-- 1 tax invoice bundling all 3 DNs (TIR-2026-08-013)
insert into public.documents (
  id, user_id, deal_id, customer_id, doc_type, doc_number, status, issue_date,
  vat_registered, vat_rate, wht_rate, discount_percent, discount_amount,
  subtotal, vat_amount, total_amount, wht_amount, net_payable, note, hide_amounts_on_print,
  paid_at, amount_received
) values (
  '55000000-0000-4000-8000-000000000004', '7871919e-e4d3-4467-a195-00e82e419f9e',
  '50000000-0000-4000-8000-000000000005', '848886ff-e19f-49a0-8400-9f6756a7b8bd',
  'tax_invoice_receipt', 'TIR-2026-08-013', 'paid', '2026-08-15',
  true, 7, 3, 0, 0,
  300000, 21000, 321000, 9000, 312000, 'Bundled from DN-2026-08-006/007/008', true,
  '2026-08-18T10:00:00Z', 312000
);

insert into public.invoice_delivery_notes (invoice_id, delivery_note_id, user_id, delivery_note_number, issue_date, subtotal, vat_amount, total_amount)
select '55000000-0000-4000-8000-000000000004', d.id, d.user_id, d.doc_number, d.issue_date, d.subtotal, d.vat_amount, d.total_amount
from public.documents d
where d.deal_id = '50000000-0000-4000-8000-000000000005' and d.doc_type = 'delivery_note'
order by d.doc_number;

insert into public.document_line_items (document_id, user_id, item_id, item_name, item_sku, item_type, unit, unit_price, quantity, base_quantity, discount_percent, discount_amount, line_total, sort_order)
values
  ('55000000-0000-4000-8000-000000000004', '7871919e-e4d3-4467-a195-00e82e419f9e', null, 'Heavy carton box', 'CARTON-HVY', 'product', 'piece', 100, 1000, 1000, 0, 0, 100000, 1),
  ('55000000-0000-4000-8000-000000000004', '7871919e-e4d3-4467-a195-00e82e419f9e', null, 'Foam padding sheet', 'FOAM-SHT', 'product', 'piece', 150, 1000, 1000, 0, 0, 150000, 2),
  ('55000000-0000-4000-8000-000000000004', '7871919e-e4d3-4467-a195-00e82e419f9e', null, 'Steel strapping roll', 'STRAP-STL', 'product', 'roll', 50, 1000, 1000, 0, 0, 50000, 3);

-- Receipt (bank transfer -> Siam Commercial)
insert into public.documents (
  id, user_id, deal_id, customer_id, doc_type, doc_number, status, issue_date,
  converted_from_id, vat_registered, vat_rate, wht_rate, discount_percent, discount_amount,
  subtotal, vat_amount, total_amount, wht_amount, net_payable, note, hide_amounts_on_print,
  payment_method, bank_account_id, wht_certificate_no, paid_at, amount_received
) values (
  '55000000-0000-4000-8000-000000000005', '7871919e-e4d3-4467-a195-00e82e419f9e',
  '50000000-0000-4000-8000-000000000005', '848886ff-e19f-49a0-8400-9f6756a7b8bd',
  'receipt', 'RC-2026-08-019', 'generated', '2026-08-18',
  '55000000-0000-4000-8000-000000000004', true, 7, 3, 0, 0,
  300000, 21000, 321000, 9000, 312000, 'Full payment for bundled delivery invoice', true,
  'bank_transfer', '60000000-0000-4000-8000-000000000002', 'WHT-2026-08-107', '2026-08-18T10:00:00Z', 312000
);

insert into public.receipt_invoices (receipt_id, invoice_id, source_billing_note_id, user_id, invoice_number, issue_date, subtotal, vat_amount, total_amount, paid_amount)
values
  ('55000000-0000-4000-8000-000000000005', '55000000-0000-4000-8000-000000000004', null, '7871919e-e4d3-4467-a195-00e82e419f9e', 'TIR-2026-08-013', '2026-08-15', 300000, 21000, 321000, 312000);

-- ------------------------------------------------------------------
-- 2. Re-enable triggers
-- ------------------------------------------------------------------
alter table public.document_line_items enable trigger trg_enforce_line_item_draft_permission;
alter table public.documents enable trigger trg_enforce_document_action_permission;

-- ------------------------------------------------------------------
-- 3. Update numbering sequences so the next app-generated doc/ deal
--    numbers continue cleanly after the seeded ones
-- ------------------------------------------------------------------
update public.deal_number_sequences
set last_year = 2026, last_month = 0, last_sequence = 48
where user_id = '7871919e-e4d3-4467-a195-00e82e419f9e';

update public.doc_number_sequences
set last_year = 2026, last_month = 8, last_sequence = 13
where user_id = '7871919e-e4d3-4467-a195-00e82e419f9e' and doc_type = 'tax_invoice_receipt';

update public.doc_number_sequences
set last_year = 2026, last_month = 8, last_sequence = 7
where user_id = '7871919e-e4d3-4467-a195-00e82e419f9e' and doc_type = 'invoice';

update public.doc_number_sequences
set last_year = 2026, last_month = 8, last_sequence = 9
where user_id = '7871919e-e4d3-4467-a195-00e82e419f9e' and doc_type = 'billing_note';

update public.doc_number_sequences
set last_year = 2026, last_month = 8, last_sequence = 19
where user_id = '7871919e-e4d3-4467-a195-00e82e419f9e' and doc_type = 'receipt';

update public.doc_number_sequences
set last_year = 2026, last_month = 8, last_sequence = 8
where user_id = '7871919e-e4d3-4467-a195-00e82e419f9e' and doc_type = 'delivery_note';

update public.doc_number_sequences
set last_year = 2026, last_month = 8, last_sequence = 1
where user_id = '7871919e-e4d3-4467-a195-00e82e419f9e' and doc_type = 'quotation';

commit;

-- ============================================================
-- Verification queries (run after commit to sanity-check)
-- ============================================================
-- select d.deal_number, d.title,
--        count(doc.id) filter (where doc.doc_type = 'tax_invoice_receipt') as tax_invoices,
--        count(doc.id) filter (where doc.doc_type = 'billing_note') as billing_notes,
--        count(doc.id) filter (where doc.doc_type = 'receipt') as receipts,
--        count(doc.id) filter (where doc.doc_type = 'delivery_note') as delivery_notes
-- from public.deals d
-- left join public.documents doc on doc.deal_id = d.id
-- where d.deal_number in ('DL-2026-00044','DL-2026-00045','DL-2026-00046','DL-2026-00047','DL-2026-00048')
-- group by d.deal_number, d.title
-- order by d.deal_number;

-- Expected reconciliation per scenario:
--   S1: 10 TIR (net 260000+187200+332800+98800+436800+78000+275600+156000+353600+213200 = 2,392,000)
--       BN-2026-08-009 net 2,392,000 == RC-2026-08-013 amount_received 2,392,000
--   S2: TIR-2026-08-011 net 1,040,000 == 416000+364000+260000 (3 receipts)
--   S3: TIR-2026-08-012 net 832,000; paid 312,000 -> outstanding 520,000 (overdue)
--   S4: QT -> INV-2026-08-007 net 520,000 == RC-2026-08-018
--   S5: DN subtotals 100000+150000+50000 = 300,000 == TIR-2026-08-013 subtotal
--       TIR net 312,000 == RC-2026-08-019