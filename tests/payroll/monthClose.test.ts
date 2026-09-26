import { describe, expect, it } from "vitest";
import {
  applyAttribution,
  attributeObligations,
  closingSalaryRunId,
  computeMonthlyObligations,
  ssoWageBase,
} from "../../src/lib/payroll/monthClose";
import { calculateMonthlyWithholdingTax } from "../../src/lib/payroll/calculations";

describe("monthly SSO/WHT aggregation", () => {
  it("bases SSO on the month total with one ceiling (the split-month regression)", () => {
    // 30,000 split 15k + 15k must yield 875 — not 750 + 750 = 1500.
    const [ob] = computeMonthlyObligations([{ employeeId: "e1", insurable: 30000 }]);
    expect(ob.ssoBase).toBe(17500);
    expect(ob.sso_employee).toBe(875);
    expect(ob.sso_employer).toBe(875);
    expect(ob.withholding_tax).toBeCloseTo(calculateMonthlyWithholdingTax(30000, 875), 2);
  });

  it("applies the 1,650 floor only when there is insurable wage", () => {
    expect(ssoWageBase(0)).toBe(0);
    expect(ssoWageBase(1000)).toBe(1650);
    expect(ssoWageBase(10000)).toBe(10000);
    expect(ssoWageBase(50000)).toBe(17500);
    const [tiny] = computeMonthlyObligations([{ employeeId: "e1", insurable: 1000 }]);
    expect(tiny.sso_employee).toBe(82.5);
  });

  it("keeps contractors on flat 3% and exempts age-60 hires from SSO", () => {
    const [contract] = computeMonthlyObligations([
      { employeeId: "e1", insurable: 20000, sso_registered: false },
    ]);
    expect(contract.sso_employee).toBe(0);
    expect(contract.withholding_tax).toBe(600);

    const [exempt] = computeMonthlyObligations([
      { employeeId: "e2", insurable: 30000, sso_exempt: true },
    ]);
    expect(exempt.sso_employee).toBe(0);
    expect(exempt.withholding_tax).toBeCloseTo(calculateMonthlyWithholdingTax(30000, 0), 2);
  });

  it("picks the latest salary batch as the closing round", () => {
    const runs = [
      { id: "ot", batch_type: "ot", period_end: "2026-08-25" },
      { id: "s1", batch_type: "salary", period_end: "2026-08-15" },
      { id: "s2", batch_type: "salary", period_end: "2026-08-31" },
    ];
    expect(closingSalaryRunId(runs)).toBe("s2");
    expect(closingSalaryRunId([{ id: "ot", batch_type: "ot", period_end: "2026-08-25" }])).toBeNull();
  });

  it("attributes the full monthly amount to the closing draft, zero elsewhere", () => {
    const runs = [
      { id: "s1", batch_type: "salary", period_end: "2026-08-15" },
      { id: "ot", batch_type: "ot", period_end: "2026-08-25" },
      { id: "s2", batch_type: "salary", period_end: "2026-08-31" },
    ];
    const owed = new Map([
      ["e1", { employeeId: "e1", insurable: 35000, ssoBase: 17500, sso_employee: 875, sso_employer: 875, withholding_tax: 100 }],
    ]);
    const attr = attributeObligations({
      runs,
      runStatuses: new Map([
        ["s1", "finalized"],
        ["ot", "draft"],
        ["s2", "draft"],
      ]),
      owed,
      storedFinalized: new Map(),
      isContractor: () => false,
    });
    expect(attr.get("s2")?.get("e1")).toEqual({
      sso_employee: 875,
      sso_employer: 875,
      withholding_tax: 100,
    });
    expect(attr.get("ot")?.get("e1")).toEqual({
      sso_employee: 0,
      sso_employer: 0,
      withholding_tax: 0,
    });
    expect(attr.has("s1")).toBe(false);
  });

  it("subtracts finalized siblings and never goes negative", () => {
    const runs = [{ id: "s2", batch_type: "salary", period_end: "2026-08-31" }];
    const owed = new Map([
      ["e1", { employeeId: "e1", insurable: 35000, ssoBase: 17500, sso_employee: 875, sso_employer: 875, withholding_tax: 100 }],
    ]);
    // Half already stored in a finalized first-half round.
    const storedFinalized = new Map([
      ["s1", new Map([["e1", { sso_employee: 750, sso_employer: 750, withholding_tax: 50 }]])],
    ]);
    const attr = attributeObligations({
      runs,
      runStatuses: new Map([["s2", "draft"]]),
      owed,
      storedFinalized,
      isContractor: () => false,
    });
    expect(attr.get("s2")?.get("e1")).toEqual({
      sso_employee: 125,
      sso_employer: 125,
      withholding_tax: 50,
    });

    // Over-settled months floor at zero instead of crediting.
    const over = new Map([
      ["s1", new Map([["e1", { sso_employee: 900, sso_employer: 900, withholding_tax: 200 }]])],
    ]);
    const attr2 = attributeObligations({
      runs,
      runStatuses: new Map([["s2", "draft"]]),
      owed,
      storedFinalized: over,
      isContractor: () => false,
    });
    expect(attr2.get("s2")?.get("e1")).toEqual({
      sso_employee: 0,
      sso_employer: 0,
      withholding_tax: 0,
    });
  });

  it("keeps the payslip invariant when swapping attributed values", () => {
    const out = applyAttribution(
      { gross_pay: 5000, sso_employee: 250, sso_employer: 250, withholding_tax: 10, deductions_total: 500, net_pay: 4240 },
      { sso_employee: 0, sso_employer: 0, withholding_tax: 0 },
    );
    expect(out.net_pay).toBe(4500);
    expect(out.net_pay).toBe(out.gross_pay - out.sso_employee - out.withholding_tax - 500);
  });
});
