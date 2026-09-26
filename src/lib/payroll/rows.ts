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

/** Statutory month/year for a run, derived from its period end (as the page does). */
export function payrollRunPeriod(run: { period_end: string }): { month: number; year: number } {
  return {
    month: Number(run.period_end.slice(5, 7)),
    year: Number(run.period_end.slice(0, 4)),
  };
}
