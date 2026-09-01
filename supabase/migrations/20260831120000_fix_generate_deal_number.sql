-- Collision-safe deal numbering.
--
-- The old generate_deal_number() was a pure counter: it blindly returned
-- last_sequence + 1 from deal_number_sequences without ever checking the
-- deals table. That broke admin resets:
--   * "Clear Documents & Numbering" deletes deals and resets the counter to 0
--     (safe), but "Archive Workspace" only archives deals (is_active = false)
--     while their deal_number values stay occupied by a unique index
--     (idx_deals_deal_number). Resetting the counter then made the next deal
--     insert collide with an archived deal number and fail.
--
-- Fix: mirror generate_doc_number() semantics — take the greatest of
--   (a) counter + 1, and
--   (b) max trailing digits of existing deal numbers for the current year,
-- so archived deals can never collide. After a full wipe (counter = 0, deals
-- deleted) numbering restarts at DL-YYYY-00001; after an archive it continues
-- past the highest archived number.
--
-- The trailing segment is parsed as bigint and ignored when longer than 9
-- digits (same overflow guard as fix_generate_doc_number_overflow.sql) so a
-- timestamp-style suffix cannot poison sequencing or overflow int.

create or replace function public.generate_deal_number(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year         int;
  v_counter      int := 0;
  v_existing     public.deal_number_sequences%ROWTYPE;
  v_existing_max int := 0;
  v_next_seq     int;
begin
  v_year := extract(year from now())::int;

  select * into v_existing
  from public.deal_number_sequences
  where user_id = p_user_id
  for update;

  if found and v_existing.last_year = v_year then
    v_counter := v_existing.last_sequence;
  end if;

  select coalesce(
    max(case when length(t.trail) <= 9 then t.trail::bigint else 0 end),
    0
  )::int
  into v_existing_max
  from (
    select substring(deal_number from '([0-9]+)$') as trail
    from public.deals
    where user_id = p_user_id
      and deal_number is not null
      and deal_number like 'DL-' || v_year::text || '-%'
  ) t;

  v_next_seq := greatest(v_existing_max + 1, v_counter + 1);

  insert into public.deal_number_sequences (user_id, last_year, last_month, last_sequence)
  values (p_user_id, v_year, 0, v_next_seq)
  on conflict (user_id) do update
    set last_sequence = v_next_seq,
        last_year     = v_year,
        last_month    = 0;

  return 'DL-' || v_year::text || '-' || lpad(v_next_seq::text, 5, '0');
end;
$$;
