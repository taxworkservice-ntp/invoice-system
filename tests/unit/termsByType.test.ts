import { describe, expect, it } from "vitest";
import { resolveTermsByType, splitTerms, TERMS_DOC_TYPES } from "../../src/lib/terms";

describe("splitTerms", () => {
  it("splits lines, trims, drops blanks", () => {
    expect(splitTerms("  a  \n\nb\r\n  ")).toEqual(["a", "b"]);
    expect(splitTerms(null)).toEqual([]);
    expect(splitTerms("")).toEqual([]);
  });
});

describe("resolveTermsByType", () => {
  it("covers every type that prints a closing remark, delivery notes included", () => {
    expect([...TERMS_DOC_TYPES].sort()).toEqual(
      ["billing_note", "credit_note", "debit_note", "delivery_note", "invoice", "quotation", "receipt"],
    );
    expect((TERMS_DOC_TYPES as readonly string[]).includes("delivery_note")).toBe(true);
  });

  it("gives a delivery note its own remark, blankable on its own", () => {
    const map = { delivery_note: "ส่งของตามเงื่อนไขที่ตกลงกัน", invoice: "ชำระภายใน 30 วัน" };
    expect(resolveTermsByType(map, "global", "delivery_note")).toEqual(["ส่งของตามเงื่อนไขที่ตกลงกัน"]);
    expect(resolveTermsByType(map, "global", "invoice")).toEqual(["ชำระภายใน 30 วัน"]);
    // An explicitly blank delivery note suppresses its remark without touching
    // the other types.
    expect(resolveTermsByType({ ...map, delivery_note: "  " }, "global", "delivery_note")).toEqual([]);
    expect(resolveTermsByType({ ...map, delivery_note: "  " }, "global", "invoice")).toEqual([
      "ชำระภายใน 30 วัน",
    ]);
  });

  it("a delivery note with no slot still inherits the legacy text", () => {
    expect(resolveTermsByType({ invoice: "x" }, "global", "delivery_note")).toEqual(["global"]);
  });

  it("type text wins; empty string hides that type", () => {
    const map = { invoice: "pay now\nno credit", receipt: "  " };
    expect(resolveTermsByType(map, "global", "invoice")).toEqual(["pay now", "no credit"]);
    expect(resolveTermsByType(map, "global", "receipt")).toEqual([]);
  });

  it("missing map or missing key falls back to the legacy global", () => {
    expect(resolveTermsByType(null, "global", "invoice")).toEqual(["global"]);
    expect(resolveTermsByType(undefined, "global", "invoice")).toEqual(["global"]);
    expect(resolveTermsByType({ receipt: "x" }, "global", "invoice")).toEqual(["global"]);
    expect(resolveTermsByType(null, null, "invoice")).toEqual([]);
  });
});
