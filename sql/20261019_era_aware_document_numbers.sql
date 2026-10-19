-- ============================================================
-- Document numbers follow the workspace's year system (พ.ศ. / ค.ศ.).
--
-- Until now every number printed the calendar (CE) year — `INV-2026-…`,
-- `DL-2026-…` — even for a workspace set to พ.ศ., while the *dates* on the same
-- document already followed the era. The printed year now follows
-- `client_profiles.year_era` (+543 for 'be'); nothing else moves:
--
--   * the yearly/monthly reset window and every `last_year` bookkeeping value
--     stay on the calendar year — BE is always CE + 543, so 2569 ↔ 2026;
--   * document numbering stays duplicate-free across a switch: the unique scan
--     reads `issue_date` (not the number), and the deal scan now matches both
--     number shapes;
--   * NO backfill — existing `documents.doc_number` / `deals.deal_number` are
--     untouched. Within one calendar year a switched workspace will show two
--     shapes (`INV-2026-…` issued before, `INV-2569-…` after); the owner
--     accepted that explicitly.
--
-- Covers generate_doc_number (every document type — called both from the client
-- and from the server-side document RPCs, so the year has to be decided here),
-- generate_deal_number and repair_doc_numbers (the manual renumbering tool, so a
-- repaired workspace matches its era). generate_wht_certificate_no prints a
-- `YYMM###` certificate number with no prefix-year pattern and is left alone.
--
-- Apply manually (Supabase SQL editor or Management API).
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_doc_number(p_user_id uuid, p_doc_type document_type, p_issue_date date)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_seq         public.doc_number_sequences%rowtype;
  v_effective_date date := coalesce(p_issue_date, current_date);
  v_year        int := extract(year from v_effective_date)::int;
  v_month       int := extract(month from v_effective_date)::int;
  v_existing_max int := 0;
  v_next_seq    int;
  v_doc_number  text;
  v_display_year int;
begin
  -- The year a customer READS follows the workspace's year system (พ.ศ./ค.ศ.).
  -- Display only: the reset window, the sequence bookkeeping and the trailing
  -- number scan all stay on the calendar (CE) year, which is what keeps
  -- numbering continuous and duplicate-free when a workspace switches era
  -- mid-year (BE is always CE + 543, so 2569 ↔ 2026).
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

  v_doc_number := v_seq.prefix || '-' || v_display_year || '-' || lpad(v_month::text, 2, '0') || '-' || lpad(v_next_seq::text, 4, '0');

  return v_doc_number;
end;
$function$;

CREATE OR REPLACE FUNCTION public.generate_deal_number(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_year         int;
  v_display_year int;
  v_counter      int := 0;
  v_existing     public.deal_number_sequences%ROWTYPE;
  v_existing_max int := 0;
  v_next_seq     int;
begin
  v_year := extract(year from now())::int;
  -- The year a customer READS follows the workspace's year system (พ.ศ./ค.ศ.).
  -- Display only: the reset window, the sequence bookkeeping and the trailing
  -- number scan all stay on the calendar (CE) year, which is what keeps
  -- numbering continuous and duplicate-free when a workspace switches era
  -- mid-year (BE is always CE + 543, so 2569 ↔ 2026).
  v_display_year := v_year + case
    when (select cp.year_era from public.client_profiles cp where cp.user_id = p_user_id) = 'be' then 543
    else 0
  end;

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
      -- Both shapes: numbers issued before an era switch still count, so
      -- switching back and forth can never reissue a number.
      and (
        deal_number like 'DL-' || v_year::text || '-%'
        or deal_number like 'DL-' || v_display_year::text || '-%'
      )
  ) t;

  v_next_seq := greatest(v_existing_max + 1, v_counter + 1);

  insert into public.deal_number_sequences (user_id, last_year, last_month, last_sequence)
  values (p_user_id, v_year, 0, v_next_seq)
  on conflict (user_id) do update
    set last_sequence = v_next_seq,
        last_year     = v_year,
        last_month    = 0;

  return 'DL-' || v_display_year::text || '-' || lpad(v_next_seq::text, 5, '0');
end;
$function$;

CREATE OR REPLACE FUNCTION public.repair_doc_numbers(p_user_id uuid, p_doc_type document_type DEFAULT NULL::document_type, p_force_reset_yearly boolean DEFAULT false)
 RETURNS TABLE(doc_type document_type, repaired_count integer, last_year integer, last_month integer, last_sequence integer, last_doc_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_seq doc_number_sequences%rowtype;
begin
  if p_force_reset_yearly then
    update doc_number_sequences
    set reset_yearly = true
    where doc_number_sequences.user_id = p_user_id
      and (p_doc_type is null or doc_number_sequences.doc_type = p_doc_type);
  end if;

  for v_seq in
    select *
    from doc_number_sequences
    where doc_number_sequences.user_id = p_user_id
      and (p_doc_type is null or doc_number_sequences.doc_type = p_doc_type)
    order by doc_number_sequences.doc_type
    for update
  loop
    with ranked as (
      select
        d.id,
        extract(year from d.issue_date)::int as issue_year,
        extract(month from d.issue_date)::int as issue_month,
        (row_number() over (
          partition by
            case when v_seq.reset_yearly then extract(year from d.issue_date)::int else 1 end,
            case when v_seq.reset_yearly then extract(month from d.issue_date)::int else 1 end
          order by d.issue_date, d.created_at, d.id
        ))::int as bucket_sequence,
        (row_number() over (
          order by d.issue_date, d.created_at, d.id
        ))::int as global_sequence,
        (row_number() over (
          order by d.issue_date desc, d.created_at desc, d.id desc
        ))::int as reverse_order
      from documents d
      where d.user_id = p_user_id
        and d.doc_type = v_seq.doc_type
    )
    update documents d
    set doc_number =
      v_seq.prefix
      || '-' || (issue_year + case when (select cp.year_era from public.client_profiles cp where cp.user_id = p_user_id) = 'be' then 543 else 0 end)
      || '-' || lpad(ranked.issue_month::text, 2, '0')
      || '-' || lpad(
        (
          case
            when v_seq.reset_yearly then ranked.bucket_sequence
            else ranked.global_sequence
          end
        )::text,
        3,
        '0'
      )
    from ranked
    where d.id = ranked.id;

    if exists (
      select 1
      from documents
      where documents.user_id = p_user_id
        and documents.doc_type = v_seq.doc_type
    ) then
      with ranked as (
        select
          d.id,
          extract(year from d.issue_date)::int as issue_year,
          extract(month from d.issue_date)::int as issue_month,
          (row_number() over (
            partition by
              case when v_seq.reset_yearly then extract(year from d.issue_date)::int else 1 end,
              case when v_seq.reset_yearly then extract(month from d.issue_date)::int else 1 end
            order by d.issue_date, d.created_at, d.id
          ))::int as bucket_sequence,
          (row_number() over (
            order by d.issue_date, d.created_at, d.id
          ))::int as global_sequence,
          (row_number() over (
            order by d.issue_date desc, d.created_at desc, d.id desc
          ))::int as reverse_order
        from documents d
        where d.user_id = p_user_id
          and d.doc_type = v_seq.doc_type
      ),
      stats as (
        select count(*)::int as repaired_count
        from ranked
      ),
      latest as (
        select
          issue_year,
          issue_month,
          case
            when v_seq.reset_yearly then bucket_sequence
            else global_sequence
          end as effective_sequence,
          v_seq.prefix
            || '-' || (issue_year + case when (select cp.year_era from public.client_profiles cp where cp.user_id = p_user_id) = 'be' then 543 else 0 end)
            || '-' || lpad(issue_month::text, 2, '0')
            || '-' || lpad(
              (
                case
                  when v_seq.reset_yearly then bucket_sequence
                  else global_sequence
                end
              )::text,
              3,
              '0'
            ) as effective_doc_number
        from ranked
        where reverse_order = 1
      )
      update doc_number_sequences
      set last_year = latest.issue_year,
          last_month = latest.issue_month,
          last_sequence = latest.effective_sequence
      from latest
      where id = v_seq.id;

      return query
      with ranked as (
        select
          d.id,
          extract(year from d.issue_date)::int as issue_year,
          extract(month from d.issue_date)::int as issue_month,
          (row_number() over (
            partition by
              case when v_seq.reset_yearly then extract(year from d.issue_date)::int else 1 end,
              case when v_seq.reset_yearly then extract(month from d.issue_date)::int else 1 end
            order by d.issue_date, d.created_at, d.id
          ))::int as bucket_sequence,
          (row_number() over (
            order by d.issue_date, d.created_at, d.id
          ))::int as global_sequence,
          (row_number() over (
            order by d.issue_date desc, d.created_at desc, d.id desc
          ))::int as reverse_order
        from documents d
        where d.user_id = p_user_id
          and d.doc_type = v_seq.doc_type
      ),
      stats as (
        select count(*)::int as repaired_count
        from ranked
      ),
      latest as (
        select
          issue_year,
          issue_month,
          case
            when v_seq.reset_yearly then bucket_sequence
            else global_sequence
          end as effective_sequence,
          v_seq.prefix
            || '-' || (issue_year + case when (select cp.year_era from public.client_profiles cp where cp.user_id = p_user_id) = 'be' then 543 else 0 end)
            || '-' || lpad(issue_month::text, 2, '0')
            || '-' || lpad(
              (
                case
                  when v_seq.reset_yearly then bucket_sequence
                  else global_sequence
                end
              )::text,
              3,
              '0'
            ) as effective_doc_number
        from ranked
        where reverse_order = 1
      )
      select
        v_seq.doc_type,
        stats.repaired_count,
        latest.issue_year,
        latest.issue_month,
        latest.effective_sequence,
        latest.effective_doc_number
      from stats
      cross join latest;
    else
      update doc_number_sequences
      set last_year = null,
          last_month = null,
          last_sequence = 0
      where doc_number_sequences.id = v_seq.id;

      return query
      select v_seq.doc_type, 0, null::int, null::int, 0, null::text;
    end if;
  end loop;
end;
$function$;
