import type { Employee, PayrollLineItem } from "../../types";
import { calculateBreakdown, type PayrollCalcOpts, type PayrollSettings } from "./calculations";
import { applyRecurringTemplates, type RecurringTemplate } from "./recurring";
import { isSsoExemptByAge } from "./ssoEligibility";
import type { PayrollCalcRow } from "./reportXlsx";

/** Blank line item for an employee with no stored row yet. */
export function createEmptyLineItem(runId: string, employeeId: string): PayrollLineItem {
  return {
    id: "",
    payroll_run_id: runId,
    employee_id: employeeId,
    days_worked: null,
    ot_entries: [],
    additions: [],
    deductions: [],
    absent_days: null,
    absence_daily_rate: null,
    gross_pay: null,
    sso_employee: null,
    sso_employer: null,
    withholding_tax: null,
    net_pay: null,
    employee_code_snapshot: null,
    full_name_snapshot: null,
    position_snapshot: null,
    salary_type_snapshot: null,
    base_salary_snapshot: null,
  };
}

/**
 * Raw stored item with active recurring templates merged in (view/save layer,
 * shared by the payroll page and the Download Center exports).
 *
 * OT rounds pass `includeRecurring: false`: monthly allowances belong to
 * salary rounds and must not sneak into every OT batch.
 */
export function resolveEffectiveLineItem(
  employeeId: string,
  lineItems: Map<string, PayrollLineItem>,
  recurringByEmployee: Map<string, RecurringTemplate[]>,
  runId: string,
  opts?: { includeRecurring?: boolean },
): PayrollLineItem {
  const raw = lineItems.get(employeeId) ?? createEmptyLineItem(runId, employeeId);
  if (opts?.includeRecurring === false) return raw;
  const templates = recurringByEmployee.get(employeeId) ?? [];
  if (templates.length === 0) return raw;
  const merged = applyRecurringTemplates(raw, templates);
  return { ...raw, additions: merged.additions, deductions: merged.deductions };
}

/**
 * Single source of truth for payroll calc rows — used by the Payroll page
 * (display + exports) and the Download Center. Pure: no network, no React.
 */
export function buildPayrollCalcRows(params: {
  employees: readonly Employee[];
  lineItems: Map<string, PayrollLineItem>;
  settings: PayrollSettings;
  month: number;
  year: number;
  recurringByEmployee: Map<string, RecurringTemplate[]>;
  runId: string;
  calcOpts?: PayrollCalcOpts;
  includeRecurring?: boolean;
}): PayrollCalcRow[] {
  const {
    employees,
    lineItems,
    settings,
    month,
    year,
    recurringByEmployee,
    runId,
    calcOpts,
    includeRecurring,
  } = params;
  return employees.map((employee) => {
    const effective = resolveEffectiveLineItem(employee.id, lineItems, recurringByEmployee, runId, {
      includeRecurring,
    });
    const calc = calculateBreakdown(
      {
        salary_type: employee.salary_type,
        base_salary: employee.base_salary,
        days_worked: effective.days_worked,
        absent_days: effective.absent_days,
        absence_daily_rate: effective.absence_daily_rate,
        ot_entries: effective.ot_entries,
        additions: effective.additions,
        deductions: effective.deductions,
        sso_registered: employee.sso_registered !== false,
        // Thai SSO age-60 rule: hires already 60+ on their start date keep
        // progressive salary withholding but get zero SSO (see calculateNet).
        sso_exempt: isSsoExemptByAge(employee),
      },
      settings,
      month,
      year,
      calcOpts,
    );
    return { employee, lineItem: lineItems.get(employee.id) ?? null, ...calc };
  });
}

export type RowStatus = "complete" | "warning" | "incomplete" | "untouched";

/**
 * Per-row readiness for the payroll table (drives the accent border + the
 * finalize gate).
 * - Monthly staff earn full base by default: an empty row is complete.
 * - Daily staff need days_worked — EXCEPT in OT rounds, where day tracking
 *   is hidden and base is zero, so OT entries alone complete the row.
 */
export function getRowStatus(
  employee: Employee,
  item: PayrollLineItem,
  opts?: { isOtRun?: boolean },
): RowStatus {
  const isOtRun = opts?.isOtRun === true;
  const hasOT = item.ot_entries.length > 0;
  const hasDaysWorked = item.days_worked !== null && item.days_worked > 0;
  const hasAbsences = (item.absent_days ?? 0) > 0;
  const hasAdditions = item.additions.length > 0;
  const hasDeductions = item.deductions.length > 0;
  const hasData = hasDaysWorked || hasAbsences || hasOT || hasAdditions || hasDeductions;

  // Monthly staff earn their full base salary by default — a row with no extra
  // inputs is complete and finalizable. Daily staff need days_worked recorded,
  // unless this is an OT round (no day entry, no base pay).
  if (!hasData) return employee.salary_type === "daily" && !isOtRun ? "untouched" : "complete";
  if (employee.salary_type === "daily" && !hasDaysWorked && !isOtRun) return "incomplete";
  if (
    hasOT &&
    item.ot_entries.some((entry) => Number(entry.hours) <= 0 || Number(entry.multiplier) <= 0)
  )
    return "warning";
  if (
    hasAdditions &&
    item.additions.some((entry) => !entry.label.trim() || Number(entry.amount) < 0)
  )
    return "warning";
  if (
    hasDeductions &&
    item.deductions.some((entry) => !entry.label.trim() || Number(entry.amount) < 0)
  )
    return "warning";
  return "complete";
}

/** Statutory month/year for a run, derived from its period end (as the page does). */
export function payrollRunPeriod(run: { period_end: string }): { month: number; year: number } {
  return {
    month: Number(run.period_end.slice(5, 7)),
    year: Number(run.period_end.slice(0, 4)),
  };
}
