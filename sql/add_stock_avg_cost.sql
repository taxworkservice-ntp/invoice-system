alter table items
  add column if not exists avg_cost numeric(15,2) not null default 0,
  add column if not exists stock_value numeric(15,2) not null default 0;

alter table stock_movements
  add column if not exists unit_cost numeric(15,2),
  add column if not exists movement_value numeric(15,2),
  add column if not exists balance_value_after numeric(15,2);

update items
set
  avg_cost = case
    when stock_count > 0 then coalesce(unit_price, 0)
    else 0
  end,
  stock_value = round((coalesce(stock_count, 0) * coalesce(unit_price, 0))::numeric, 2)
where coalesce(avg_cost, 0) = 0
   or coalesce(stock_value, 0) = 0;

update stock_movements sm
set
  unit_cost = coalesce(sm.unit_cost, i.avg_cost),
  movement_value = coalesce(
    sm.movement_value,
    round((abs(sm.qty_base) * coalesce(i.avg_cost, 0))::numeric, 2)
  ),
  balance_value_after = coalesce(
    sm.balance_value_after,
    round((coalesce(sm.balance_after, 0) * coalesce(i.avg_cost, 0))::numeric, 2)
  )
from items i
where i.id = sm.item_id;
