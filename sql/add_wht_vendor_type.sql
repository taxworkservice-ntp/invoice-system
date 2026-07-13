-- ============================================================
-- MIGRATION: Add vendor_type to wht_vendors
-- Distinguishes between company (บริษัท) and individual (บุคคล)
-- Used to auto-select PND form type: company → pnd53, individual → pnd3
-- ============================================================

ALTER TABLE wht_vendors
  ADD COLUMN IF NOT EXISTS vendor_type text NOT NULL DEFAULT 'company'
  CHECK (vendor_type IN ('company', 'individual'));