-- SSO employer identifiers for the สปส.1-10 filing header.
-- Head-office branch number defaults to 000000 (branches file separately).

alter table public.client_profiles
  add column if not exists sso_account_no text;

alter table public.client_profiles
  add column if not exists sso_branch_no text not null default '000000';
