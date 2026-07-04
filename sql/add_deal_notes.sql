-- Single line, copy-paste to Supabase SQL Editor
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS notes jsonb NOT NULL DEFAULT '[]';
