import type { OtEntry } from "../../types";

export interface PayrollSettings {
  ot_divisor: number;
  normal_ot_multiplier: number;
  holiday_ot_multiplier: number;
}

export interface PayrollLineInput {
  salary_type: "monthly" | "daily";
  base_salary: number;
  days_worked: number | null;
  ot_entries: OtEntry[];
  additions: { label: string; amount: number }[];
  deductions: { label: string; amount: number }[];
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
  ot_pay: number;
  additions_total: number;
  deductions_total: number;
  hourly_rate: number;
}

const SSO_CEILING = 17500;
const SSO_RATE = 0.05;

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

export function calculateHourlyRate(baseSalary: number, divisor: number): number {
  const salary = Number(baseSalary) || 0;
  const safeDivisor = Number(divisor) || 30;
  return salary / safeDivisor / 8;
}

export function calculateOT(entry: OtEntry, hourlyRate: number): number {
  return Number(entry.hours) * hourlyRate * Number(entry.multiplier);
}

export function calculateTotalOT(otEntries: OtEntry[], hourlyRate: number): number {
  return otEntries.reduce((sum, entry) => sum + calculateOT(entry, hourlyRate), 0);
}

export function calculateGross(input: PayrollLineInput, settings: PayrollSettings): number {
  const baseSalary = Number(input.base_salary) || 0;
  const basePay =
    input.salary_type === "daily"
      ? baseSalary * (Number(input.days_worked) || 0)
      : baseSalary;

  const totalAdditions = input.additions.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

  const hourlyRate = calculateHourlyRate(input.base_salary, settings.ot_divisor);
  const totalOT = calculateTotalOT(input.ot_entries, hourlyRate);

  return basePay + totalAdditions + totalOT;
}

export function calculateSSO(grossPay: number): { employee: number; employer: number } {
  const capped = Math.min(grossPay, SSO_CEILING);
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

export function calculateNet(input: PayrollLineInput, settings: PayrollSettings, month: number): PayrollResult {
  const gross_pay = calculateGross(input, settings);
  const sso = calculateSSO(gross_pay);
  const withholding_tax = calculateMonthlyWithholdingTax(gross_pay, month);
  const totalDeductions = input.deductions.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const net_pay = gross_pay - sso.employee - withholding_tax - totalDeductions;

  return {
    gross_pay: round2(gross_pay),
    sso_employee: round2(sso.employee),
    sso_employer: round2(sso.employer),
    withholding_tax: round2(withholding_tax),
    net_pay: round2(net_pay),
  };
}

export function calculateBreakdown(
  input: PayrollLineInput,
  settings: PayrollSettings,
  month: number,
): PayrollBreakdown {
  const baseSalary = Number(input.base_salary) || 0;
  const base_pay = input.salary_type === "daily"
    ? baseSalary * (Number(input.days_worked) || 0)
    : baseSalary;
  const hourly_rate = calculateHourlyRate(input.base_salary, settings.ot_divisor);
  const ot_pay = calculateTotalOT(input.ot_entries, hourly_rate);
  const additions_total = input.additions.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const deductions_total = input.deductions.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const result = calculateNet(input, settings, month);

  return {
    ...result,
    base_pay: round2(base_pay),
    ot_pay: round2(ot_pay),
    additions_total: round2(additions_total),
    deductions_total: round2(deductions_total),
    hourly_rate: round2(hourly_rate),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
