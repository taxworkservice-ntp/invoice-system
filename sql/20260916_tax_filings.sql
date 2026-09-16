-- Tax pack: per-month manual input VAT for the ภ.พ.30 worksheet.
--
-- The app has no purchases/expenses ledger, so input VAT (ภาษีซื้อ) cannot be
-- derived; the owner enters it here and it is persisted per period.
--
-- Apply manually via the Supabase SQL editor or Management API.

create table if not exists public.tax_filings (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  period_year   int not null,
  period_month  int not null check (period_month between 1 and 12),
  input_vat     numeric(15,2) not null default 0,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, period_year, period_month)
);

create index if not exists idx_tax_filings_user_period
  on public.tax_filings (user_id, period_year desc, period_month desc);

alter table public.tax_filings enable row level security;

drop policy if exists "Members read tax filings" on public.tax_filings;
create policy "Members read tax filings"
  on public.tax_filings for select
  using (public.is_client_workspace_member(user_id));

drop policy if exists "Members manage tax filings" on public.tax_filings;
create policy "Members manage tax filings"
  on public.tax_filings for all
  using (public.is_client_workspace_member(user_id))
  with check (public.is_client_workspace_member(user_id));

drop trigger if exists trg_tax_filings_updated_at on public.tax_filings;
create trigger trg_tax_filings_updated_at
  before update on public.tax_filings
  for each row execute function handle_updated_at();
