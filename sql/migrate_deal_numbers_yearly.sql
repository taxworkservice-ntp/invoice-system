-- Test/early-stage migration for DL-yyyy-nnnnn deal numbers.
-- Run after deal_numbering.sql. It renumbers existing deals per workspace/year.

begin;

with numbered as (
  select
    id,
    user_id,
    extract(year from created_at)::int as deal_year,
    row_number() over (
      partition by user_id, extract(year from created_at)
      order by created_at, id
    ) as sequence_no
  from public.deals
)
update public.deals d
set deal_number = 'DL-' || n.deal_year::text || '-' || lpad(n.sequence_no::text, 5, '0')
from numbered n
where d.id = n.id;

insert into public.deal_number_sequences (user_id, last_year, last_month, last_sequence)
select p.id, extract(year from current_date)::int, 0, 0
from public.profiles p
where p.role = 'client'
on conflict (user_id) do nothing;

update public.deal_number_sequences s
set last_year = current_year.deal_year,
    last_month = 0,
    last_sequence = current_year.max_sequence
from (
  select user_id, extract(year from current_date)::int as deal_year,
         coalesce(max(regexp_replace(deal_number, '^DL-[0-9]{4}-', '')::int), 0) as max_sequence
  from public.deals
  where extract(year from created_at)::int = extract(year from current_date)::int
  group by user_id
) current_year
where s.user_id = current_year.user_id;

commit;
