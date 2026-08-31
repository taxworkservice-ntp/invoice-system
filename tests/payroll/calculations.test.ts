import { describe, expect, it } from "vitest";
import {
  applyRounding,
  calculateBreakdown,
  calculateGross,
  calculateHourlyRate,
  calculateMonthlyWithholdingTax,
  calculateSSO,
  calculateWithholdingTax,
  getEffectiveHourlyRate,
  getMonthDays,
  resolveDivisorDays,
  suggestLeaveProrate,
  type PayrollLineInput,
  type PayrollSettings,
} from "../../src/lib/payroll/calculations";

const settings: PayrollSettings = {
  ot_divisor: 30,
  normal_ot_multiplier: 1.5,
  holiday_ot_multiplier: 3,
};

function input(overrides: Partial<PayrollLineInput> = {}): PayrollLineInput {
  return {
    salary_type: "monthly",
    base_salary: 30000,
    days_worked: null,
    ot_entries: [],
    additions: [],
    deductions: [],
    ...overrides,
  };
}

describe("payroll calculations", () => {
  it("calculates the standard hourly rate", () => {
    expect(calculateHourlyRate(30000, 30)).toBe(125);
  });

  it("calculates monthly pay with OT, additions, and deductions", () => {
    const result = calculateBreakdown(
      input({
        ot_entries: [
          { hours: 10, type: "normal", multiplier: 1.5 },
          { hours: 8, type: "holiday", multiplier: 3 },
        ],
        additions: [{ label: "Allowance", amount: 3000 }],
        deductions: [{ label: "Advance", amount: 3000 }],
      }),
      settings,
      1,
    );

    expect(result.base_pay).toBe(30000);
    expect(result.ot_pay).toBe(4875);
    expect(result.additions_total).toBe(3000);
    expect(result.deductions_total).toBe(3000);
    expect(result.gross_pay).toBe(37875);
    expect(result.net_pay).toBeGreaterThan(0);
  });

  it("uses worked days for daily employees", () => {
    const result = calculateBreakdown(
      input({ salary_type: "daily", base_salary: 1000, days_worked: 20 }),
      settings,
      1,
    );

    expect(result.base_pay).toBe(20000);
    expect(result.gross_pay).toBe(20000);
  });

  it("caps employee and employer SSO at the wage ceiling", () => {
    expect(calculateSSO(30000)).toEqual({ employee: 875, employer: 875 });
  });

  it("coerces numeric values loaded from JSON data", () => {
    const result = calculateBreakdown(
      input({
        ot_entries: [{ hours: "2" as unknown as number, type: "normal", multiplier: "1.5" as unknown as number }],
        additions: [{ label: "Allowance", amount: "500" as unknown as number }],
      }),
      settings,
      1,
    );

    expect(result.ot_pay).toBe(375);
    expect(result.additions_total).toBe(500);
  });
});

describe("calculation customization", () => {
  it("resolves divisor days by prorate mode", () => {
    expect(resolveDivisorDays({ ...settings, prorate_mode: "fixed_30" }, 2)).toBe(30);
    expect(resolveDivisorDays({ ...settings, prorate_mode: "actual_days" }, 2, 2024)).toBe(29); // leap
    expect(resolveDivisorDays({ ...settings, prorate_mode: "actual_days" }, 2, 2023)).toBe(28);
    expect(resolveDivisorDays({ ...settings, prorate_mode: "actual_days" }, 4, 2026)).toBe(30);
  });

  it("getMonthDays handles leap years with and without year", () => {
    expect(getMonthDays(2)).toBe(28);
    expect(getMonthDays(2, 2024)).toBe(29);
    expect(getMonthDays(12, 2026)).toBe(31);
  });

  it("deducts absent days for monthly staff by salary/divisor", () => {
    const result = calculateBreakdown(input({ absent_days: 2 }), settings, 8);
    // 30000/30 = 1000 per day; absent 2 -> -2000 from gross
    expect(result.absence_deduction).toBe(2000);
    expect(result.gross_pay).toBe(28000);
  });

  it("does NOT deduct absence for daily staff (already excluded via days_worked)", () => {
    const result = calculateBreakdown(
      input({ salary_type: "daily", base_salary: 300, days_worked: 7, absent_days: 1 }),
      settings,
      8,
    );
    expect(result.absence_deduction).toBe(0);
    expect(result.gross_pay).toBe(2100);
  });

  it("pays daily-staff OT on daily wage ÷ hours-per-day (statutory basis, no ÷30 step)", () => {
    // 300/day ÷ 8h = 37.50/hr → 15h OT × 1.5 = 843.75
    const result = calculateBreakdown(
      input({ salary_type: "daily", base_salary: 300, days_worked: 7, ot_entries: [{ hours: 15, type: "normal", multiplier: 1.5 }] }),
      settings,
      8,
    );
    expect(result.hourly_rate).toBe(37.5);
    expect(result.ot_pay).toBe(843.75);
    expect(result.gross_pay).toBe(2943.75);
  });

  it("monthly OT hourly rate keeps the divisor convention", () => {
    expect(getEffectiveHourlyRate("monthly", 30000, 30)).toBe(125);
    expect(getEffectiveHourlyRate("daily", 300, 30)).toBe(37.5);
    expect(calculateHourlyRate(30000, 30)).toBe(125); // legacy helper unchanged
  });

  it("skips absence deduction when disabled or zero", () => {
    const off = { ...settings, absence_deduction: false };
    expect(calculateGross(input({ absent_days: 5 }), off, 8)).toBe(30000);
    expect(calculateGross(input({ absent_days: 0 }), settings, 8)).toBe(30000);
  });

  it("supports rounding rules on outputs", () => {
    const s: PayrollSettings = { ...settings, rounding_rule: "floor" };
    const result = calculateBreakdown(
      input({ salary_type: "daily", base_salary: 333.333, days_worked: 1 }),
      s,
      1,
    );
    expect(result.base_pay).toBe(333.33);

    expect(applyRounding(10.567, "round")).toBe(10.57);
    expect(applyRounding(10.567, "floor")).toBe(10.56);
    expect(applyRounding(10.561, "ceil")).toBe(10.57);
  });

  it("honors SSO ceiling override", () => {
    expect(calculateSSO(30000, 15000)).toEqual({ employee: 750, employer: 750 });
    expect(calculateSSO(12000, 15000)).toEqual({ employee: 600, employer: 600 }); // under both ceilings
    expect(calculateSSO(30000, null)).toEqual({ employee: 875, employer: 875 });
  });

  it("suggests leave pro-ration via absent days (leaver mid-month)", () => {
    // Leaves Aug 15 — fixed_30 pays 15/30
    expect(suggestLeaveProrate("2026-08-15", settings)).toEqual({ absent_days: 15 });
    // actual_days Feb 2024 (29 days): leaves on the 20th -> 9 remaining
    expect(suggestLeaveProrate("2024-02-20", { ...settings, prorate_mode: "actual_days" }, 2024))
      .toEqual({ absent_days: 9 });
    // Leaving on the last day -> nothing deducted
    expect(suggestLeaveProrate("2026-08-31", settings)).toEqual({ absent_days: 0 });
  });

  it("applies the suggested absence and reaches half-month pay", () => {
    const suggestion = suggestLeaveProrate("2026-08-15", settings);
    const result = calculateBreakdown(input({ base_salary: 30000, absent_days: suggestion.absent_days }), settings, 8);
    expect(result.gross_pay).toBe(15000); // exactly half of monthly salary
  });
});

describe("worker type: not SSO-registered (ค่าจ้างทำของ / PND3)", () => {
  it("withholds flat 3% of gross and skips SSO entirely", () => {
    const result = calculateBreakdown(input({ base_salary: 20000, sso_registered: false }), settings, 8);
    expect(result.gross_pay).toBe(20000);
    expect(result.sso_employee).toBe(0);
    expect(result.sso_employer).toBe(0);
    expect(result.withholding_tax).toBe(600);
    expect(result.net_pay).toBe(19400);
  });

  it("does not apply progressive PIT for non-SSO workers (30000 would be 900 @3%, not PIT)", () => {
    const result = calculateBreakdown(input({ base_salary: 30000, sso_registered: false }), settings, 1);
    expect(result.withholding_tax).toBe(900);
    expect(result.sso_employee).toBe(0);
  });

  it("still pays base, OT and applies other deductions for non-SSO workers", () => {
    const result = calculateBreakdown(
      input({
        base_salary: 10000,
        sso_registered: false,
        ot_entries: [{ hours: 4, type: "normal", multiplier: 1.5 }],
        deductions: [{ label: "ล่วงหน้า", amount: 500 }],
      }),
      settings,
      8,
    );
    expect(result.gross_pay).toBe(10250);
    expect(result.withholding_tax).toBe(307.5);
    expect(result.net_pay).toBe(10250 - 307.5 - 500);
  });

  it("keeps SSO employees on the existing PIT + SSO path", () => {
    const sso = calculateBreakdown(input({ base_salary: 20000 }), settings, 8);
    const ssoExplicit = calculateBreakdown(input({ base_salary: 20000, sso_registered: true }), settings, 8);
    expect(sso).toEqual(ssoExplicit);
    expect(sso.sso_employee).toBe(875); // capped at 17,500 wage base
    // 240k/yr − 100k expenses − 60k personal − 10.5k SSO → 69.5k taxable → 0 tax
    expect(sso.withholding_tax).toBe(0);
  });
});

describe("withholding tax (annualized PND1 with proper deductions)", () => {
  it("charges 0 tax for incomes below the effective threshold", () => {
    // 8k/mo → 96k/yr: expenses floor 60k + personal 60k + SSO 4.8k → taxable 0
    expect(calculateMonthlyWithholdingTax(8000, calculateSSO(8000).employee)).toBe(0);
  });

  it("applies the 5% and 10% brackets on a mid income (50k/mo)", () => {
    // 600k/yr: taxable = 600k − 100k expenses − 60k personal − 10.5k SSO = 429.5k
    // tax = 150k×0 + 150k×5% + 129.5k×10% = 20,450 → 1,704.17/mo
    expect(calculateMonthlyWithholdingTax(50000, calculateSSO(50000).employee)).toBeCloseTo(1704.17, 2);
  });

  it("caps employment expenses at 100k and floors them at 60k", () => {
    // 460k/yr → 50% = 230k capped to 100k → taxable exactly 300,000 → 7,500
    expect(calculateWithholdingTax(460000)).toBe(7500);
    // 96k/yr → 50% = 48k floored to 60k → taxable = 96k − 60k − 60k → 0
    expect(calculateWithholdingTax(96000)).toBe(0);
  });

  it("taxes only the amount above a bracket limit", () => {
    // taxable 300,001 → 7,500 + 1×10% = 7,500.10
    expect(calculateWithholdingTax(460001)).toBeCloseTo(7500.1, 2);
  });

  it("keeps payslip arithmetic exact after rounding (floor rule)", () => {
    const s: PayrollSettings = { ...settings, rounding_rule: "floor" };
    const result = calculateBreakdown(
      input({ base_salary: 33333.33, deductions: [{ label: "เงินยืม", amount: 123.45 }] }),
      s,
      3,
    );
    const recomputed = result.gross_pay - result.sso_employee - result.withholding_tax - result.deductions_total;
    expect(result.net_pay).toBeCloseTo(recomputed, 2);
  });
});

describe("manual per-day absence rate override", () => {
  it("uses the override rate instead of the derived rate", () => {
    // 30,000/30 = 1,000 derived; user overrides to 1,200 → 2 × 1,200 = 2,400
    const result = calculateBreakdown(input({ absent_days: 2, absence_daily_rate: 1200 }), settings, 8);
    expect(result.absence_deduction).toBe(2400);
    expect(result.gross_pay).toBe(27600);
  });

  it("falls back to the derived rate when no override is set", () => {
    const result = calculateBreakdown(input({ absent_days: 2 }), settings, 8);
    expect(result.absence_deduction).toBe(2000);
  });

  it("ignores the override when absent_days is zero", () => {
    const result = calculateBreakdown(input({ absent_days: 0, absence_daily_rate: 1200 }), settings, 8);
    expect(result.absence_deduction).toBe(0);
  });

  it("still never deducts absence for daily staff, even with an override", () => {
    const result = calculateBreakdown(
      input({ salary_type: "daily", base_salary: 300, days_worked: 7, absent_days: 1, absence_daily_rate: 999 }),
      settings,
      8,
    );
    expect(result.absence_deduction).toBe(0);
  });

  it("respects the absence_deduction=false kill switch over any override", () => {
    const off = { ...settings, absence_deduction: false as const };
    expect(calculateBreakdown(input({ absent_days: 2, absence_daily_rate: 1200 }), off, 8).absence_deduction).toBe(0);
  });

  it("keeps the payslip rounding invariant with an override", () => {
    const s: PayrollSettings = { ...settings, rounding_rule: "floor" };
    const result = calculateBreakdown(
      input({ base_salary: 33333.33, absent_days: 1.5, absence_daily_rate: 1111.11 }),
      s,
      3,
    );
    const recomputed = result.gross_pay - result.sso_employee - result.withholding_tax - result.deductions_total;
    expect(result.net_pay).toBeCloseTo(recomputed, 2);
  });
});
