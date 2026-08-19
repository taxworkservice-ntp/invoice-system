-- Receipts created before the WHT fix stored wht_amount = rate x amount_received
-- (the received cash includes the VAT portion), instead of rate x pre-VAT subtotal.
--
-- Recompute each receipt's WHT from its source document the professional way:
--   expected WHT      = source.wht_amount (rate x source subtotal)
--   per receipt       = expected WHT x amount_received / source.net_payable
--   final receipt     = takes the remainder so the sum of WHT across receipts
--                       for a source equals the full expected WHT
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
    s.wht_amount as expected_wht,
    s.net_payable,
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
        then round((expected_wht - coalesce(sum(round(expected_wht * amount_received / nullif(net_payable, 0) * 100) / 100) over (
          partition by converted_from_id
          order by rn
          rows between unbounded preceding and 1 preceding
        ), 0)) * 100) / 100
      else round(expected_wht * amount_received / nullif(net_payable, 0) * 100) / 100
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