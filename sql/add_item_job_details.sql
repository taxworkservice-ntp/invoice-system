alter table public.items
  add column if not exists has_job_details boolean not null default false;
