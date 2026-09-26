import { describe, expect, it } from "vitest";
import {
  payrollVisibilityToRows,
  resolvePayrollTabsVisibility,
} from "../../src/lib/payroll/visibility";

describe("payroll tab visibility", () => {
  it("defaults to both tabs when nothing is configured (legacy clients)", () => {
    expect(resolvePayrollTabsVisibility([])).toEqual({
      mode: "both",
      showRuns: true,
      showEmployees: true,
    });
    // Unrelated keys don't count as configuration.
    expect(resolvePayrollTabsVisibility([{ feature_key: "payroll", enabled: true }])).toEqual({
      mode: "both",
      showRuns: true,
      showEmployees: true,
    });
  });

  it("resolves runs-only when configured so", () => {
    expect(
      resolvePayrollTabsVisibility([
        { feature_key: "payroll_runs", enabled: true },
        { feature_key: "payroll_employees", enabled: false },
      ]),
    ).toEqual({ mode: "runs", showRuns: true, showEmployees: false });
  });

  it("resolves employees-only when configured so", () => {
    expect(
      resolvePayrollTabsVisibility([
        { feature_key: "payroll_runs", enabled: false },
        { feature_key: "payroll_employees", enabled: true },
      ]),
    ).toEqual({ mode: "employees", showRuns: false, showEmployees: true });
  });

  it("resolves both when both are explicitly enabled", () => {
    expect(
      resolvePayrollTabsVisibility([
        { feature_key: "payroll_runs", enabled: true },
        { feature_key: "payroll_employees", enabled: true },
      ]),
    ).toEqual({ mode: "both", showRuns: true, showEmployees: true });
  });

  it("fails open to both when manual edits would hide everything", () => {
    expect(
      resolvePayrollTabsVisibility([
        { feature_key: "payroll_runs", enabled: false },
        { feature_key: "payroll_employees", enabled: false },
      ]),
    ).toEqual({ mode: "both", showRuns: true, showEmployees: true });
  });

  it("maps admin modes to rows that always enable at least one tab", () => {
    expect(payrollVisibilityToRows("both")).toEqual([
      { key: "payroll_runs", enabled: true },
      { key: "payroll_employees", enabled: true },
    ]);
    expect(payrollVisibilityToRows("runs")).toEqual([
      { key: "payroll_runs", enabled: true },
      { key: "payroll_employees", enabled: false },
    ]);
    expect(payrollVisibilityToRows("employees")).toEqual([
      { key: "payroll_runs", enabled: false },
      { key: "payroll_employees", enabled: true },
    ]);
  });
});
