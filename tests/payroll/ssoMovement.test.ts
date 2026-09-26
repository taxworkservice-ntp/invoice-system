import { describe, expect, it } from "vitest";
import {
  buildSsoMovementRows,
  buildSsoMovementWorkbook,
  formatBuddhistShort,
  SSO_MOVEMENT_HEADERS_JOINERS,
  SSO_MOVEMENT_HEADERS_LEAVERS,
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

describe("sso movement rows", () => {
  it("lists August joiners with +30d deadlines", () => {
    const built = buildSsoMovementRows(
      [
        employee({ id: "a", employee_code: "EMP001", start_date: "2026-08-01" }),
        employee({ id: "b", employee_code: "EMP002", start_date: "2026-08-31" }),
        employee({ id: "c", employee_code: "EMP003", start_date: "2026-07-31" }),
        employee({ id: "d", employee_code: "EMP004", start_date: "2026-09-01" }),
      ],
      2026,
      8,
      "joiners",
    );
    expect(built.rows.map((r) => r.employeeCode)).toEqual(["EMP001", "EMP002"]);
    expect(built.rows[0].deadline).toBe("2026-08-31");
    expect(built.rows[1].deadline).toBe("2026-09-30");
    expect(built.errors).toEqual([]);
  });

  it("lists August leavers with 15th-of-next-month deadlines", () => {
    const built = buildSsoMovementRows(
      [
        employee({
          id: "a",
          employee_code: "EMP009",
          start_date: "2020-01-01",
          status: "inactive",
          end_date: "2026-08-15",
        }),
        employee({
          id: "b",
          employee_code: "EMP010",
          start_date: "2020-01-01",
          status: "inactive",
          end_date: "2026-12-20",
        }),
      ],
      2026,
      8,
      "leavers",
    );
    expect(built.rows.map((r) => r.employeeCode)).toEqual(["EMP009"]);
    expect(built.rows[0].deadline).toBe("2026-09-15");
  });

  it("rolls December deadlines into January", () => {
    const built = buildSsoMovementRows(
      [
        employee({ id: "a", employee_code: "EMP011", start_date: "2026-12-10" }),
        employee({
          id: "b",
          employee_code: "EMP012",
          start_date: "2020-01-01",
          status: "inactive",
          end_date: "2026-12-05",
        }),
      ],
      2026,
      12,
      "joiners",
    );
    expect(built.rows[0].deadline).toBe("2027-01-09");
    const left = buildSsoMovementRows(
      [
        employee({
          id: "b",
          employee_code: "EMP012",
          start_date: "2020-01-01",
          status: "inactive",
          end_date: "2026-12-05",
        }),
      ],
      2026,
      12,
      "leavers",
    );
    expect(left.rows[0].deadline).toBe("2027-01-15");
  });

  it("skips daily, contractors, and over-60-at-hire", () => {
    const built = buildSsoMovementRows(
      [
        employee({
          id: "a",
          employee_code: "EMP020",
          salary_type: "daily",
          start_date: "2026-08-05",
        }),
        employee({
          id: "b",
          employee_code: "EMP021",
          sso_registered: false,
          start_date: "2026-08-05",
        }),
        // Hired at 62 → never insured.
        employee({
          id: "c",
          employee_code: "EMP022",
          date_of_birth: "1960-01-01",
          start_date: "2026-08-05",
        }),
      ],
      2026,
      8,
      "joiners",
    );
    expect(built.rows).toEqual([]);
    expect(built.skippedDaily).toBe(1);
    expect(built.skippedContract).toBe(1);
    expect(built.skippedOver60).toBe(1);
  });

  it("blocks on invalid IDs with named errors", () => {
    const built = buildSsoMovementRows(
      [employee({ id: "a", employee_code: "EMP030", tax_id: "123", start_date: "2026-08-05" })],
      2026,
      8,
      "joiners",
    );
    expect(built.rows).toEqual([]);
    expect(built.errors).toHaveLength(1);
    expect(built.errors[0].employeeCode).toBe("EMP030");
  });

  it("formats Buddhist short dates", () => {
    expect(formatBuddhistShort("2026-08-01")).toBe("01/08/2569");
    expect(formatBuddhistShort("2026-12-31")).toBe("31/12/2569");
  });

  it("builds single-sheet workbooks with filing headers", () => {
    const built = buildSsoMovementRows(
      [employee({ id: "a", employee_code: "EMP001", start_date: "2026-08-01" })],
      2026,
      8,
      "joiners",
    );
    const wb = buildSsoMovementWorkbook(built.rows, { direction: "joiners", year: 2026, month: 8 });
    expect(wb.worksheets).toHaveLength(1);
    const ws = wb.getWorksheet("เข้าใหม่")!;
    const headerValues = ws.getRow(4).values as unknown[];
    expect(headerValues.slice(1)).toEqual(SSO_MOVEMENT_HEADERS_JOINERS);
    expect(ws.getRow(5).getCell(2).value).toBe("EMP001");

    const wbOut = buildSsoMovementWorkbook([], { direction: "leavers", year: 2026, month: 8 });
    const wsOut = wbOut.getWorksheet("ลาออก")!;
    const outHeaders = wsOut.getRow(4).values as unknown[];
    expect(outHeaders.slice(1)).toEqual(SSO_MOVEMENT_HEADERS_LEAVERS);
  });
});
