import { describe, expect, it } from "vitest";
import { createEmptyLineItem, resolveEffectiveLineItem } from "../../src/lib/payroll/rows";
import type { RecurringTemplate } from "../../src/lib/payroll/recurring";

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
