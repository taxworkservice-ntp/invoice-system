import type { OtEntry, PayrollProrateMode, PayrollRoundingRule } from "../../types";

export interface PayrollSettings {
  ot_divisor: number;
  normal_ot_multiplier: number;
  holiday_ot_multiplier: number;
  prorate_mode?: PayrollProrateMode;
  absence_deduction?: boolean;
  rounding_rule?: PayrollRoundingRule;
  sso_ceiling_override?: number | null;
}

export interface PayrollLineInput {
  salary_type: "monthly" | "daily";
  base_salary: number;
  days_worked: number | null;
  absent_days?: number | null;
  ot_entries: OtEntry[];
  additions: { label: string; amount: number }[];
  deductions: { label: string; amount: number }[];
  sso_registered?: boolean;
}

export interface PayrollResult {
  gross_pay: number;
  sso_employee: number;
  sso_employer: number;
  withholding_tax: number;
  net_pay: number;
}

export interface PayrollBreakdown extends PayrollResult {
  base_pay: number;
  absence_deduction: number;
  ot_pay: number;
  additions_total: number;
  deductions_total: number;
  hourly_rate: number;
}

const SSO_CEILING = 17500;
const SSO_RATE = 0.05;
export const PND3_HIRE_RATE = 0.03;

const PND1_BRACKETS = [
  { limit: 150000, rate: 0 },
  { limit: 300000, rate: 0.05 },
  { limit: 500000, rate: 0.10 },
  { limit: 750000, rate: 0.15 },
  { limit: 1000000, rate: 0.20 },
  { limit: 2000000, rate: 0.25 },
  { limit: 5000000, rate: 0.30 },
  { limit: Infinity, rate: 0.35 },
];

const PERSONAL_DEDUCTION = 60000;

// ---------- Customization primitives ----------

export function getMonthDays(month: number, year?: number): number {
  if (year !== undefined) return new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dim = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dim[Math.min(12, Math.max(1, month)) - 1];
}

/**
 * Day-count denominator used to convert monthly salary into daily/hourly equivalents.
 * - fixed_30: uses the client's configured divisor (default 30) — stable year-round.
 * - actual_days: uses the real number of days in the statutory month (leap-aware when year is provided).
 */
export function resolveDivisorDays(settings: PayrollSettings, month: number, year?: number): number {
  if (settings.prorate_mode === "actual_days") return getMonthDays(month, year);
  const divisor = Number(settings.ot_divisor) || 30;
  return divisor > 0 ? divisor : 30;
}

export function applyRounding(n: number, rule: PayrollRoundingRule | undefined): number {
  const value = n * 100;
  const factor = 100;
  let result: number;
  switch (rule) {
    case "floor":
      result = Math.floor(value) / factor;
      break;
    case "ceil":
      result = Math.ceil(value) / factor;
      break;
    default:
      result = Math.round(value) / factor;
  }
  // Normalize floating point noise (e.g. 1285.0000000000002)
  return result;
}

/**
 * Absent-day wage deduction.
 * - Monthly staff: salary ÷ divisor per absent day (they receive full month otherwise).
 * - Daily staff: NO deduction — base pay is driven by days_worked, so a missed day is
 *   already unpaid. Recording absences for daily staff is informational only; deducting
 *   again would double-penalize the same day.
 */
export function calculateAbsenceDeduction(
  input: Pick<PayrollLineInput, "salary_type" | "base_salary" | "absent_days">,
  settings: PayrollSettings,
  divisorDays: number,
): number {
  if (settings.absence_deduction === false) return 0;
  if (input.salary_type === "daily") return 0;
  const absent = Number(input.absent_days) || 0;
  if (absent <= 0) return 0;
  const baseSalary = Number(input.base_salary) || 0;
  const deduction = (baseSalary / divisorDays) * absent;
  return Math.max(0, deduction);
}

/**
 * Mid-month leaver suggestion expressed through the existing absent_days mechanism
 * so pro-ration flows through the standard calculation path (no special casing downstream).
 * e.g. leaving on the 15th with fixed_30 => 15 equivalent absent days => base × 15/30 paid.
 */
export function suggestLeaveProrate(
  endDate: string,
  settings: PayrollSettings,
  year?: number,
): { absent_days: number } {
  const d = new Date(`${endDate}T00:00:00Z`);
  const endDay = d.getUTCDate();
  if (Number.isNaN(endDay)) return { absent_days: 0 };
  if (settings.prorate_mode === "actual_days") {
    const y = year ?? d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    return { absent_days: Math.max(0, getMonthDays(m, y) - endDay) };
  }
  return { absent_days: Math.max(0, 30 - endDay) };
}

// ---------- Core calculations ----------

const HOURS_PER_DAY = 8;

/** Legacy monthly-based rate (salary ÷ divisor ÷ 8). Kept for backward compatibility. */
export function calculateHourlyRate(baseSalary: number, divisorDays: number): number {
  const salary = Number(baseSalary) || 0;
  const safeDivisor = Number(divisorDays) || 30;
  return salary / safeDivisor / HOURS_PER_DAY;
}

/**
 * Type-aware statutory hourly rate (Thai LPA convention):
 * - daily wage  → hourly = daily wage ÷ working hours per day
 * - monthly     → hourly = monthly ÷ divisor days ÷ hours per day
 */
export function getEffectiveHourlyRate(
  salaryType: "monthly" | "daily",
  baseSalary: number,
  divisorDays: number,
): number {
  const salary = Number(baseSalary) || 0;
  if (salaryType === "daily") return salary / HOURS_PER_DAY;
  return salary / (Number(divisorDays) || 30) / HOURS_PER_DAY;
}

export function calculateOT(entry: OtEntry, hourlyRate: number): number {
  return Number(entry.hours) * hourlyRate * Number(entry.multiplier);
}

export function calculateTotalOT(otEntries: OtEntry[], hourlyRate: number): number {
  return otEntries.reduce((sum, entry) => sum + calculateOT(entry, hourlyRate), 0);
}

export function calculateGross(input: PayrollLineInput, settings: PayrollSettings, month: number, year?: number): number {
  const baseSalary = Number(input.base_salary) || 0;
  const basePay =
    input.salary_type === "daily"
      ? baseSalary * (Number(input.days_worked) || 0)
      : baseSalary;

  const totalAdditions = input.additions.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

  const divisorDays = resolveDivisorDays(settings, month, year);
  const absenceDeduction = calculateAbsenceDeduction(input, settings, divisorDays);

  const hourlyRate = getEffectiveHourlyRate(input.salary_type, baseSalary, divisorDays);
  const totalOT = calculateTotalOT(input.ot_entries, hourlyRate);

  return Math.max(0, basePay - absenceDeduction + totalAdditions + totalOT);
}

export function calculateSSO(grossPay: number, ceilingOverride?: number | null): { employee: number; employer: number } {
  const ceiling = ceilingOverride != null && Number(ceilingOverride) > 0 ? Number(ceilingOverride) : SSO_CEILING;
  const capped = Math.min(grossPay, ceiling);
  const contribution = capped * SSO_RATE;
  return {
    employee: contribution,
    employer: contribution,
  };
}

export function calculateWithholdingTax(annualGross: number): number {
  const taxableIncome = Math.max(0, annualGross - PERSONAL_DEDUCTION);
  let tax = 0;
  let previousLimit = 0;

  for (const bracket of PND1_BRACKETS) {
    if (taxableIncome <= previousLimit) break;

    const taxableAtThisBracket = Math.min(taxableIncome, bracket.limit) - previousLimit;
    if (taxableAtThisBracket > 0) {
      tax += taxableAtThisBracket * bracket.rate;
    }
    previousLimit = bracket.limit;
  }

  return tax;
}

export function calculateMonthlyWithholdingTax(monthlyGross: number, month: number): number {
  const annualGross = monthlyGross * 12;
  const annualTax = calculateWithholdingTax(annualGross);
  const monthlyTax = annualTax / 12;

  const cumulativeTax = monthlyTax * month;
  const previousCumulativeTax = monthlyTax * (month - 1);

  return Math.max(0, cumulativeTax - previousCumulativeTax);
}

export function calculateNet(input: PayrollLineInput, settings: PayrollSettings, month: number, year?: number): PayrollResult {
  const gross_pay = calculateGross(input, settings, month, year);
  const totalDeductions = input.deductions.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  let sso_employee = 0;
  let sso_employer = 0;
  let withholding_tax = 0;

  if (input.sso_registered === false) {
    withholding_tax = gross_pay * PND3_HIRE_RATE;
  } else {
    const sso = calculateSSO(gross_pay, settings.sso_ceiling_override);
    sso_employee = sso.employee;
    sso_employer = sso.employer;
    withholding_tax = calculateMonthlyWithholdingTax(gross_pay, month);
  }

  const net_pay = gross_pay - sso_employee - withholding_tax - totalDeductions;

  return {
    gross_pay: applyRounding(gross_pay, settings.rounding_rule),
    sso_employee: applyRounding(sso_employee, settings.rounding_rule),
    sso_employer: applyRounding(sso_employer, settings.rounding_rule),
    withholding_tax: applyRounding(withholding_tax, settings.rounding_rule),
    net_pay: applyRounding(net_pay, settings.rounding_rule),
  };
}

export function calculateBreakdown(
  input: PayrollLineInput,
  settings: PayrollSettings,
  month: number,
  year?: number,
): PayrollBreakdown {
  const baseSalary = Number(input.base_salary) || 0;
  const base_pay = input.salary_type === "daily"
    ? baseSalary * (Number(input.days_worked) || 0)
    : baseSalary;
  const divisorDays = resolveDivisorDays(settings, month, year);
  const hourly_rate = getEffectiveHourlyRate(input.salary_type, baseSalary, divisorDays);
  const absence = calculateAbsenceDeduction(input, settings, divisorDays);
  const ot_pay = calculateTotalOT(input.ot_entries, hourly_rate);
  const additions_total = input.additions.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const deductions_total = input.deductions.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const result = calculateNet(input, settings, month, year);

  return {
    ...result,
    base_pay: applyRounding(base_pay, settings.rounding_rule),
    absence_deduction: applyRounding(absence, settings.rounding_rule),
    ot_pay: applyRounding(ot_pay, settings.rounding_rule),
    additions_total: applyRounding(additions_total, settings.rounding_rule),
    deductions_total: applyRounding(deductions_total, settings.rounding_rule),
    hourly_rate: applyRounding(hourly_rate, settings.rounding_rule),
  };
}
