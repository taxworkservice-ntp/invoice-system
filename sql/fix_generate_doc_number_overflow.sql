-- Fix: generate_doc_number must not overflow int32 when a document has a
-- doc_number whose trailing numeric segment exceeds 2,147,483,647 (e.g. a
-- Date.now()-style number like "INV-1757307000000"). The old
-- `substring(doc_number from '([0-9]+)$')::int` cast threw
-- `22003 value out of range for type integer`, aborting number generation and
-- breaking convert_quotation_to_invoice / create_deal_document.
--
-- Fix: parse the trailing segment as bigint and ignore any segment longer than
-- 9 digits (treated as 0). Legitimate sequences (<= 9 digits, far below the
-- int32 max) are honored; runaway/timestamp-style suffixes no longer poison
-- sequencing or overflow the `last_sequence` int column.

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

  v_doc_number := v_seq.prefix || '-' || v_year || '-' || lpad(v_month::text, 2, '0') || '-' || lpad(v_next_seq::text, 3, '0');

  return v_doc_number;
end;
$$ language plpgsql security definer set search_path = '';
