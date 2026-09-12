import { describe, expect, it } from "vitest";
import {
  computeLeaveBalances,
  describeOtWindow,
  parseAttendanceCsv,
  suggestOtWindow,
  summarizeAttendance,
  summaryToPayrollInput,
} from "../../src/lib/payroll/attendance";

describe("attendance csv import", () => {
  it("parses Thai + EN statuses and flags bad rows", () => {
    const { days, errors } = parseAttendanceCsv(
      `employee_code,date,status,hours\nEMP001,2026-09-01,มา,9\nEMP001,2026-09-02,ขาด,\nBAD,not-a-date,มา,`,
    );
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ employee_code: "EMP001", status: "present", hours: 9 });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("บรรทัด 4");
  });

  it("summarizes per employee and suggests OT beyond 8h", () => {
    const { days } = parseAttendanceCsv(
      `EMP001,2026-09-01,มา,10\nEMP001,2026-09-02,ลา,\nEMP001,2026-09-03,ขาด,`,
    );
    const map = summarizeAttendance(days);
    const s = map.get("EMP001")!;
    expect(s.present_days).toBe(1);
    expect(s.leave_days).toBe(1);
    expect(s.absent_days).toBe(1);
    expect(s.suggested_ot_hours).toBe(2);
  });

  it("maps summaries to payroll inputs by salary type", () => {
    const s = { employee_code: "EMP001", present_days: 20, absent_days: 2, leave_days: 2, holiday_days: 0, suggested_ot_hours: 0 };
    expect(summaryToPayrollInput(s, "daily")).toEqual({ days_worked: 20, absent_days: 0 });
    // monthly: absent + unpaid leave (no paid quota passed => all leave counts)
    expect(summaryToPayrollInput(s, "monthly")).toEqual({ days_worked: null, absent_days: 4 });
    // with 2 paid leave days per month, only absent counts
    expect(summaryToPayrollInput(s, "monthly", { paidLeaveDays: 2 })).toEqual({ days_worked: null, absent_days: 2 });
  });

  it("computes leave balances without going negative", () => {
    const out = computeLeaveBalances([{ type: "ลาพักร้อน", quota_days: 6 }], { "ลาพักร้อน": 8 });
    expect(out[0].remaining_days).toBe(0);
    expect(out[0].used_days).toBe(8);
  });

  it("describes and suggests OT windows", () => {
    expect(describeOtWindow("2026-09-01", "2026-09-30", null, null)).toContain("OT ตามรอบเงินเดือน");
    expect(describeOtWindow("2026-09-01", "2026-09-30", "2026-09-01", "2026-09-25")).toContain("OT แยกตัดรอบ");
    expect(suggestOtWindow("2026-09-01", "2026-09-30", 5)).toEqual({ ot_start: "2026-09-01", ot_end: "2026-09-25" });
  });
});
