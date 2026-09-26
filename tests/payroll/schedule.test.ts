import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  describeHistoryRun,
  expectedSalaryBatches,
  formatHistoryMonthLabel,
  formatPayRangeLabel,
  historyMonthKey,
  suggestMonthPlan,
  suggestNextWindow,
} from "../../src/lib/payroll/schedule";

describe("pay schedule windows", () => {
  it("chains monthly windows after the previous run", () => {
    expect(suggestNextWindow("monthly", {}, "2026-08-31")).toEqual({
      start: "2026-09-01",
      end: "2026-09-30",
    });
    expect(suggestNextWindow("monthly", {}, "2024-02-29")).toEqual({
      start: "2024-03-01",
      end: "2024-03-31",
    });
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
      expect(suggestNextWindow("monthly", {}, null, { year: 2026, month: 7 })).toEqual({
        start: "2026-07-01",
        end: "2026-07-31",
      });
      expect(suggestNextWindow("monthly", {}, null, { year: 2024, month: 2 })).toEqual({
        start: "2024-02-01",
        end: "2024-02-29",
      });
    });

    it("semimonthly opens the first cut-off window of the referenced month", () => {
      expect(
        suggestNextWindow("semimonthly", { anchorDay: 15 }, null, { year: 2026, month: 9 }),
      ).toEqual({ start: "2026-09-01", end: "2026-09-15" });
    });

    it("weekly/custom cycles walk from the 1st of the referenced month until covering its last day", () => {
      expect(
        suggestNextWindow("custom", { cycleLenDays: 5 }, null, { year: 2026, month: 8 }),
      ).toEqual({ start: "2026-08-31", end: "2026-09-04" }); // final tile starts in Aug, ends past edge so the 31st is covered
      expect(suggestNextWindow("weekly", {}, null, { year: 2024, month: 2 })).toEqual({
        start: "2024-02-29",
        end: "2024-03-06",
      }); // leap-Feb covered, spillover by design
    });

    it("chaining still wins over the reference when history exists", () => {
      expect(suggestNextWindow("monthly", {}, "2026-07-31", { year: 2026, month: 7 })).toEqual({
        start: "2026-08-01",
        end: "2026-08-31",
      });
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

  it("expects deterministic salary batches per month (null when cadence varies)", () => {
    expect(expectedSalaryBatches("monthly")).toBe(1);
    expect(expectedSalaryBatches("semimonthly")).toBe(2);
    expect(expectedSalaryBatches("weekly")).toBeNull();
    expect(expectedSalaryBatches("custom")).toBeNull();
  });

  it("plans semimonthly salary + 6 OT windows for a 30-day month", () => {
    const plan = suggestMonthPlan(2026, 9, {
      frequency: "semimonthly",
      anchorDay: 15,
      otPerMonth: 6,
    });
    expect(plan.map((s) => [s.batchType, s.start, s.end, s.label])).toEqual([
      ["salary", "2026-09-01", "2026-09-15", "เงินเดือนต้นเดือน"],
      ["salary", "2026-09-16", "2026-09-30", "เงินเดือนปลายเดือน"],
      ["ot", "2026-09-01", "2026-09-05", "OT 1–5"],
      ["ot", "2026-09-06", "2026-09-10", "OT 6–10"],
      ["ot", "2026-09-11", "2026-09-15", "OT 11–15"],
      ["ot", "2026-09-16", "2026-09-20", "OT 16–20"],
      ["ot", "2026-09-21", "2026-09-25", "OT 21–25"],
      ["ot", "2026-09-26", "2026-09-30", "OT 26–30"],
    ]);
  });

  it("short months keep every slot inside the month", () => {
    const feb = suggestMonthPlan(2026, 2, {
      frequency: "semimonthly",
      anchorDay: 15,
      otPerMonth: 6,
    });
    expect(feb.filter((s) => s.batchType === "salary").map((s) => [s.start, s.end])).toEqual([
      ["2026-02-01", "2026-02-15"],
      ["2026-02-16", "2026-02-28"],
    ]);
    const ot = feb.filter((s) => s.batchType === "ot");
    expect(ot).toHaveLength(6);
    expect(ot[5]).toMatchObject({ start: "2026-02-26", end: "2026-02-28" });
    expect(
      ot.every((s) => s.start.slice(0, 7) === "2026-02" && s.end.slice(0, 7) === "2026-02"),
    ).toBe(true);

    const jan = suggestMonthPlan(2026, 1, {
      frequency: "semimonthly",
      anchorDay: 15,
      otPerMonth: 6,
    });
    const janOt = jan.filter((s) => s.batchType === "ot");
    expect(janOt).toHaveLength(6);
    expect(janOt[5]).toMatchObject({ start: "2026-01-26", end: "2026-01-31" });
  });

  it("monthly frequency plans one salary run; zero OT means salary only", () => {
    const plan = suggestMonthPlan(2026, 9, { frequency: "monthly", otPerMonth: 0 });
    expect(plan).toEqual([
      { batchType: "salary", start: "2026-09-01", end: "2026-09-30", label: "เงินเดือน" },
    ]);
  });

  it("describes history runs so same labels across months stay distinct", () => {
    const aug = describeHistoryRun({
      label: "OT 1–5",
      period_start: "2026-08-01",
      period_end: "2026-08-05",
    });
    const jul = describeHistoryRun({
      label: "OT 1–5",
      period_start: "2026-07-01",
      period_end: "2026-07-05",
    });
    expect(aug.title).toBe("OT 1–5");
    expect(jul.title).toBe("OT 1–5");
    expect(aug.detail).not.toBe(jul.detail);
    expect(aug.detail).toContain("ส.ค.");
    expect(jul.detail).toContain("ก.ค.");

    const bare = describeHistoryRun({
      label: null,
      period_start: "2026-08-01",
      period_end: "2026-08-31",
    });
    expect(bare.title).toBe("1–31 ส.ค.");
    expect(bare.detail).toBe("2026-08-01 → 2026-08-31");

    expect(historyMonthKey("2026-08-05")).toBe("2026-08");
    expect(formatHistoryMonthLabel(2026, 8)).toBe("ส.ค. 2569");
    expect(formatHistoryMonthLabel(2026, 7)).toBe("ก.ค. 2569");
  });
});
