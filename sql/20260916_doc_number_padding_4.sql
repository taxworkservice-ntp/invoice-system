-- Change: widen the document-number running segment from 3 to 4 digits.
--
-- Format was {PREFIX}-{YYYY}-{MM}-{NNN} (e.g. INV-2026-09-001); it becomes
-- {PREFIX}-{YYYY}-{MM}-{NNNN} (e.g. INV-2026-09-0001).
--
-- Why: PostgreSQL lpad() truncates on the right when the input is longer than
-- the requested length, so lpad('1000', 3, '0') => '100'. Past the 999th
-- document of a type in a month, numbers collapsed onto earlier values and the
-- partial unique index (user_id, doc_type, doc_number) rejected the insert,
-- hard-failing numbering. 4 digits raises the ceiling to 9,999/month.
--
-- Scope: all document types share this function. Existing 3-digit numbers are
-- intentionally left untouched; the generator parses any width via the
-- trailing-digit regex, so mixed widths resolve correctly (MAX of numeric
-- suffixes, not lexicographic order).
--
-- This supersedes the function body in fix_generate_doc_number_overflow.sql
-- (keeps the bigint / >9-digit overflow guard and the voided-doc exclusion).
--
-- Apply manually via the Supabase SQL editor or Management API.

create or replace function generate_doc_number(
  p_user_id   uuid,
  p_doc_type  document_type,
  p_issue_date date
)
returns text as $$
declare
  v_seq         public.doc_number_sequences%rowtype;
  v_effective_date date := coalesce(p_issue_date, current_date);
  v_year        int := extract(year from v_effective_date)::int;
  v_month       int := extract(month from v_effective_date)::int;
  v_existing_max int := 0;
  v_next_seq    int;
  v_doc_number  text;
begin
  select * into v_seq
  from public.doc_number_sequences
  where user_id = p_user_id and doc_type = p_doc_type
  for update;

  if not found then
    raise exception 'No sequence configured for this document type';
  end if;

  if v_seq.reset_yearly then
    select coalesce(
      max(case when length(t.trail) <= 9 then t.trail::bigint else 0 end),
      0
    )::int
    into v_existing_max
    from (
      select substring(doc_number from '([0-9]+)$') as trail
      from public.documents
      where user_id = p_user_id
        and doc_type = p_doc_type
        and doc_number is not null
        and status != 'voided'
        and extract(year from issue_date)::int = v_year
        and extract(month from issue_date)::int = v_month
    ) t;
  else
    select coalesce(
      max(case when length(t.trail) <= 9 then t.trail::bigint else 0 end),
      0
    )::int
    into v_existing_max
    from (
      select substring(doc_number from '([0-9]+)$') as trail
      from public.documents
      where user_id = p_user_id
        and doc_type = p_doc_type
        and doc_number is not null
        and status != 'voided'
    ) t;
  end if;

  v_next_seq := greatest(v_existing_max + 1, coalesce(v_seq.start_sequence, 1));

  update public.doc_number_sequences
  set last_sequence = v_next_seq,
      last_year     = v_year,
      last_month    = v_month
  where user_id = p_user_id and doc_type = p_doc_type;

  v_doc_number := v_seq.prefix || '-' || v_year || '-' || lpad(v_month::text, 2, '0') || '-' || lpad(v_next_seq::text, 4, '0');

  return v_doc_number;
end;
$$ language plpgsql security definer set search_path = '';
