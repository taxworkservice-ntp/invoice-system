import { describe, expect, it } from "vitest";
import {
  calculateBreakdown,
  calculateHourlyRate,
  calculateSSO,
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
