-- Receipts store amount_received = the net cash paid (the customer pays net of
-- the 3% withholding tax). To be audit-correct, the WHT must be derived on the
-- pre-tax billed portion so that, across all receipts for a source:
--   sum(pre-tax) = source subtotal, sum(VAT) = source VAT,
--   sum(gross received) = source total, sum(WHT) = source WHT,
--   sum(net cash) = sum(amount_received) = source net payable.
--
-- For each cash payment N (vat v, wht w):
--   pre-tax P  = N / (1 + v - w)
--   per receipt WHT = P x w
--   final receipt    = takes the remainder so the sum of WHT across receipts
--                      for a source equals the full expected WHT
--
-- The action-permission trigger blocks edits to issued documents outside the
-- app flow, and auth.uid() is null when run from the SQL editor, so the trigger
-- is temporarily disabled around this admin backfill.

begin;

alter table public.documents disable trigger trg_enforce_document_action_permission;

with ranked as (
  select
    r.id,
    r.converted_from_id,
    r.amount_received,
    r.vat_rate,
    r.wht_rate,
    s.wht_amount as expected_wht,
    s.net_payable,
    round(
      r.amount_received
        / nullif(1 + coalesce(r.vat_rate, 0) / 100 - coalesce(r.wht_rate, 0) / 100, 0)
        * coalesce(r.wht_rate, 0) / 100
        * 100
    ) / 100 as direct_wht,
    row_number() over (
      partition by r.converted_from_id
      order by r.created_at, r.id
    ) as rn,
    count(*) over (partition by r.converted_from_id) as total_receipts,
    sum(r.amount_received) over (partition by r.converted_from_id) as total_received
  from public.documents r
  join public.documents s on s.id = r.converted_from_id
  where r.doc_type = 'receipt'
    and r.status <> 'voided'
    and s.wht_amount > 0
    and coalesce(r.amount_received, 0) > 0
),
allocated as (
  select
    id,
    case
      when rn = total_receipts and total_received >= net_payable - 0.01
        then round((expected_wht - coalesce(sum(direct_wht) over (
          partition by converted_from_id
          order by rn
          rows between unbounded preceding and 1 preceding
        ), 0)) * 100) / 100
      else direct_wht
    end as new_wht
  from ranked
)
update public.documents d
set wht_amount = a.new_wht
from allocated a
where d.id = a.id
  and a.new_wht >= 0
  and round(d.wht_amount * 100) <> round(a.new_wht * 100);

alter table public.documents enable trigger trg_enforce_document_action_permission;

commit;
