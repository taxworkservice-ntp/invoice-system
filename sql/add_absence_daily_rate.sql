-- Payroll: manual per-day absence rate override.
-- When set (> 0), the absence deduction uses absent_days × absence_daily_rate
-- instead of the derived rate (base_salary ÷ divisor days).
alter table payroll_line_items
  add column if not exists absence_daily_rate numeric(12,2);
