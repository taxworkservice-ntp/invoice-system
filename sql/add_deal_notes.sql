do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'deal_notes') then
    create table public.deal_notes (
      id          uuid primary key default uuid_generate_v4(),
      deal_id     uuid not null references public.deals(id) on delete cascade,
      user_id     uuid not null references auth.users(id) on delete cascade,
      content     text not null,
      created_at  timestamptz not null default now()
    );

    create index idx_deal_notes_deal on public.deal_notes(deal_id, created_at desc);

    alter table public.deal_notes enable row level security;

    create policy "Workspace members read deal notes"
      on public.deal_notes for select
      using (public.is_client_workspace_member(
        (select user_id from public.deals where id = deal_id)
      ));

    create policy "Workspace members insert deal notes"
      on public.deal_notes for insert
      with check (public.is_client_workspace_member(
        (select user_id from public.deals where id = deal_id)
      ));

    create policy "Admin manages deal notes"
      on public.deal_notes for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;
