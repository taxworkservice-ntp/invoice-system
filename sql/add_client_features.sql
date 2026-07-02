create table if not exists public.client_features (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  feature_key text not null check (feature_key in ('service_job_details')),
  enabled     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, feature_key)
);

alter table public.client_features enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'client_features'
      and policyname = 'Client reads own features'
  ) then
    create policy "Client reads own features"
      on public.client_features for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'client_features'
      and policyname = 'Admin manages client features'
  ) then
    create policy "Admin manages client features"
      on public.client_features for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;

create index if not exists idx_client_features_user_enabled
  on public.client_features (user_id, enabled);

drop trigger if exists trg_client_features_updated_at on public.client_features;
create trigger trg_client_features_updated_at
  before update on public.client_features
  for each row execute function public.handle_updated_at();
