-- Fix: Allow voided documents to keep their doc_number while new documents
-- can reuse the same number. Achieved by replacing the full-table unique constraint
-- on (user_id, doc_type, doc_number) with a partial unique index that ignores
-- voided rows.
--
-- This works together with the generate_doc_number function fix which already
-- skips 'voided' docs in the MAX scan. Now the unique index also ignores them.
--
-- Use case:
-- 1. Invoice INV-2607-001 created
-- 2. User clicks "เริ่มรวมใหม่" → invoice voided, doc_number preserved
-- 3. generate_doc_number returns INV-2607-001 (skips voided in MAX scan)
-- 4. New invoice inserted with INV-2607-001 → index ignores voided row, no conflict
-- 5. Voided INV-2607-001 stays for audit, active INV-2607-001 in use

-- Step 1: Drop existing full-table unique indexes/constraints on doc_number
DROP INDEX IF EXISTS public.uq_documents_user_doc_number;
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS uq_documents_user_doc_number;

-- Step 2: Create partial unique index (only checks non-voided documents)
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_unique_doc_number
ON public.documents(user_id, doc_type, doc_number)
WHERE status IS DISTINCT FROM 'voided';
