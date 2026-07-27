-- Fix: generate_doc_number should NOT count voided documents
-- Otherwise "เริ่มรวมใหม่" or "ยกเลิกและออกฉบับใหม่" skips the voided number.
--
-- The MAX query now filters out status = 'voided' docs, so voided numbers
-- can be reused by the next new document.
--
-- This is consistent with assertDocNumberAvailable() which already
-- uses .neq("status", "voided") for the manual override path.

create or replace function generate_doc_number(
  p_user_id   uuid,
  p_doc_type  document_type,
  p_issue_date date
)
returns text as $$
declare
  v_seq         doc_number_sequences%rowtype;
  v_effective_date date := coalesce(p_issue_date, current_date);
  v_year        int := extract(year from v_effective_date)::int;
  v_month       int := extract(month from v_effective_date)::int;
  v_existing_max int := 0;
  v_next_seq    int;
  v_doc_number  text;
begin
  select * into v_seq
  from doc_number_sequences
  where user_id = p_user_id and doc_type = p_doc_type
  for update;

  if not found then
    raise exception 'No sequence configured for this document type';
  end if;

  if v_seq.reset_yearly then
    select coalesce(max(substring(doc_number from '([0-9]+)$')::int), 0)
      into v_existing_max
    from documents
    where user_id = p_user_id
      and doc_type = p_doc_type
      and doc_number is not null
      and status != 'voided'
      and extract(year from issue_date)::int = v_year
      and extract(month from issue_date)::int = v_month;
  else
    select coalesce(max(substring(doc_number from '([0-9]+)$')::int), 0)
      into v_existing_max
    from documents
    where user_id = p_user_id
      and doc_type = p_doc_type
      and doc_number is not null
      and status != 'voided';
  end if;

  v_next_seq := greatest(v_existing_max + 1, coalesce(v_seq.start_sequence, 1));

  update doc_number_sequences
  set last_sequence = v_next_seq,
      last_year     = v_year,
      last_month    = v_month
  where user_id = p_user_id and doc_type = p_doc_type;

  v_doc_number := v_seq.prefix || '-' || v_year || '-' || lpad(v_month::text, 2, '0') || '-' || lpad(v_next_seq::text, 3, '0');

  return v_doc_number;
end;
$$ language plpgsql security definer;
