-- Rebuild existing document numbers from issue_date and resync sequence rows.
-- Use p_force_reset_yearly = true for older clients created before monthly-reset mode.

create or replace function repair_doc_numbers(
  p_user_id uuid,
  p_doc_type document_type default null,
  p_force_reset_yearly boolean default false
)
returns table (
  doc_type document_type,
  repaired_count int,
  last_year int,
  last_month int,
  last_sequence int,
  last_doc_number text
) as $$
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
      || '-' || ranked.issue_year
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
            || '-' || issue_year
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
            || '-' || issue_year
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
$$ language plpgsql security definer;


-- Examples
-- Repair every document type for one client and force monthly reset mode:
-- select * from repair_doc_numbers('86793ad7-0d1d-475a-92d9-66457bcec768', null, true);

-- Repair only quotations for one client:
-- select * from repair_doc_numbers('86793ad7-0d1d-475a-92d9-66457bcec768', 'quotation', true);
