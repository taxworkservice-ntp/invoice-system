import { describe, expect, it } from "vitest";
import {
  createEmptyLineItem,
  getRowStatus,
  resolveEffectiveLineItem,
} from "../../src/lib/payroll/rows";
import type { RecurringTemplate } from "../../src/lib/payroll/recurring";
import type { Employee, PayrollLineItem } from "../../src/types";

function employee(salary_type: "monthly" | "daily"): Employee {
  return { salary_type } as Employee;
}

function item(overrides: Partial<PayrollLineItem> = {}): PayrollLineItem {
  return { ...createEmptyLineItem("run1", "e1"), ...overrides };
}

const template: RecurringTemplate = {
  id: "t1",
  employee_id: "e1",
  direction: "addition",
  label: "Monthly allowance",
  amount: 2000,
  active: true,
  sort_order: 0,
};

describe("resolveEffectiveLineItem", () => {
  it("merges recurring templates by default (salary rounds)", () => {
    const effective = resolveEffectiveLineItem(
      "e1",
      new Map(),
      new Map([["e1", [template]]]),
      "run1",
    );
    expect(effective.additions).toEqual([{ label: "Monthly allowance", amount: 2000 }]);
  });

  it("skips recurring templates when includeRecurring is false (OT rounds)", () => {
    const stored = {
      ...createEmptyLineItem("run1", "e1"),
      ot_entries: [{ hours: 5, type: "normal" as const, multiplier: 1.5 }],
    };
    const effective = resolveEffectiveLineItem(
      "e1",
      new Map([["e1", stored]]),
      new Map([["e1", [template]]]),
      "run1",
      { includeRecurring: false },
    );
    expect(effective.additions).toEqual([]);
    expect(effective.ot_entries).toHaveLength(1);
  });
});

describe("getRowStatus", () => {
  it("completes empty monthly rows in both modes", () => {
    expect(getRowStatus(employee("monthly"), item())).toBe("complete");
    expect(getRowStatus(employee("monthly"), item(), { isOtRun: true })).toBe("complete");
  });

  it("leaves empty daily rows untouched in salary rounds, complete in OT rounds", () => {
    expect(getRowStatus(employee("daily"), item())).toBe("untouched");
    expect(getRowStatus(employee("daily"), item(), { isOtRun: true })).toBe("complete");
  });

  it("requires days for daily staff except in OT rounds", () => {
    const withOt = item({
      ot_entries: [{ hours: 5, type: "normal", multiplier: 1.5 }],
    });
    expect(getRowStatus(employee("daily"), withOt)).toBe("incomplete");
    expect(getRowStatus(employee("daily"), withOt, { isOtRun: true })).toBe("complete");
  });

  it("warns on invalid entries regardless of round", () => {
    const badOt = item({ ot_entries: [{ hours: 0, type: "normal", multiplier: 1.5 }] });
    expect(getRowStatus(employee("monthly"), badOt)).toBe("warning");
    expect(getRowStatus(employee("monthly"), badOt, { isOtRun: true })).toBe("warning");
    const badAdd = item({ additions: [{ label: "  ", amount: 100 }] });
    expect(getRowStatus(employee("monthly"), badAdd)).toBe("warning");
  });
});
