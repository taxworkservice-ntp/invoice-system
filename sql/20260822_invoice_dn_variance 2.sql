-- Capture the variance between a delivery note and the invoice generated from it.
-- Stored as a snapshot on the invoice line so the record stays correct even if the
-- source delivery note is later edited or voided.

alter table document_line_items add column source_delivered_qty numeric(15,3);
alter table document_line_items add column source_unit_price numeric(15,2);

-- Document-level flag controlling whether the variance is printed on the
-- customer-facing tax invoice. Default OFF (clean customer invoice); the
-- deal-detail audit view always shows the variance regardless of this flag.
alter table documents add column show_dn_variance boolean not null default false;
