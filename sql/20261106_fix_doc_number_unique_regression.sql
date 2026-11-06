-- Regression fix: the 2026-09-16 numbering migration recreated the old full
-- unique index `uq_documents_user_doc_number` on (user_id, doc_number). That
-- index blocks the intended behaviour:
--   * a voided document keeps its number for audit, and the next document may
--     reuse it (generate_doc_number skips voided rows), and
--   * two document types may share a prefix, so the same number can legitimately
--     exist once per type.
-- The July fix replaced it with a partial index on
-- (user_id, doc_type, doc_number) WHERE status != 'voided'. Restore that state.
--
-- Apply manually via the Supabase SQL editor or Management API.

do $$
declare
  v_duplicates text;
begin
  select string_agg(
      user_id::text || ':' || doc_type::text || ':' || doc_number || ' (' || count || ')',
      ', '
    )
    into v_duplicates
  from (
    select user_id, doc_type, doc_number, count(*) as count
    from public.documents
    where doc_number is not null
      and status is distinct from 'voided'
    group by user_id, doc_type, doc_number
    having count(*) > 1
    order by user_id, doc_type, doc_number
    limit 20
  ) duplicates;

  if v_duplicates is not null then
    raise exception 'Duplicate active document numbers exist. Resolve before adding the partial unique index: %', v_duplicates;
  end if;
end;
$$;

drop index if exists public.uq_documents_user_doc_number;
alter table public.documents drop constraint if exists uq_documents_user_doc_number;

create unique index if not exists idx_documents_unique_doc_number
  on public.documents(user_id, doc_type, doc_number)
  where status is distinct from 'voided';
