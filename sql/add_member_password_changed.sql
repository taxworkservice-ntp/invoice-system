-- Add password_changed flag to client_members for staff force-change-password flow
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'client_members' and column_name = 'password_changed'
  ) then
    alter table public.client_members add column password_changed boolean not null default true;
  end if;
end $$;
