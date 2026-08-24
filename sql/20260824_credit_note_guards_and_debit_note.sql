-- ============================================================
-- 20260824: Credit note guards + debit note (ใบเพิ่มหนี้) support
--
-- ⚠️ Run each step SEPARATELY (new editor query / auto-commit).
-- ALTER TYPE ... ADD VALUE takes effect only after commit, so the
-- seed in step 3 must run in a NEW statement after step 2 succeeds.
-- ============================================================

-- Step 1: At most one in-progress (draft) credit note per source document,
--         per user. Issued/voided credit notes remain unrestricted.
create unique index if not exists uq_documents_cn_draft_per_source
  on documents (user_id, converted_from_id)
  where doc_type = 'credit_note' and status = 'draft';

-- Step 2: New document type. Commit before using the value anywhere.
alter type public.document_type add value if not exists 'debit_note';

-- Step 3: Seed numbering sequences for existing client workspaces ('DB' prefix).
-- ⚠️ Must run AFTER step 2 is committed, otherwise:
--    ERROR 55P04: unsafe use of new value "debit_note" of enum type document_type
insert into doc_number_sequences (user_id, doc_type, prefix, reset_yearly)
select p.id, 'debit_note', 'DB', true
from profiles p
where p.role = 'client'
on conflict (user_id, doc_type) do nothing;

-- Verification (optional):
-- select doc_type, count(*) from documents group by 1;
-- select user_id, doc_type, prefix from doc_number_sequences where doc_type = 'debit_note';
