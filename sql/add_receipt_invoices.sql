create table if not exists public.receipt_invoices (
  id                  uuid primary key default uuid_generate_v4(),
  receipt_id          uuid not null references public.documents(id) on delete cascade,
  invoice_id          uuid not null references public.documents(id) on delete restrict,
  source_billing_note_id uuid references public.documents(id) on delete set null,
  user_id             uuid not null references public.profiles(id) on delete cascade,
  invoice_number      text not null,
  issue_date          date,
  subtotal            numeric(15,2) not null,
  vat_amount          numeric(15,2) not null,
  total_amount        numeric(15,2) not null,
  paid_amount         numeric(15,2) not null,
  created_at          timestamptz not null default now(),
  unique (receipt_id, invoice_id)
);

alter table public.receipt_invoices enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'receipt_invoices'
      and policyname = 'Client manages own receipt invoices'
  ) then
    create policy "Client manages own receipt invoices"
      on public.receipt_invoices for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'receipt_invoices'
      and policyname = 'Admin reads all receipt invoices'
  ) then
    create policy "Admin reads all receipt invoices"
      on public.receipt_invoices for select
      using (public.is_admin());
  end if;
end $$;

create index if not exists idx_ri_receipt on public.receipt_invoices(receipt_id);
create index if not exists idx_ri_invoice on public.receipt_invoices(invoice_id);
