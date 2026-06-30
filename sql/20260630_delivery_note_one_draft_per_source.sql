-- MIGRATION: at most one in-progress (draft) delivery note per source quotation.
--
-- Background: the deal page used to direct-insert full-clone delivery notes
-- whenever the "ออกใบส่งของ" button was clicked, allowing an arbitrary
-- number of DNs against the same quotation. The form path also let users
-- create multiple draft DNs in parallel. The only check left at the database
-- layer is a partial unique index.
--
-- Multiple *sent* delivery notes are intentionally still allowed so partial
-- deliveries continue to work; the index only restricts drafts.

-- Step 1: back-fill. Void older duplicate draft DNs per (user_id, source
-- quotation). Keeping the newest draft per source quotation preserves the
-- user's latest in-progress work; older drafts are surfaced as voided so the
-- audit trail stays intact.
with ranked as (
  select id,
         row_number() over (
           partition by user_id, converted_from_id
           order by created_at desc
         ) as rn
  from documents
  where doc_type = 'delivery_note'
    and status = 'draft'
    and converted_from_id is not null
)
update documents
set status = 'voided',
    voided_at = now(),
    voided_reason = 'auto: superseded by newer draft (migration)'
where id in (select id from ranked where rn > 1);

-- Step 2: enforce the invariant going forward.
create unique index if not exists uq_documents_dn_draft_per_source
  on documents (user_id, converted_from_id)
  where doc_type = 'delivery_note' and status = 'draft';

notify pgrst, 'reload schema';
