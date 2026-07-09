alter table customers
  add column if not exists code text,
  add column if not exists credit_term_days int;

create unique index if not exists idx_customers_user_code_unique
  on customers (user_id, lower(code))
  where code is not null;
