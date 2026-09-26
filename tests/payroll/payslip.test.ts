import { describe, expect, it } from "vitest";
import { buildPayslipSlipNode, type PayslipCalc } from "../../src/lib/payroll/payslipPdf";
import type { Employee, PayrollLineItem, PayrollRun } from "../../src/types";

function employee(): Employee {
  return {
    id: "emp-1",
    user_id: "user-1",
    employee_code: "EMP001",
    full_name: "นายทดสอบ ระบบ",
    tax_id: null,
    address: null,
    position: "พนักงาน",
    department: null,
    salary_type: "monthly",
    base_salary: 30000,
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
  };
}

function run(batchType: PayrollRun["batch_type"]): PayrollRun {
  return {
    id: "run-1",
    user_id: "user-1",
    period_month: 8,
    period_year: 2026,
    period_start: "2026-08-01",
    period_end: "2026-08-05",
    label: batchType === "ot" ? "OT 1–5" : "เงินเดือน",
    pay_date: "2026-08-06",
    status: "finalized",
    batch_type: batchType,
    ot_start: null,
    ot_end: null,
    revision: 1,
    finalized_at: null,
    finalized_by: null,
    reopened_at: null,
    reopened_by: null,
    total_gross: 0,
    total_net: 0,
    employee_count: 1,
    created_at: "",
    updated_at: "",
  };
}

function lineItem(): PayrollLineItem {
  return {
    id: "li-1",
    payroll_run_id: "run-1",
    employee_id: "emp-1",
    days_worked: null,
    ot_entries: [{ hours: 10, type: "normal", multiplier: 1.5 }],
    additions: [],
    deductions: [],
    absent_days: null,
    absence_daily_rate: null,
    gross_pay: 1875,
    sso_employee: 0,
    sso_employer: 0,
    withholding_tax: 0,
    net_pay: 1875,
    employee_code_snapshot: null,
    full_name_snapshot: null,
    position_snapshot: null,
    salary_type_snapshot: null,
    base_salary_snapshot: null,
  };
}

function otCalc(): PayslipCalc {
  return {
    base_pay: 0,
    absence_deduction: 0,
    ot_pay: 1875,
    additions_total: 0,
    deductions_total: 0,
    gross_pay: 1875,
    sso_employee: 0,
    sso_employer: 0,
    withholding_tax: 0,
    net_pay: 1875,
    totalDeductions: 0,
  };
}

describe("payslip titles", () => {
  it("titles OT-round slips as OT pay slips without a base-salary line", () => {
    const html = buildPayslipSlipNode(employee(), run("ot"), lineItem(), otCalc(), 125, null);
    expect(html).toContain("สลิปค่าล่วงเวลา (OT)");
    expect(html).not.toContain("<h1>สลิปเงินเดือน</h1>");
    expect(html).not.toContain("เงินเดือน</span>");
  });

  it("keeps the salary title and base line for salary rounds", () => {
    const html = buildPayslipSlipNode(
      employee(),
      run("salary"),
      lineItem(),
      { ...otCalc(), base_pay: 30000, gross_pay: 31875, net_pay: 31875 },
      125,
      null,
    );
    expect(html).toContain("<h1>สลิปเงินเดือน</h1>");
    expect(html).toContain("เงินเดือน</span>");
  });
});
