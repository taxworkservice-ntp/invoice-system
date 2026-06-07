alter table documents
  add column if not exists backdated_at timestamptz,
  add column if not exists backdated_by_user_id uuid references profiles(id) on delete set null,
  add column if not exists backdated_reason text;
