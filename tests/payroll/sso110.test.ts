import { describe, expect, it } from "vitest";
import {
  buildSso110Rows,
  buildSso110Workbook,
  SSO110_HEADERS,
  SSO_HEADERS,
} from "../../src/lib/payroll/ssoExport";
import type { Employee } from "../../src/types";

function employee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-1",
    user_id: "user-1",
    employee_code: "EMP001",
    full_name: "นายทดสอบ ระบบ",
    tax_id: "1100400439601",
    address: null,
    position: "พนักงาน",
    department: null,
    salary_type: "monthly",
    base_salary: 28000,
    bank_name: null,
    bank_account: null,
    sso_registered: true,
    start_date: "2024-01-01",
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

function obligations(
  entries: [string, number, number, number][],
): Map<string, { insurable: number; sso_employee: number; sso_employer: number }> {
  return new Map(
    entries.map(([id, insurable, sso_employee, sso_employer]) => [
      id,
      { insurable, sso_employee, sso_employer },
    ]),
  );
}

describe("sso 1-10 rows", () => {
  it("files month-aggregated wages for everyone with pay, including leavers and daily staff", () => {
    const emps = [
      employee({ id: "a", employee_code: "EMP001" }),
      // Mid-month leaver with wages must still be filed.
      employee({ id: "b", employee_code: "EMP002", status: "inactive", end_date: "2026-08-15" }),
      employee({ id: "c", employee_code: "EMP003", salary_type: "daily" }),
    ];
    const built = buildSso110Rows(
      emps,
      obligations([
        ["a", 30000, 875, 875],
        ["b", 15000, 750, 750],
        ["c", 8000, 400, 400],
      ]),
    );
    expect(built.errors).toEqual([]);
    expect(built.rows).toHaveLength(3);
    expect(built.rows.find((r) => r.employeeCode === "EMP002")?.wage).toBe(15000);
    expect(built.rows.find((r) => r.employeeCode === "EMP003")?.contribution).toBe(400);
  });

  it("excludes contractors, over-60 hires, and zero-wage staff", () => {
    const emps = [
      employee({ id: "a", employee_code: "EMP010", sso_registered: false }),
      employee({ id: "b", employee_code: "EMP011", date_of_birth: "1960-01-01" }),
      employee({ id: "c", employee_code: "EMP012" }),
    ];
    const built = buildSso110Rows(
      emps,
      obligations([
        ["a", 20000, 0, 0],
        ["b", 20000, 0, 0],
        ["c", 0, 0, 0],
      ]),
    );
    expect(built.rows).toEqual([]);
    expect(built.skippedContract).toBe(1);
    expect(built.skippedOver60).toBe(1);
    expect(built.skippedZeroWage).toBe(1);
  });

  it("blocks on invalid IDs with named errors", () => {
    const built = buildSso110Rows(
      [employee({ id: "a", employee_code: "EMP020", tax_id: "999" })],
      obligations([["a", 20000, 875, 875]]),
    );
    expect(built.rows).toEqual([]);
    expect(built.errors[0].employeeCode).toBe("EMP020");
  });

  it("builds the template workbook with sequence, header block, and totals", () => {
    const built = buildSso110Rows(
      [
        employee({ id: "a", employee_code: "EMP001", tax_id: "1100400439601" }),
        employee({
          id: "b",
          employee_code: "EMP002",
          full_name: "นางสมศรี ดีมาก",
          tax_id: "1100700307220",
        }),
      ],
      obligations([
        ["a", 30000, 875, 875],
        ["b", 15000, 750, 750],
      ]),
    );
    expect(built.errors).toEqual([]);
    const wb = buildSso110Workbook(built.rows, {
      companyName: "บริษัท ทดสอบ จำกัด",
      ssoAccountNo: "1234567890",
      ssoBranchNo: "000000",
      year: 2026,
      month: 8,
    });
    expect(wb.worksheets).toHaveLength(1);
    const ws = wb.getWorksheet("000000")!;
    // Title block rows 1-3, blank 4, headers 5.
    expect(String(ws.getRow(1).getCell(1).value)).toContain("สปส.1-10");
    expect(String(ws.getRow(2).getCell(1).value)).toContain("1234567890");
    const headers = ws.getRow(5).values as unknown[];
    expect(headers.slice(1)).toEqual(SSO110_HEADERS);
    expect(SSO110_HEADERS.slice(1)).toEqual(SSO_HEADERS);
    // Data rows carry sequence numbers; footer sums both contributions.
    expect(ws.getRow(6).getCell(1).value).toBe(1);
    const lastData = 5 + built.rows.length;
    expect(ws.getRow(lastData + 1).getCell(6).value).toBe(45000);
    expect(ws.getRow(lastData + 1).getCell(7).value).toBe(1625);
    // Branch sheet naming.
    const wbBranch = buildSso110Workbook(built.rows, {
      year: 2026,
      month: 8,
      ssoBranchNo: "000001",
    });
    expect(wbBranch.getWorksheet("000001")).toBeDefined();
  });
});
