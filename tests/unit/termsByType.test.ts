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
  it("covers every printing type except delivery notes", () => {
    expect([...TERMS_DOC_TYPES].sort()).toEqual(
      ["billing_note", "credit_note", "debit_note", "invoice", "quotation", "receipt"],
    );
    expect((TERMS_DOC_TYPES as readonly string[]).includes("delivery_note")).toBe(false);
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
