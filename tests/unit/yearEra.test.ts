import { describe, expect, it } from "vitest";
import {
  formatBuddhistDate,
  formatDocDate,
  formatDocDateFull,
  formatDocDateTimeParts,
  formatDocMonth,
  formatDocNumericDate,
  formatNumericThaiDate,
  formatPrintDate,
  fromEraYear,
  toEraYear,
} from "../../src/lib/dates";
import { isYearEra, resolveYearEra } from "../../src/lib/yearEra";

describe("year era — date formatting", () => {
  const iso = "2026-10-18";

  it("writes the year in the chosen era", () => {
    expect(formatDocDate(iso, "ce")).toBe("18 ต.ค. 2026");
    expect(formatDocDate(iso, "be")).toBe("18 ต.ค. 2569");
    expect(formatDocDateFull(iso, "ce")).toBe("18 ตุลาคม 2026");
    expect(formatDocDateFull(iso, "be")).toBe("18 ตุลาคม 2569");
    expect(formatDocNumericDate(iso, "ce")).toBe("18/10/2026");
    expect(formatDocNumericDate(iso, "be")).toBe("18/10/2569");
  });

  it("converts only the year, never the day or month", () => {
    expect(toEraYear(2026, "ce")).toBe(2026);
    expect(toEraYear(2026, "be")).toBe(2569);
    expect(fromEraYear(2026, "ce")).toBe(2026);
    expect(fromEraYear(2569, "be")).toBe(2026);
  });

  it("formats a month label in the chosen era", () => {
    expect(formatDocMonth("2026-09", "ce")).toBe("ก.ย. 2026");
    expect(formatDocMonth("2026-09", "be")).toBe("ก.ย. 2569");
    expect(formatDocMonth("nonsense", "ce")).toBe("nonsense");
  });

  it("splits date and time for era-aware timestamps", () => {
    const parts = formatDocDateTimeParts("2026-10-18T04:30:00.000Z", "ce");
    expect(parts.date).toBe("18 ต.ค. 2026");
    expect(parts.time).toMatch(/^\d{2}:\d{2}$/);
  });

  it("keeps the legacy helpers behaving exactly as before (BE)", () => {
    expect(formatBuddhistDate(iso)).toBe(formatDocDate(iso, "be"));
    expect(formatNumericThaiDate(iso)).toBe("18/10/2026");
  });
});

describe("print dates", () => {
  it("uses the workspace era for the paper's dd/mm/yyyy", () => {
    expect(formatPrintDate("2026-10-18", "ce")).toBe("18/10/2026");
    expect(formatPrintDate("2026-10-18", "be")).toBe("18/10/2569");
  });

  it("keeps the legacy fallbacks for empty and unparseable values", () => {
    expect(formatPrintDate(null, "ce")).toBe("-");
    expect(formatPrintDate("", "be")).toBe("-");
    expect(formatPrintDate("not-a-date", "be")).toBe("not-a-date");
  });

  it("uses Bangkok calendar days for timestamps", () => {
    // 21:00 UTC is already the next day in Bangkok.
    expect(formatPrintDate("2026-10-17T21:00:00.000Z", "ce")).toBe("18/10/2026");
  });
});

describe("year era — resolution", () => {
  it("reads the workspace setting", () => {
    expect(resolveYearEra({ year_era: "ce" } as never)).toBe("ce");
    expect(resolveYearEra({ year_era: "be" } as never)).toBe("be");
  });

  it("falls back to พ.ศ. so nothing changes before the setting is used", () => {
    expect(resolveYearEra(null)).toBe("be");
    expect(resolveYearEra({} as never)).toBe("be");
    expect(resolveYearEra({ year_era: null } as never)).toBe("be");
    expect(resolveYearEra({ year_era: "nonsense" } as never)).toBe("be");
  });

  it("guards the stored value", () => {
    expect(isYearEra("ce")).toBe(true);
    expect(isYearEra("be")).toBe(true);
    expect(isYearEra("bs")).toBe(false);
    expect(isYearEra(null)).toBe(false);
  });
});
