alter table public.doc_number_sequences
  add column if not exists start_sequence int not null default 1;

alter table public.doc_number_sequences
  drop constraint if exists doc_number_sequences_start_sequence_check;

alter table public.doc_number_sequences
  add constraint doc_number_sequences_start_sequence_check check (start_sequence >= 1);

alter table public.client_profiles
  add column if not exists dev_effective_date date;

do $$
declare
  v_duplicates text;
begin
  select string_agg(user_id::text || ':' || doc_number || ' (' || count || ')', ', ')
    into v_duplicates
  from (
    select user_id, doc_number, count(*) as count
    from public.documents
    where doc_number is not null
    group by user_id, doc_number
    having count(*) > 1
    order by user_id, doc_number
    limit 20
  ) duplicates;

  if v_duplicates is not null then
    raise exception 'Duplicate document numbers exist. Resolve before adding unique index: %', v_duplicates;
  end if;
end;
$$;

create unique index if not exists uq_documents_user_doc_number
  on public.documents(user_id, doc_number)
  where doc_number is not null;

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
      and extract(year from issue_date)::int = v_year
      and extract(month from issue_date)::int = v_month;
  else
    select coalesce(max(substring(doc_number from '([0-9]+)$')::int), 0)
      into v_existing_max
    from documents
    where user_id = p_user_id
      and doc_type = p_doc_type
      and doc_number is not null;
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
