-- Admin-controlled document-number formats.
--
-- Presets only. The operator admin owns the format/padding/reset; the workspace
-- owner keeps prefix/start. Numbers are forward-only: existing documents are
-- never renumbered.
--
-- Apply manually via the Supabase SQL editor or Management API.

alter table public.doc_number_sequences
  add column if not exists format_preset text,
  add column if not exists seq_padding int,
  add column if not exists number_era text,
  add column if not exists reset_period text,
  add column if not exists period_key text;

-- Backfill existing sequences.
update public.doc_number_sequences
set format_preset = coalesce(format_preset, 'year_month'),
    seq_padding = coalesce(seq_padding, 4),
    reset_period = coalesce(
      reset_period,
      case when reset_yearly then 'monthly' else 'never' end
    )
where format_preset is null
   or seq_padding is null
   or reset_period is null;

update public.doc_number_sequences s
set number_era = coalesce(
  (
    select case
      when substring(d.doc_number from (length(s.prefix) + 2) for 4) ~ '^25[0-9]{2}$' then 'be'
      else 'ce'
    end
    from public.documents d
    where d.user_id = s.user_id
      and d.doc_type = s.doc_type
      and d.doc_number is not null
      and d.status <> 'voided'
      and left(d.doc_number, length(s.prefix) + 1) = s.prefix || '-'
    order by d.created_at desc
    limit 1
  ),
  (
    select case when cp.year_era = 'ce' then 'ce' else 'be' end
    from public.client_profiles cp
    where cp.user_id = s.user_id
  ),
  'be'
)
where s.number_era is null;

update public.doc_number_sequences
set period_key = case
  when reset_period = 'monthly' then
    coalesce(lpad(last_year::text, 4, '0') || '-' || lpad(last_month::text, 2, '0'), '')
  when reset_period = 'yearly' then
    coalesce(lpad(last_year::text, 4, '0'), '')
  else ''
end
where period_key is null;

alter table public.doc_number_sequences
  alter column format_preset set default 'year_month',
  alter column format_preset set not null,
  alter column seq_padding set default 4,
  alter column seq_padding set not null,
  alter column number_era set not null,
  alter column reset_period set not null;

alter table public.doc_number_sequences
  drop constraint if exists doc_number_sequences_format_preset_check;
alter table public.doc_number_sequences
  add constraint doc_number_sequences_format_preset_check
  check (format_preset in ('year_month', 'year', 'running', 'slash_year_month', 'short_year_month'));

alter table public.doc_number_sequences
  drop constraint if exists doc_number_sequences_seq_padding_check;
alter table public.doc_number_sequences
  add constraint doc_number_sequences_seq_padding_check
  check (seq_padding between 3 and 5);

alter table public.doc_number_sequences
  drop constraint if exists doc_number_sequences_number_era_check;
alter table public.doc_number_sequences
  add constraint doc_number_sequences_number_era_check
  check (number_era in ('be', 'ce'));

alter table public.doc_number_sequences
  drop constraint if exists doc_number_sequences_reset_period_check;
alter table public.doc_number_sequences
  add constraint doc_number_sequences_reset_period_check
  check (reset_period in ('never', 'yearly', 'monthly'));

-- ---------------------------------------------------------------------------
-- Initialise new sequences. Non-admins cannot choose a format on insert.
-- ---------------------------------------------------------------------------
create or replace function public.initialize_doc_number_sequence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_era text;
begin
  select case when cp.year_era = 'ce' then 'ce' else 'be' end
    into v_era
    from public.client_profiles cp
    where cp.user_id = new.user_id;
  v_era := coalesce(v_era, 'be');

  if public.is_admin() then
    new.format_preset := coalesce(new.format_preset, 'year_month');
    new.seq_padding := coalesce(new.seq_padding, 4);
    new.reset_period := coalesce(
      new.reset_period,
      case
        when new.format_preset = 'year' then 'yearly'
        when new.format_preset = 'running' then 'never'
        else 'monthly'
      end
    );
    new.number_era := coalesce(new.number_era, v_era);
  else
    new.format_preset := 'year_month';
    new.seq_padding := 4;
    new.reset_period := case when coalesce(new.reset_yearly, true) then 'monthly' else 'never' end;
    new.number_era := v_era;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_initialize_doc_number_sequence on public.doc_number_sequences;
create trigger trg_initialize_doc_number_sequence
  before insert on public.doc_number_sequences
  for each row execute function public.initialize_doc_number_sequence();

-- ---------------------------------------------------------------------------
-- Guard: only an admin may change the format; the era locks after the first
-- issued number.
-- ---------------------------------------------------------------------------
create or replace function public.guard_doc_number_format()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.format_preset is distinct from old.format_preset
     or new.seq_padding is distinct from old.seq_padding
     or new.reset_period is distinct from old.reset_period
     or new.number_era is distinct from old.number_era then
    if not public.is_admin() then
      raise exception 'Only an operator admin can change the document number format';
    end if;

    if new.number_era is distinct from old.number_era
       and exists (
         select 1
         from public.documents d
         where d.user_id = old.user_id
           and d.doc_type = old.doc_type
           and d.doc_number is not null
           and d.status <> 'voided'
       ) then
      raise exception 'The number year era is locked after the first document';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_doc_number_format on public.doc_number_sequences;
create trigger trg_guard_doc_number_format
  before update on public.doc_number_sequences
  for each row execute function public.guard_doc_number_format();

-- ---------------------------------------------------------------------------
-- Shared allocation helper (read-only). Used by the generator and the preview.
-- ---------------------------------------------------------------------------
create or replace function public.compute_doc_number(
  p_user_id uuid,
  p_doc_type public.document_type,
  p_issue_date date,
  p_prefix text,
  p_format_preset text,
  p_seq_padding int,
  p_reset_period text,
  p_number_era text,
  p_start_sequence int,
  p_last_sequence int
)
returns table (doc_number text, next_sequence int, period_key text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_format   text := coalesce(p_format_preset, 'year_month');
  v_padding  int := least(5, greatest(3, coalesce(p_seq_padding, 4)));
  v_reset    text := coalesce(
    p_reset_period,
    case
      when v_format = 'year' then 'yearly'
      when v_format = 'running' then 'never'
      else 'monthly'
    end
  );
  v_era      text := coalesce(p_number_era, 'be');
  v_start    int := greatest(1, coalesce(p_start_sequence, 1));
  v_last     int := greatest(0, coalesce(p_last_sequence, 0));
  v_date     date := coalesce(p_issue_date, current_date);
  v_year     int := extract(year from v_date)::int;
  v_month    int := extract(month from v_date)::int;
  v_display_year int;
  v_short_year text;
  v_period_prefix text;
  v_period_key text;
  v_max int := 0;
  v_next int;
  v_candidate text;
  v_attempt int := 0;
begin
  if v_format not in ('year_month', 'year', 'running', 'slash_year_month', 'short_year_month') then
    raise exception 'Invalid document number format preset';
  end if;
  if v_reset not in ('never', 'yearly', 'monthly') then
    raise exception 'Invalid document number reset period';
  end if;

  v_display_year := v_year + case when v_era = 'be' then 543 else 0 end;
  v_short_year := lpad((v_display_year % 100)::text, 2, '0');

  v_period_prefix := case v_format
    when 'year_month' then p_prefix || '-' || v_display_year || '-' || lpad(v_month::text, 2, '0') || '-'
    when 'year' then p_prefix || '-' || v_display_year || '-'
    when 'running' then p_prefix || '-'
    when 'slash_year_month' then p_prefix || '/' || v_display_year || '/' || lpad(v_month::text, 2, '0') || '/'
    when 'short_year_month' then p_prefix || '-' || v_short_year || '-' || lpad(v_month::text, 2, '0') || '-'
  end;

  v_period_key := case v_reset
    when 'monthly' then v_year::text || '-' || lpad(v_month::text, 2, '0')
    when 'yearly' then v_year::text
    else ''
  end;

  if v_reset = 'never' then
    v_next := greatest(v_start, v_last + 1);
  else
    select coalesce(
      max(case when length(t.trail) <= 9 then t.trail::bigint else 0 end),
      0
    )::int
    into v_max
    from (
      select substring(d.doc_number from '([0-9]+)$') as trail
      from public.documents d
      where d.user_id = p_user_id
        and d.doc_type = p_doc_type
        and d.doc_number is not null
        and d.status <> 'voided'
        and left(d.doc_number, length(v_period_prefix)) = v_period_prefix
    ) t;

    v_next := greatest(v_start, v_max + 1);
  end if;

  for v_attempt in 1..50 loop
    v_candidate := v_period_prefix || lpad(v_next::text, v_padding, '0');
    exit when not exists (
      select 1
      from public.documents d
      where d.user_id = p_user_id
        and d.doc_type = p_doc_type
        and d.doc_number = v_candidate
        and d.status <> 'voided'
    );
    v_next := v_next + 1;
  end loop;

  if exists (
    select 1
    from public.documents d
    where d.user_id = p_user_id
      and d.doc_type = p_doc_type
      and d.doc_number = v_candidate
      and d.status <> 'voided'
  ) then
    raise exception 'Could not allocate a unique document number';
  end if;

  return query select v_candidate, v_next, v_period_key;
end;
$$;

-- ---------------------------------------------------------------------------
-- Generator
-- ---------------------------------------------------------------------------
create or replace function public.generate_doc_number(
  p_user_id uuid,
  p_doc_type public.document_type,
  p_issue_date date
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq public.doc_number_sequences%rowtype;
  v_doc_number text;
  v_next_sequence int;
  v_period_key text;
begin
  select *
    into v_seq
    from public.doc_number_sequences
    where user_id = p_user_id and doc_type = p_doc_type
    for update;

  if not found then
    raise exception 'No sequence configured for this document type';
  end if;

  select c.doc_number, c.next_sequence, c.period_key
    into v_doc_number, v_next_sequence, v_period_key
    from public.compute_doc_number(
      p_user_id,
      p_doc_type,
      coalesce(p_issue_date, current_date),
      v_seq.prefix,
      v_seq.format_preset,
      v_seq.seq_padding,
      v_seq.reset_period,
      v_seq.number_era,
      v_seq.start_sequence,
      v_seq.last_sequence
    ) c;

  update public.doc_number_sequences
  set last_sequence = v_next_sequence,
      last_year = extract(year from coalesce(p_issue_date, current_date))::int,
      last_month = extract(month from coalesce(p_issue_date, current_date))::int,
      period_key = v_period_key
  where user_id = p_user_id and doc_type = p_doc_type;

  return v_doc_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- Read-only preview (owner or admin)
-- ---------------------------------------------------------------------------
create or replace function public.preview_doc_number(
  p_workspace_user_id uuid,
  p_doc_type public.document_type,
  p_issue_date date default current_date,
  p_format_preset text default null,
  p_seq_padding int default null,
  p_reset_period text default null
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_seq public.doc_number_sequences%rowtype;
  v_number text;
begin
  if not (public.is_workspace_owner(p_workspace_user_id) or public.is_admin()) then
    raise exception 'Not allowed to preview document numbers';
  end if;

  select *
    into v_seq
    from public.doc_number_sequences
    where user_id = p_workspace_user_id and doc_type = p_doc_type;

  if not found then
    return null;
  end if;

  select c.doc_number
    into v_number
    from public.compute_doc_number(
      p_workspace_user_id,
      p_doc_type,
      coalesce(p_issue_date, current_date),
      v_seq.prefix,
      coalesce(p_format_preset, v_seq.format_preset),
      coalesce(p_seq_padding, v_seq.seq_padding),
      coalesce(p_reset_period, v_seq.reset_period),
      v_seq.number_era,
      v_seq.start_sequence,
      v_seq.last_sequence
    ) c;

  return v_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin-only format save
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_doc_number_format(
  p_workspace_user_id uuid,
  p_rows jsonb,
  p_reason text
)
returns setof public.doc_number_sequences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_doc_type public.document_type;
  v_format text;
  v_padding int;
  v_reset text;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then
    raise exception 'Only an operator admin can change the document number format';
  end if;
  if length(v_reason) < 5 then
    raise exception 'A reason of at least 5 characters is required';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    begin
      v_doc_type := (v_row ->> 'doc_type')::public.document_type;
    exception when others then
      raise exception 'Invalid doc_type in payload';
    end;

    v_format := v_row ->> 'format_preset';
    v_padding := coalesce((v_row ->> 'seq_padding')::int, 4);
    v_reset := v_row ->> 'reset_period';

    if v_format not in ('year_month', 'year', 'running', 'slash_year_month', 'short_year_month') then
      raise exception 'Invalid format_preset for %', v_doc_type;
    end if;
    if v_padding < 3 or v_padding > 5 then
      raise exception 'seq_padding must be between 3 and 5';
    end if;
    if v_reset not in ('never', 'yearly', 'monthly') then
      raise exception 'Invalid reset_period for %', v_doc_type;
    end if;
    if v_format = 'running' and v_reset <> 'never' then
      raise exception 'Running-only numbers cannot reset';
    end if;
    if v_format = 'year' and v_reset = 'monthly' then
      raise exception 'Year format cannot reset monthly';
    end if;
    if v_format in ('year_month', 'slash_year_month', 'short_year_month') and v_reset = 'yearly' then
      raise exception 'Month formats cannot reset yearly';
    end if;

    update public.doc_number_sequences
    set format_preset = v_format,
        seq_padding = v_padding,
        reset_period = v_reset,
        last_change_reason = v_reason
    where user_id = p_workspace_user_id
      and doc_type = v_doc_type;

    if not found then
      raise exception 'No numbering row exists for %', v_doc_type;
    end if;
  end loop;

  return query
    select *
    from public.doc_number_sequences
    where user_id = p_workspace_user_id
    order by doc_type;
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner save: prefix/start only. Format is admin-only.
-- ---------------------------------------------------------------------------
create or replace function public.save_doc_number_sequences(
  p_workspace_user_id uuid,
  p_rows jsonb,
  p_reason text
)
returns setof public.doc_number_sequences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_doc_type public.document_type;
  v_prefix text;
  v_start int;
  v_reset boolean;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_workspace_owner(p_workspace_user_id) then
    raise exception 'Only the workspace owner can change document numbering';
  end if;
  if length(v_reason) < 5 then
    raise exception 'A reason of at least 5 characters is required';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    begin
      v_doc_type := (v_row ->> 'doc_type')::public.document_type;
    exception when others then
      raise exception 'Invalid doc_type in payload';
    end;

    v_prefix := trim(coalesce(v_row ->> 'prefix', ''));
    if v_prefix = '' then
      raise exception 'Prefix is required for %', v_doc_type;
    end if;
    v_start := greatest(1, coalesce((v_row ->> 'start_sequence')::int, 1));
    v_reset := coalesce((v_row ->> 'reset_yearly')::boolean, true);

    insert into public.doc_number_sequences (
      user_id,
      doc_type,
      prefix,
      reset_yearly,
      last_sequence,
      start_sequence,
      last_change_reason
    ) values (
      p_workspace_user_id,
      v_doc_type,
      v_prefix,
      v_reset,
      0,
      v_start,
      v_reason
    )
    on conflict (user_id, doc_type) do update
      set prefix = excluded.prefix,
          start_sequence = excluded.start_sequence,
          last_change_reason = excluded.last_change_reason
      where public.doc_number_sequences.prefix is distinct from excluded.prefix
         or public.doc_number_sequences.start_sequence is distinct from excluded.start_sequence;
  end loop;

  return query
    select *
    from public.doc_number_sequences
    where user_id = p_workspace_user_id
    order by doc_type;
end;
$$;

revoke all on function public.admin_save_doc_number_format(uuid, jsonb, text) from public, anon;
grant execute on function public.admin_save_doc_number_format(uuid, jsonb, text) to authenticated, service_role;
revoke all on function public.preview_doc_number(uuid, public.document_type, date, text, int, text) from public, anon;
grant execute on function public.preview_doc_number(uuid, public.document_type, date, text, int, text) to authenticated, service_role;
revoke all on function public.compute_doc_number(uuid, public.document_type, date, text, text, int, text, text, int, int) from public, anon, authenticated;
