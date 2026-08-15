-- ============================================================
-- MIGRATION: per-user interface preferences
-- ============================================================

create table if not exists public.user_preferences (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  new_deal_favorites  text[] not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "Users manage own preferences" on public.user_preferences;
create policy "Users manage own preferences"
  on public.user_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists handle_updated_at_user_preferences on public.user_preferences;
create trigger handle_updated_at_user_preferences
  before update on public.user_preferences
  for each row execute function public.handle_updated_at();
