-- Fix: allocate a number from the number's own period, not from issue_date.
--
-- A document keeps the number it was created with. If its issue_date is later
-- edited (or a clone is made with a different date), the embedded period no
-- longer matches issue_date. The old generator scanned by issue_date, so it
-- could return a number that already exists in the document's own period
-- (observed: DO-2569-11-0001 with issue_date 2026-10-07, then the generator
-- returned DO-2569-11-0001 again -> 409 on the unique index).
--
-- The scan now matches the printed period prefix:
--   {PREFIX}-{DISPLAY_YEAR}-{MM}-
-- which is exactly the part that makes the number unique. Voided documents are
-- still excluded, so their numbers can be reused.
--
-- Apply manually via the Supabase SQL editor or Management API.

create or replace function public.generate_doc_number(
  p_user_id   uuid,
  p_doc_type  public.document_type,
  p_issue_date date
)
returns text as $$
declare
  v_seq          public.doc_number_sequences%rowtype;
  v_effective_date date := coalesce(p_issue_date, current_date);
  v_year         int := extract(year from v_effective_date)::int;
  v_month        int := extract(month from v_effective_date)::int;
  v_existing_max int := 0;
  v_next_seq     int;
  v_doc_number   text;
  v_display_year int;
  v_period       text;
begin
  -- The year a customer READS follows the workspace's year system (พ.ศ./ค.ศ.).
  -- Display only: the trailing-number scan stays on the printed period.
  v_display_year := v_year + case
    when (select cp.year_era from public.client_profiles cp where cp.user_id = p_user_id) = 'be' then 543
    else 0
  end;

  select * into v_seq
  from public.doc_number_sequences
  where user_id = p_user_id and doc_type = p_doc_type
  for update;

  if not found then
    raise exception 'No sequence configured for this document type';
  end if;

  v_period := v_seq.prefix || '-' || v_display_year || '-' || lpad(v_month::text, 2, '0') || '-';

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
        -- Match the printed period, not issue_date: a document keeps its
        -- number when its issue date is edited later.
        and left(doc_number, length(v_period)) = v_period
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

  v_doc_number := v_period || lpad(v_next_seq::text, 4, '0');

  return v_doc_number;
end;
$$ language plpgsql security definer set search_path = '';
