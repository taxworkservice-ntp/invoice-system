create table if not exists files (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references profiles(id) on delete cascade,
  document_id   uuid references documents(id) on delete cascade,
  r2_key        text not null unique,
  purpose       text not null check (purpose in ('logos', 'signatures', 'stamps', 'pdfs', 'exports', 'attachments')),
  filename      text not null,
  content_type  text not null,
  size_bytes    bigint not null default 0 check (size_bytes >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table files enable row level security;

drop policy if exists "Client manages own file metadata" on files;
create policy "Client manages own file metadata"
  on files for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Admin reads all file metadata" on files;
create policy "Admin reads all file metadata"
  on files for select
  using (public.is_admin());

create index if not exists idx_files_user_purpose on files(user_id, purpose);
create index if not exists idx_files_document on files(document_id);

drop trigger if exists trg_files_updated_at on files;
create trigger trg_files_updated_at
  before update on files
  for each row execute function handle_updated_at();
