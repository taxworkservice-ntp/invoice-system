import { describe, expect, it } from "vitest";
import {
  applyRounding,
  calculateBreakdown,
  calculateGross,
  calculateHourlyRate,
  calculateSSO,
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
