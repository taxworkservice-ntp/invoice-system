-- Download Center: audit trail of every export/download.
--
-- Powers the "ประวัติการดาวน์โหลด" (download history) surface and lets owners
-- see who exported what. Rows are written client-side (best-effort) so the
-- insert policy requires the actor to be the signed-in member of the workspace.
--
-- Apply manually via the Supabase SQL editor or Management API.

create table if not exists public.download_audit (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid not null,
  kind          text not null,
  format        text not null,
  params        jsonb not null default '{}'::jsonb,
  file_count    integer not null default 0,
  status        text not null default 'success'
                check (status in ('success', 'partial', 'failed')),
  error         text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_download_audit_user_created
  on public.download_audit (user_id, created_at desc);

alter table public.download_audit enable row level security;

drop policy if exists "Members read download audit" on public.download_audit;
create policy "Members read download audit"
  on public.download_audit for select
  using (public.is_client_workspace_member(user_id));

drop policy if exists "Members write own download audit" on public.download_audit;
create policy "Members write own download audit"
  on public.download_audit for insert
  with check (
    public.is_client_workspace_member(user_id)
    and actor_user_id = auth.uid()
  );
