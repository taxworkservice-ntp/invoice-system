-- ============================================================
-- MIGRATION: customer favorites + custom avatar
-- Adds:
--   is_favorite     boolean not null default false
--   avatar_initials text    -- override initials (null = auto from name)
--   avatar_color    text    -- override avatar color (null = auto hash from name)
-- ============================================================

alter table customers
  add column if not exists is_favorite     boolean not null default false,
  add column if not exists avatar_initials text,
  add column if not exists avatar_color    text;

-- Partial index for fast "favorites only" filtering
create index if not exists idx_customers_favorite
  on customers (user_id, is_favorite)
  where is_favorite = true;

-- updated_at trigger should already cover this table, but make sure
-- (handle_updated_at is defined in schema.sql on customers)
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'handle_updated_at_customers'
  ) then
    create trigger handle_updated_at_customers
      before update on customers
      for each row execute function public.handle_updated_at();
  end if;
end $$;
