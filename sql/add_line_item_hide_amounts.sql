-- Add per-line hide_amounts_on_print toggle for line items
-- Run this in Supabase SQL Editor
ALTER TABLE public.document_line_items ADD COLUMN IF NOT EXISTS hide_amounts_on_print boolean NOT NULL DEFAULT false;