import { describe, expect, it } from "vitest";
import {
  buildEmployeeReportRows,
  buildEmployeeReportWorkbook,
  EMPLOYEE_REPORT_HEADERS,
} from "../../src/lib/payroll/employeeReport";
import type { Employee } from "../../src/types";

function employee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-1",
    user_id: "user-1",
    employee_code: "EMP001",
    full_name: "นายทดสอบ ระบบ",
    tax_id: "1100400439601",
    address: "123 ถนนหลัก",
    position: "พนักงาน",
    department: "ขาย",
    salary_type: "monthly",
    base_salary: 28000,
    bank_name: "กสิกรไทย",
    bank_account: "1234567890",
    sso_registered: true,
    start_date: "2026-08-01",
    status: "active",
    end_date: null,
    resign_reason: null,
    resign_note: null,
    date_of_birth: "1990-01-01",
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("employee report rows", () => {
  it("splits sso / non-sso / all", () => {
    const built = buildEmployeeReportRows(
      [
        employee({ id: "a", employee_code: "EMP001" }),
        employee({ id: "b", employee_code: "EMP002", sso_registered: false }),
        employee({
          id: "c",
          employee_code: "EMP003",
          status: "inactive",
          end_date: "2026-07-10",
        }),
      ],
      2026,
      8,
    );
    expect(built.all.map((e) => e.employee_code)).toEqual(["EMP001", "EMP002", "EMP003"]);
    expect(built.sso.map((e) => e.employee_code)).toEqual(["EMP001"]);
    expect(built.nonSso.map((e) => e.employee_code)).toEqual(["EMP002"]);
  });

  it("scopes joiners and leavers to the report month", () => {
    const built = buildEmployeeReportRows(
      [
        employee({ id: "a", employee_code: "EMP001", start_date: "2026-08-05" }),
        employee({ id: "b", employee_code: "EMP002", start_date: "2026-07-31" }),
        employee({
          id: "c",
          employee_code: "EMP003",
          start_date: "2020-01-01",
          status: "inactive",
          end_date: "2026-08-15",
          resign_reason: "resigned",
        }),
        employee({
          id: "d",
          employee_code: "EMP004",
          start_date: "2020-01-01",
          status: "inactive",
          end_date: "2026-07-20",
        }),
      ],
      2026,
      8,
    );
    expect(built.joiners.map((e) => e.employee_code)).toEqual(["EMP001"]);
    expect(built.leavers.map((e) => e.employee_code)).toEqual(["EMP003"]);
  });
});

describe("employee report workbook", () => {
  it("builds five sheets with headers and text IDs", () => {
    const built = buildEmployeeReportRows(
      [employee({ id: "a", employee_code: "EMP001", start_date: "2026-08-01" })],
      2026,
      8,
    );
    const wb = buildEmployeeReportWorkbook(built, { year: 2026, month: 8 });
    expect(wb.worksheets.map((ws) => ws.name)).toEqual([
      "ทั้งหมด",
      "ประกันสังคม",
      "ไม่ขึ้นประกันสังคม",
      "เข้าใหม่",
      "ลาออก",
    ]);
    const ws = wb.getWorksheet("ทั้งหมด")!;
    expect((ws.getRow(3).values as unknown[]).slice(1)).toEqual(EMPLOYEE_REPORT_HEADERS);
    expect(ws.getRow(4).getCell(2).value).toBe("EMP001");
    // ID kept as text (leading zeros), salary as integer.
    expect(ws.getRow(4).getCell(8).value).toEqual({ richText: [{ text: "1100400439601" }] });
    expect(ws.getRow(4).getCell(7).value).toBe(28000);
    // Buddhist-era dates.
    expect(ws.getRow(4).getCell(11).value).toBe("01/08/2569");
    // Empty non-SSO sheet still renders headers.
    const nonSso = wb.getWorksheet("ไม่ขึ้นประกันสังคม")!;
    expect((nonSso.getRow(3).values as unknown[]).slice(1)).toEqual(EMPLOYEE_REPORT_HEADERS);
    expect(nonSso.rowCount).toBe(3);
  });
});
