-- Custom workspace roles + permission audit log
-- Owner/admin can create named roles with custom permission sets;
-- client_members.custom_role_id assigns a custom role to a member.

create table if not exists client_roles (
  id                uuid primary key default uuid_generate_v4(),
  workspace_user_id uuid not null references profiles(id) on delete cascade,
  name              text not null,
  permissions       jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (workspace_user_id, name)
);

alter table client_roles enable row level security;

-- Members (and the owner) can read roles of their own workspace.
-- Writes happen only through the service-role APIs (no insert/update/delete policies).
create policy "Workspace members read custom roles"
  on client_roles for select
  using (
    public.is_admin()
    or workspace_user_id = auth.uid()
    or exists (
      select 1
      from public.client_members cm
      where cm.workspace_user_id = client_roles.workspace_user_id
        and cm.member_user_id = auth.uid()
        and cm.status = 'active'
    )
  );

alter table client_members add column if not exists custom_role_id uuid references client_roles(id) on delete set null;

create index if not exists idx_client_members_custom_role
  on client_members (custom_role_id);

create table if not exists client_permission_audit (
  id                uuid primary key default uuid_generate_v4(),
  workspace_user_id uuid not null,
  actor_user_id     uuid not null,
  target_member_id  uuid,
  action            text not null,
  before            jsonb,
  after             jsonb,
  created_at        timestamptz not null default now()
);

alter table client_permission_audit enable row level security;

-- Only the workspace owner, admins, and the service role can read audit entries.
create policy "Workspace owner and admin read permission audit"
  on client_permission_audit for select
  using (public.is_admin() or workspace_user_id = auth.uid());

create index if not exists idx_client_permission_audit_workspace
  on client_permission_audit (workspace_user_id, created_at desc);
