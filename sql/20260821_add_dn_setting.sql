-- Add a company-wide default for delivery-note "full invoice-style totals".
-- The default lives on the user's own client_profiles row (company settings).
-- Per-document override is stored on documents.show_full_totals (see 20260821_add_dn_show_full_totals.sql).

alter table client_profiles add column if not exists delivery_note_show_full_totals boolean not null default false;
