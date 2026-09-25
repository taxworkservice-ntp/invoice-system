import { describe, expect, it } from "vitest";
import {
  buildSsoRosterRows,
  buildSsoRows,
  buildSsoWorkbook,
  isValidThaiId,
  splitInsuredName,
  SSO_HEADERS,
  SSO_SHEET_NAME,
} from "../../src/lib/payroll/ssoExport";
import type { PayrollCalcRow } from "../../src/lib/payroll/reportXlsx";
import type { Employee } from "../../src/types";

describe("splitInsuredName", () => {
  it("peels a Thai title and splits first/last", () => {
    expect(splitInsuredName("นายวิทยา จุลยะโชค")).toEqual({
      title: "นาย",
      firstName: "วิทยา",
      lastName: "จุลยะโชค",
    });
  });

  it("prefers the longest title token (นางสาว over นาง)", () => {
    expect(splitInsuredName("นางสาวญาณินท์ ภาวนา")).toEqual({
      title: "นางสาว",
      firstName: "ญาณินท์",
      lastName: "ภาวนา",
    });
  });

  it("keeps single-token names whole with an empty family name", () => {
    expect(splitInsuredName("PUI")).toEqual({ title: "", firstName: "PUI", lastName: "" });
    expect(splitInsuredName("นาย HTAY AUNG")).toEqual({
      title: "นาย",
      firstName: "HTAY",
      lastName: "AUNG",
    });
  });

  it("handles untitled names", () => {
    expect(splitInsuredName("DA SENGXAY")).toEqual({
      title: "",
      firstName: "DA",
      lastName: "SENGXAY",
    });
  });
});

describe("isValidThaiId", () => {
  it("accepts a checksum-valid ID", () => {
    expect(isValidThaiId("1100400439601")).toBe(true);
  });

  it("rejects wrong length, non-digits, and bad checksums", () => {
    expect(isValidThaiId("110040043960")).toBe(false);
    expect(isValidThaiId("11004004396012")).toBe(false);
    expect(isValidThaiId("1100400439602")).toBe(false);
    expect(isValidThaiId(null)).toBe(false);
    expect(isValidThaiId("")).toBe(false);
  });
});

function employee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-1",
    user_id: "user-1",
    employee_code: "EMP001",
    full_name: "นายวิทยา จุลยะโชค",
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
    date_of_birth: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function calcRow(emp: Employee, grossPay: number, ssoEmployee: number): PayrollCalcRow {
  return {
    employee: emp,
    lineItem: null,
    base_pay: grossPay,
    ot_pay: 0,
    additions_total: 0,
    deductions_total: 0,
    gross_pay: grossPay,
    sso_employee: ssoEmployee,
    sso_employer: ssoEmployee,
    withholding_tax: 0,
    net_pay: grossPay,
  };
}

describe("buildSsoRosterRows", () => {
  it("derives wage from base salary with a rounded capped contribution", () => {
    const rows = buildSsoRosterRows([
      employee(),
      employee({ id: "b", employee_code: "EMP002", base_salary: 15000 }),
      employee({ id: "c", employee_code: "EMP003", base_salary: 9000 }),
    ]);
    expect(rows.map((r) => [r.gross_pay, r.sso_employee])).toEqual([
      [28000, 875],
      [15000, 750],
      [9000, 450],
    ]);
    const built = buildSsoRows(rows);
    expect(built.errors).toEqual([]);
    expect(built.rows).toHaveLength(3);
  });
});

describe("buildSsoRows", () => {
  it("builds a capped row the way the SSO sample expects", () => {
    const result = buildSsoRows([calcRow(employee(), 28000, 875)]);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      {
        taxId: "1100400439601",
        title: "นาย",
        firstName: "วิทยา",
        lastName: "จุลยะโชค",
        wage: 28000,
        contribution: 875,
      },
    ]);
  });

  it("skips inactive and contract staff, blocks bad IDs and zero wages", () => {
    const result = buildSsoRows([
      calcRow(employee({ id: "a", status: "inactive" }), 12000, 600),
      calcRow(employee({ id: "b", sso_registered: false }), 12000, 0),
      calcRow(employee({ id: "c", employee_code: "EMP003", tax_id: "123" }), 12000, 600),
      calcRow(employee({ id: "d", employee_code: "EMP004" }), 0, 0),
    ]);
    expect(result.rows).toEqual([]);
    expect(result.skippedInactive).toBe(1);
    expect(result.skippedContract).toBe(1);
    expect(result.skippedOver60).toBe(0);
    expect(result.errors.map((e) => e.employeeCode)).toEqual(["EMP003", "EMP004"]);
  });

  it("skips hires already 60+ on their start date into their own bucket", () => {
    const veteran = employee({
      id: "v",
      employee_code: "EMP060",
      date_of_birth: "1960-01-15",
      start_date: "1990-06-01",
    });
    const lateHire = employee({
      id: "w",
      employee_code: "EMP061",
      date_of_birth: "1959-01-15",
      start_date: "2020-01-15",
    });
    const result = buildSsoRows([calcRow(veteran, 20000, 875), calcRow(lateHire, 20000, 0)]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].taxId).toBe("1100400439601");
    expect(result.skippedOver60).toBe(1);
  });
});

describe("buildSsoWorkbook", () => {
  it("writes the e-filing layout with text IDs", async () => {
    const wb = buildSsoWorkbook([
      {
        taxId: "0110040043960",
        title: "นาย",
        firstName: "วิทยา",
        lastName: "จุลยะโชค",
        wage: 28000,
        contribution: 875,
      },
    ]);
    const ws = wb.getWorksheet(SSO_SHEET_NAME);
    expect(ws).toBeDefined();
    expect(ws?.getRow(1).values).toEqual([undefined, ...SSO_HEADERS]);
    const row = ws?.getRow(2);
    const idCell = row?.getCell(1).value as { richText?: { text: string }[] } | null;
    expect(idCell?.richText?.[0]?.text).toBe("0110040043960");
    expect(row?.getCell(5).value).toBe(28000);
    expect(row?.getCell(6).value).toBe(875);
  });
});
