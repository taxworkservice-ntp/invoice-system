-- Prevent a single invoice from being linked to more than one ACTIVE billing note.
-- Mirrors the delivery-note -> invoice invariant (invoice_delivery_notes.released_at):
-- an invoice may be billed again only after its current billing note is released
-- (voided). A paid billing note keeps its link active so the invoice cannot be
-- re-billed, which is the correct behaviour.

alter table billing_note_invoices
  add column if not exists released_at timestamptz;

-- Release links that already belong to a voided billing note so those invoices
-- can be re-billed.
update billing_note_invoices b
set released_at = now()
from documents d
where b.billing_note_id = d.id
  and d.doc_type = 'billing_note'
  and d.status = 'voided'
  and b.released_at is null;

create or replace function prevent_duplicate_active_billing_note()
returns trigger
language plpgsql
as $$
begin
  -- A released (e.g. voided) link never blocks anything.
  if new.released_at is not null then
    return new;
  end if;

  -- An invoice may only have one active billing-note link. The same billing
  -- note re-saving its own links is allowed (billing_note_id matches).
  if exists (
    select 1
    from billing_note_invoices
    where invoice_id = new.invoice_id
      and released_at is null
      and billing_note_id <> new.billing_note_id
  ) then
    raise exception 'invoice % is already linked to an active billing note', new.invoice_id
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_duplicate_active_billing_note
  on billing_note_invoices;

create trigger trg_prevent_duplicate_active_billing_note
  before insert or update on billing_note_invoices
  for each row
  execute function prevent_duplicate_active_billing_note();
