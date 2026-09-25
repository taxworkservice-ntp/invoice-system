-- Payroll overlap rule goes per disbursement type.
--
-- Before: no two runs of a workspace could share calendar days at all, so a
-- real-world cadence (salary 1–15 + OT 1–5/6–10/…) was unrepresentable —
-- every OT slice collided with its salary window.
--
-- After: same-type runs still cannot overlap (two salary runs must never
-- double-pay), but different types may share days. Tax/SSO are unaffected:
-- they already aggregate by statutory month (month of period_end) across
-- all runs. Adjustments were the other victim of the old rule — a
-- correction slice necessarily shares days with the run it corrects.
--
-- Existing data satisfied the stricter rule, so it satisfies this one too.
-- Apply manually (Supabase SQL editor or Management API) per AGENTS.md.

alter table public.payroll_runs
  drop constraint if exists payroll_runs_no_overlap;

alter table public.payroll_runs
  add constraint payroll_runs_no_overlap_same_type
  exclude using gist (
    user_id with =,
    batch_type with =,
    daterange(period_start, period_end, '[]') with &&
  );
