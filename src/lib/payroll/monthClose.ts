import {
  applyRounding,
  calculateBreakdown,
  calculateMonthlyWithholdingTax,
  PND3_HIRE_RATE,
  type PayrollSettings,
} from "./calculations";
import { isSsoExemptByAge } from "./ssoEligibility";
import type { Employee, PayrollLineItem, PayrollRoundingRule } from "../../types";
import { createEmptyLineItem } from "./rows";

// Month-close aggregation for Thai statutory obligations.
//
// SSO (Section 33) and salary withholding are MONTHLY obligations: SSO is 5%
// of the month's total insurable wage (floor 1,650, ceiling 17,500 from Jan
// 2026, phased higher afterwards) filed via สปส.1-10, and PND1 withholding
// annualizes the month's total. Computing them per disbursement batch
// over-deducts whenever a month splits into several rounds (each batch would
// consume a fresh ceiling and its own progressive slice).
//
// Thai practice deducts the full monthly amount ONCE, in the month-end salary
// round. This module is the pure core of that rule:
//   1. `computeMonthlyObligations` — owed amounts per employee per month.
//   2. `closingSalaryRunId` — which round carries the deduction.
//   3. `attributeObligations` — closing draft round takes owed minus what
//      finalized siblings already stored; every other draft round takes zero.
//   4. `applyAttribution` — swap attributed SSO/WHT into a calc row while
//      keeping the gross − SSO − WHT − deductions = net invariant.
// Finalized runs always display stored values (immutable history).

export const SSO_WAGE_FLOOR = 1650;
export const SSO_WAGE_CEILING_2026 = 17500;
export const SSO_RATE = 0.05;

export interface MonthWageInput {
  employeeId: string;
  /** Month-total insurable wage (base + OT + additions − absence). */
  insurable: number;
  /** Contractors (ภ.ง.ด.3): per-payment 3%, never monthly-aggregated. */
  sso_registered?: boolean;
  /** Age-60 hires: zero SSO, progressive withholding on the month total. */
  sso_exempt?: boolean;
}

export interface MonthObligation {
  employeeId: string;
  insurable: number;
  /** Wage base after floor/ceiling (0 for contractors/exempt). */
  ssoBase: number;
  sso_employee: number;
  sso_employer: number;
  withholding_tax: number;
}

export interface MonthCloseOpts {
  ceiling?: number | null;
  rounding?: PayrollRoundingRule;
}

/** Contribution wage base: floor applies only when there is insurable wage. */
export function ssoWageBase(insurable: number, ceiling?: number | null): number {
  const wage = Number(insurable) || 0;
  if (wage <= 0) return 0;
  const floored = Math.max(wage, SSO_WAGE_FLOOR);
  const cap = ceiling != null && Number(ceiling) > 0 ? Number(ceiling) : SSO_WAGE_CEILING_2026;
  return Math.min(floored, cap);
}

export function computeMonthlyObligations(
  inputs: MonthWageInput[],
  opts?: MonthCloseOpts,
): MonthObligation[] {
  const rounding = opts?.rounding;
  const ceiling = opts?.ceiling;
  return inputs.map((input) => {
    const insurable = Math.max(0, Number(input.insurable) || 0);
    if (input.sso_registered === false) {
      // Contractors: flat ภ.ง.ด.3 per payment — kept per-run, never aggregated.
      const withholding_tax = applyRounding(insurable * PND3_HIRE_RATE, rounding);
      return { employeeId: input.employeeId, insurable, ssoBase: 0, sso_employee: 0, sso_employer: 0, withholding_tax };
    }
    if (input.sso_exempt === true) {
      const withholding_tax = applyRounding(calculateMonthlyWithholdingTax(insurable, 0), rounding);
      return { employeeId: input.employeeId, insurable, ssoBase: 0, sso_employee: 0, sso_employer: 0, withholding_tax };
    }
    const ssoBase = ssoWageBase(insurable, ceiling);
    const sso_employee = applyRounding(ssoBase * SSO_RATE, rounding);
    const sso_employer = applyRounding(ssoBase * SSO_RATE, rounding);
    const withholding_tax = applyRounding(
      calculateMonthlyWithholdingTax(insurable, sso_employee),
      rounding,
    );
    return { employeeId: input.employeeId, insurable, ssoBase, sso_employee, sso_employer, withholding_tax };
  });
}

export interface MonthRunRef {
  id: string;
  batch_type?: string | null;
  period_end: string;
}

/** Latest salary batch of the month carries the monthly deduction. */
export function closingSalaryRunId(runs: MonthRunRef[]): string | null {
  const salary = runs
    .filter((r) => (r.batch_type ?? "salary") === "salary")
    .sort((a, b) => (a.period_end < b.period_end ? 1 : -1));
  return salary[0]?.id ?? null;
}

export interface AttributedObligation {
  sso_employee: number;
  sso_employer: number;
  withholding_tax: number;
}

const ZERO_ATTR: AttributedObligation = { sso_employee: 0, sso_employer: 0, withholding_tax: 0 };

/**
 * Attribute monthly obligations to draft runs.
 * - Closing salary draft: owed minus what finalized siblings already stored
 *   (floored at zero — the month may already be settled).
 * - Every other draft: zero (settles in the closing round).
 * - Contractors always resolve per-run (zero here — the page keeps its calc).
 */
export function attributeObligations(params: {
  runs: MonthRunRef[];
  runStatuses: Map<string, "draft" | "finalized">;
  /** Monthly owed per employee. */
  owed: Map<string, MonthObligation>;
  /** Stored SSO/WHT per finalized run per employee (from DB rows). */
  storedFinalized: Map<string, Map<string, AttributedObligation>>;
  isContractor: (employeeId: string) => boolean;
}): Map<string, Map<string, AttributedObligation>> {
  const { runs, runStatuses, owed, storedFinalized, isContractor } = params;
  const closingId = closingSalaryRunId(runs);
  const result = new Map<string, Map<string, AttributedObligation>>();

  for (const r of runs) {
    if (runStatuses.get(r.id) !== "draft") continue;
    const perEmp = new Map<string, AttributedObligation>();
    for (const [empId, obligation] of owed) {
      if (isContractor(empId)) {
        perEmp.set(empId, { ...ZERO_ATTR });
        continue;
      }
      if (r.id !== closingId) {
        perEmp.set(empId, { ...ZERO_ATTR });
        continue;
      }
      let storedSso = 0;
      let storedEmp = 0;
      let storedWht = 0;
      for (const [, byEmp] of storedFinalized) {
        const s = byEmp.get(empId);
        if (!s) continue;
        storedSso += s.sso_employee;
        storedEmp += s.sso_employer;
        storedWht += s.withholding_tax;
      }
      perEmp.set(empId, {
        sso_employee: Math.max(0, obligation.sso_employee - storedSso),
        sso_employer: Math.max(0, obligation.sso_employer - storedEmp),
        withholding_tax: Math.max(0, obligation.withholding_tax - storedWht),
      });
    }
    result.set(r.id, perEmp);
  }
  return result;
}

export interface CalcLike {
  gross_pay: number;
  sso_employee: number;
  sso_employer: number;
  withholding_tax: number;
  deductions_total: number;
  net_pay: number;
}

export interface MonthCloseRun extends MonthRunRef {
  status: "draft" | "finalized";
  label?: string | null;
  period_start: string;
}

export interface ComputeMonthDataParams {
  employees: Employee[];
  runs: MonthCloseRun[];
  /** Effective line item per run per employee (recurring already merged as appropriate). */
  effectiveItems: Map<string, Map<string, PayrollLineItem>>;
  settings: PayrollSettings;
  month: number;
  year: number;
}

export interface MonthDataTotals {
  owedSso: number;
  owedWht: number;
  storedSso: number;
  storedWht: number;
  pendingSso: number;
  pendingWht: number;
}

export interface MonthDataResult {
  owed: Map<string, MonthObligation>;
  attributed: Map<string, Map<string, AttributedObligation>>;
  closingId: string | null;
  closingRun: MonthCloseRun | null;
  totals: MonthDataTotals;
  /** Draft rounds included in the numbers (for scope lines + audit). */
  draftRunIds: string[];
}

/**
 * Shared month computation behind the payroll page and the admin export
 * center: month-total insurable wages → monthly obligations → attribution to
 * draft runs. Pure: callers supply effective items (live on the client page,
 * stored on the admin side).
 */
export function computeMonthData(params: ComputeMonthDataParams): MonthDataResult | null {
  const { employees, runs, effectiveItems, settings, month, year } = params;
  if (employees.length === 0 || runs.length === 0) return null;
  const dust = (n: number) => (n < 0.01 ? 0 : n);

  const wageInputs: MonthWageInput[] = employees.map((emp) => {
    let total = 0;
    for (const r of runs) {
      const ot = (r.batch_type ?? "salary") === "ot";
      const item =
        effectiveItems.get(r.id)?.get(emp.id) ?? createEmptyLineItem(r.id, emp.id);
      const calc = calculateBreakdown(
        {
          salary_type: emp.salary_type,
          base_salary: emp.base_salary,
          days_worked: item.days_worked,
          absent_days: item.absent_days,
          absence_daily_rate: item.absence_daily_rate,
          ot_entries: item.ot_entries,
          additions: item.additions,
          deductions: item.deductions,
          sso_registered: emp.sso_registered !== false,
          sso_exempt: isSsoExemptByAge(emp),
        },
        settings,
        month,
        year,
        ot ? { scope: "ot-only" } : undefined,
      );
      total += calc.gross_pay;
    }
    return {
      employeeId: emp.id,
      insurable: total,
      sso_registered: emp.sso_registered !== false,
      sso_exempt: isSsoExemptByAge(emp),
    };
  });

  const owedList = computeMonthlyObligations(wageInputs, {
    ceiling: settings.sso_ceiling_override ?? undefined,
    rounding: settings.rounding_rule,
  });
  const owed = new Map(owedList.map((o) => [o.employeeId, o]));

  // Stored SSO/WHT come from finalized runs only. Draft stored rows hold
  // working values that attribution recomputes — reading them here would
  // double-count against the attributed amounts below.
  const storedFinalized = new Map<string, Map<string, AttributedObligation>>();
  for (const r of runs) {
    if (r.status !== "finalized") continue;
    const perEmp = new Map<string, AttributedObligation>();
    for (const [, item] of effectiveItems.get(r.id) ?? []) {
      if (item.gross_pay == null) continue;
      perEmp.set(item.employee_id, {
        sso_employee: Number(item.sso_employee) || 0,
        sso_employer: Number(item.sso_employer) || 0,
        withholding_tax: Number(item.withholding_tax) || 0,
      });
    }
    storedFinalized.set(r.id, perEmp);
  }

  const empById = new Map(employees.map((e) => [e.id, e]));
  const attributed = attributeObligations({
    runs,
    runStatuses: new Map(runs.map((r) => [r.id, r.status])),
    owed,
    storedFinalized,
    isContractor: (id) => (empById.get(id)?.sso_registered ?? true) === false,
  });

  let owedSso = 0;
  let owedWht = 0;
  let storedSso = 0;
  let storedWht = 0;
  let attrSso = 0;
  let attrWht = 0;
  for (const [, o] of owed) {
    owedSso += o.sso_employee;
    owedWht += o.withholding_tax;
  }
  for (const [, m] of storedFinalized)
    for (const [, s] of m) {
      storedSso += s.sso_employee;
      storedWht += s.withholding_tax;
    }
  for (const [, m] of attributed)
    for (const [, a] of m) {
      attrSso += a.sso_employee;
      attrWht += a.withholding_tax;
    }

  const closingId = closingSalaryRunId(runs);
  const closingRun = runs.find((r) => r.id === closingId) ?? null;
  return {
    owed,
    attributed,
    closingId,
    closingRun,
    totals: {
      owedSso,
      owedWht,
      storedSso,
      storedWht,
      pendingSso: dust(Math.max(0, owedSso - storedSso - attrSso)),
      pendingWht: dust(Math.max(0, owedWht - storedWht - attrWht)),
    },
    draftRunIds: runs.filter((r) => r.status === "draft").map((r) => r.id),
  };
}

/**
 * Swap attributed SSO/WHT into a calc row, re-deriving net so the payslip
 * invariant (gross − SSO − WHT − deductions = net) always holds exactly.
 */
export function applyAttribution<T extends CalcLike>(
  calc: T,
  attr: AttributedObligation,
  rounding?: PayrollRoundingRule,
): T {
  const net_pay = applyRounding(
    calc.gross_pay - attr.sso_employee - attr.withholding_tax - calc.deductions_total,
    rounding,
  );
  return {
    ...calc,
    sso_employee: attr.sso_employee,
    sso_employer: attr.sso_employer,
    withholding_tax: attr.withholding_tax,
    net_pay,
  };
}
