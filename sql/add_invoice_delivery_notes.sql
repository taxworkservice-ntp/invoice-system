alter table document_line_items
  add column if not exists source_document_id uuid references documents(id) on delete set null,
  add column if not exists source_line_item_id uuid references document_line_items(id) on delete set null;

create index if not exists idx_line_items_source_document
  on document_line_items(source_document_id);

create table if not exists invoice_delivery_notes (
  id                    uuid primary key default uuid_generate_v4(),
  invoice_id            uuid not null references documents(id) on delete cascade,
  delivery_note_id      uuid not null references documents(id) on delete restrict,
  user_id               uuid not null references profiles(id) on delete cascade,
  delivery_note_number  text not null,
  issue_date            date,
  subtotal              numeric(15,2) not null,
  vat_amount            numeric(15,2) not null,
  total_amount          numeric(15,2) not null,
  released_at           timestamptz,
  created_at            timestamptz not null default now()
);

alter table invoice_delivery_notes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'invoice_delivery_notes'
      and policyname = 'Client manages own invoice delivery notes'
  ) then
    create policy "Client manages own invoice delivery notes"
      on invoice_delivery_notes for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'invoice_delivery_notes'
      and policyname = 'Admin reads all invoice delivery notes'
  ) then
    create policy "Admin reads all invoice delivery notes"
      on invoice_delivery_notes for select
      using (public.is_admin());
  end if;
end $$;

create index if not exists idx_idn_invoice
  on invoice_delivery_notes(invoice_id);

create index if not exists idx_idn_delivery_note
  on invoice_delivery_notes(delivery_note_id);

create unique index if not exists idx_idn_one_active_invoice_per_dn
  on invoice_delivery_notes(delivery_note_id)
  where released_at is null;
