-- ============================================================
-- Payroll calculation customization (client-level settings)
-- ============================================================

alter table client_payroll_settings
  add column if not exists prorate_mode         text not null default 'fixed_30',
  add column if not exists absence_deduction    boolean not null default true,
  add column if not exists rounding_rule        text not null default 'round',
  add column if not exists sso_ceiling_override numeric(10,2),
  add column if not exists pay_frequency        text not null default 'monthly',
  add column if not exists pay_anchor_day       int not null default 1,
  add column if not exists pay_cycle_len_days   int;

do $$
begin
  alter table client_payroll_settings add constraint client_payroll_settings_prorate_mode_check
    check (prorate_mode in ('fixed_30', 'actual_days'));
exception when duplicate_object then null; end $$;

do $$
begin
  alter table client_payroll_settings add constraint client_payroll_settings_rounding_rule_check
    check (rounding_rule in ('round', 'floor', 'ceil'));
exception when duplicate_object then null; end $$;

do $$
begin
  alter table client_payroll_settings add constraint client_payroll_settings_pay_frequency_check
    check (pay_frequency in ('monthly', 'semimonthly', 'weekly', 'custom'));
exception when duplicate_object then null; end $$;

-- Per-line-item absence days (drives auto deduction for monthly & daily staff)
alter table payroll_line_items add column if not exists absent_days numeric(4,1);
