create table if not exists public.item_job_detail_presets (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  item_id     uuid not null references public.items(id) on delete cascade,
  field_key   text not null check (field_key in ('color', 'position', 'material', 'remark')),
  value       text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (item_id, field_key, value)
);

alter table public.item_job_detail_presets enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'item_job_detail_presets'
      and policyname = 'Client manages own job detail presets'
  ) then
    create policy "Client manages own job detail presets"
      on public.item_job_detail_presets for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'item_job_detail_presets'
      and policyname = 'Admin reads job detail presets'
  ) then
    create policy "Admin reads job detail presets"
      on public.item_job_detail_presets for select
      using (public.is_admin());
  end if;
end $$;

create index if not exists idx_item_job_detail_presets_item
  on public.item_job_detail_presets (item_id, field_key, sort_order);
