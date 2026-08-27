import { describe, expect, it } from "vitest";
import { applyRecurringTemplates, countTemplateAdds, type RecurringTemplate } from "../../src/lib/payroll/recurring";

const item = {
  additions: [{ label: "ค่ากะ", amount: 200 }],
  deductions: [],
};

const tpl = (over: Partial<RecurringTemplate>): RecurringTemplate => ({
  id: "t1",
  employee_id: "e1",
  direction: "addition",
  label: "เบี้ยขยัน",
  amount: 500,
  active: true,
  sort_order: 0,
  ...over,
});

describe("applyRecurringTemplates", () => {
  it("returns equivalent lists when no templates exist or all inactive", () => {
    const empty = applyRecurringTemplates(item, []);
    expect(empty).toEqual(item);
    const inactive = applyRecurringTemplates(item, [tpl({ active: false })]);
    expect(inactive).toEqual(item);
  });

  it("appends active additions and deductions sorted by sort_order", () => {
    const out = applyRecurringTemplates(item, [
      tpl({ id: "a", label: "ที่พัก", amount: 800, sort_order: 2 }),
      tpl({ id: "b", label: "เบี้ยขยัน", amount: 400, sort_order: 1 }),
      tpl({ id: "c", label: "ชุดยูนิฟอร์ม", amount: 150, sort_order: 0 }),
      tpl({ id: "d", direction: "deduction" as const, label: "เงินกู้ยืมสหกรณ์", amount: 1200 }),
    ]);
    expect(out.additions.map((x) => x.label)).toEqual(["ค่ากะ", "ชุดยูนิฟอร์ม", "เบี้ยขยัน", "ที่พัก"]);
    expect(out.additions.map((x) => x.amount)).toEqual([200, 150, 400, 800]);
    expect(out.deductions).toEqual([{ label: "เงินกู้ยืมสหกรณ์", amount: 1200 }]);
  });

  it("skips templates whose label already exists (case-insensitive)", () => {
    const out = applyRecurringTemplates(
      { additions: [{ label: "เบี้ยขยัน ", amount: 999 }], deductions: [] },
      [tpl({ label: "เบี้ยขยัน", amount: 500 })],
    );
    expect(out.additions).toEqual([{ label: "เบี้ยขยัน ", amount: 999 }]);
    expect(countTemplateAdds({ additions: [{ label: "เบี้ยขยัน " }], deductions: [] }, [tpl()])).toBe(0);
  });

  it("does not mutate the source object", () => {
    const snapshot = JSON.parse(JSON.stringify(item));
    applyRecurringTemplates(item, [tpl(), tpl({ direction: "deduction" as const })]);
    expect(item).toEqual(snapshot);
  });
});
