import { applyRounding, calculateMonthlyWithholdingTax, PND3_HIRE_RATE } from "./calculations";
import type { PayrollRoundingRule } from "../../types";

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
