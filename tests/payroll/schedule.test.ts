import { describe, expect, it } from "vitest";
import { addDaysISO, formatPayRangeLabel, suggestNextWindow } from "../../src/lib/payroll/schedule";

describe("pay schedule windows", () => {
  it("chains monthly windows after the previous run", () => {
    expect(suggestNextWindow("monthly", {}, "2026-08-31")).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(suggestNextWindow("monthly", {}, "2024-02-29")).toEqual({ start: "2024-03-01", end: "2024-03-31" });
  });

  it("semimonthly: after first window ends at anchor -> second window to month end", () => {
    const win = suggestNextWindow("semimonthly", { anchorDay: 15 }, "2026-08-15");
    expect(win).toEqual({ start: "2026-08-16", end: "2026-08-31" });
  });

  it("semimonthly: after second window (month end) -> first window of next month", () => {
    const win = suggestNextWindow("semimonthly", { anchorDay: 15 }, "2026-08-31");
    expect(win).toEqual({ start: "2026-09-01", end: "2026-09-15" });
  });

  it("weekly chains 7-day windows", () => {
    const win = suggestNextWindow("weekly", {}, "2026-08-10");
    expect(win).toEqual({ start: "2026-08-11", end: "2026-08-17" });
  });

  it("custom N-day cycles chain by length", () => {
    const first = suggestNextWindow("custom", { cycleLenDays: 5 }, "2026-08-05");
    expect(first).toEqual({ start: "2026-08-06", end: "2026-08-10" });
    const second = suggestNextWindow("custom", { cycleLenDays: 5 }, first.end);
    expect(second).toEqual({ start: "2026-08-11", end: "2026-08-15" });
  });

  it("without history returns a current-month window for monthly frequency", () => {
    const win = suggestNextWindow("monthly", {}, null);
    expect(win.start.slice(8, 10)).toBe("01");
    expect(win.end).toMatch(/-\d{2}$/);
  });

  describe("with reference month (selected payroll month, not today)", () => {
    it("monthly falls on the full referenced month", () => {
      expect(suggestNextWindow("monthly", {}, null, { year: 2026, month: 7 }))
        .toEqual({ start: "2026-07-01", end: "2026-07-31" });
      expect(suggestNextWindow("monthly", {}, null, { year: 2024, month: 2 }))
        .toEqual({ start: "2024-02-01", end: "2024-02-29" });
    });

    it("semimonthly opens the first cut-off window of the referenced month", () => {
      expect(suggestNextWindow("semimonthly", { anchorDay: 15 }, null, { year: 2026, month: 9 }))
        .toEqual({ start: "2026-09-01", end: "2026-09-15" });
    });

    it("weekly/custom cycles walk from the 1st of the referenced month until covering its last day", () => {
      expect(suggestNextWindow("custom", { cycleLenDays: 5 }, null, { year: 2026, month: 8 }))
        .toEqual({ start: "2026-08-31", end: "2026-09-04" }); // final tile starts in Aug, ends past edge so the 31st is covered
      expect(suggestNextWindow("weekly", {}, null, { year: 2024, month: 2 }))
        .toEqual({ start: "2024-02-29", end: "2024-03-06" }); // leap-Feb covered, spillover by design
    });

    it("chaining still wins over the reference when history exists", () => {
      expect(suggestNextWindow("monthly", {}, "2026-07-31", { year: 2026, month: 7 }))
        .toEqual({ start: "2026-08-01", end: "2026-08-31" });
    });
  });

  it("addDaysISO handles month rollovers", () => {
    expect(addDaysISO("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDaysISO("2024-02-28", 2)).toBe("2024-03-01"); // leap
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("formats Thai range labels including cross-month spans", () => {
    expect(formatPayRangeLabel({ start: "2026-08-11", end: "2026-08-20" })).toBe("11–20 ส.ค.");
    expect(formatPayRangeLabel({ start: "2026-08-30", end: "2026-09-03" })).toBe("30 ส.ค.–3 ก.ย.");
  });
});
