import { describe, expect, it } from "vitest";
import {
  DOC_NUMBER_FORMATS,
  eraLabel,
  formatDocNumberSample,
  formatOption,
  resetOptionsForFormat,
  SEQ_PADDING_OPTIONS,
} from "../../src/lib/docNumberFormat";

describe("formatDocNumberSample", () => {
  it("renders every preset with the requested padding", () => {
    expect(formatDocNumberSample("year_month", 4, "be")).toBe("INV-2569-11-0001");
    expect(formatDocNumberSample("year", 4, "be")).toBe("INV-2569-0001");
    expect(formatDocNumberSample("running", 3, "be")).toBe("INV-001");
    expect(formatDocNumberSample("slash_year_month", 5, "be")).toBe("INV/2569/11/00001");
    expect(formatDocNumberSample("short_year_month", 3, "be")).toBe("INV-69-11-001");
  });

  it("uses the Gregorian year in the CE era", () => {
    expect(formatDocNumberSample("year_month", 4, "ce")).toBe("INV-2026-11-0001");
    expect(formatDocNumberSample("short_year_month", 4, "ce")).toBe("INV-26-11-0001");
  });
});

describe("resetOptionsForFormat", () => {
  it("only offers resets the format can express", () => {
    expect(resetOptionsForFormat("running")).toEqual(["never"]);
    expect(resetOptionsForFormat("year")).toEqual(["yearly", "never"]);
    expect(resetOptionsForFormat("year_month")).toEqual(["monthly", "never"]);
    expect(resetOptionsForFormat("slash_year_month")).toEqual(["monthly", "never"]);
    expect(resetOptionsForFormat("short_year_month")).toEqual(["monthly", "never"]);
  });
});

describe("doc number format metadata", () => {
  it("exposes every preset and padding once", () => {
    expect(DOC_NUMBER_FORMATS).toHaveLength(5);
    expect(SEQ_PADDING_OPTIONS).toEqual([3, 4, 5]);
    expect(formatOption("year")?.label).toBe("ปี + ลำดับ");
    expect(formatOption("unknown")).toBeNull();
  });

  it("labels both eras", () => {
    expect(eraLabel("be")).toBe("พ.ศ.");
    expect(eraLabel("ce")).toBe("ค.ศ.");
  });
});
