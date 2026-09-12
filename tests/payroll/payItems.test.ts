import { describe, expect, it } from "vitest";
import { isAdvanceLike, isFundLike, payItemKindMeta, totalsByKind, validatePayItem } from "../../src/lib/payroll/payItems";

describe("typed pay items", () => {
  it("resolves kind metadata", () => {
    expect(payItemKindMeta("bonus")?.label).toBe("โบนัส/เงินพิเศษ");
    expect(payItemKindMeta("unknown")).toBeNull();
  });

  it("detects advance-like and fund-like labels", () => {
    expect(isAdvanceLike("เบิกล่วงหน้า")).toBe(true);
    expect(isAdvanceLike("ค่าอาหาร")).toBe(false);
    expect(isAdvanceLike("anything", "loan")).toBe(true);
    expect(isFundLike("กยศ. งวดนี้")).toBe(true);
    expect(isFundLike("เบี้ยเลี้ยง")).toBe(false);
  });

  it("validates rows with Thai messages", () => {
    expect(validatePayItem("", 100)).toContain("ชื่อรายการ");
    expect(validatePayItem("โบนัส", -5)).toContain("ติดลบ");
    expect(validatePayItem("โบนัส", 500)).toBeNull();
  });

  it("groups totals by kind", () => {
    expect(totalsByKind([
      { label: "a", amount: 100, kind: "bonus" },
      { label: "b", amount: 50, kind: "bonus" },
      { label: "c", amount: 30 },
    ])).toEqual({ bonus: 150, other: 30 });
  });
});
