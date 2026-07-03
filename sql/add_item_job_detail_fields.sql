alter table public.item_job_detail_presets
  drop constraint if exists item_job_detail_presets_field_key_check;

create table if not exists public.item_job_detail_fields (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  item_id     uuid not null references public.items(id) on delete cascade,
  field_key   text not null,
  label       text not null,
  field_type  text not null check (field_type in ('text', 'dimension')),
  sort_order  integer not null default 0,
  is_enabled  boolean not null default true,
  is_custom   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (item_id, field_key)
);

alter table public.item_job_detail_fields enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'item_job_detail_fields'
      and policyname = 'Client manages own job detail fields'
  ) then
    create policy "Client manages own job detail fields"
      on public.item_job_detail_fields for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'item_job_detail_fields'
      and policyname = 'Admin reads job detail fields'
  ) then
    create policy "Admin reads job detail fields"
      on public.item_job_detail_fields for select
      using (public.is_admin());
  end if;
end $$;

create index if not exists idx_item_job_detail_fields_item
  on public.item_job_detail_fields (item_id, sort_order);
