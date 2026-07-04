-- Add hide_amounts_on_print toggle for delivery notes
-- Run this in Supabase SQL Editor
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS hide_amounts_on_print boolean NOT NULL DEFAULT true;
