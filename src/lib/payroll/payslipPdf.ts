import type { Employee, PayrollRun, PayrollLineItem } from "../../types";

export interface PayslipCalc {
  base_pay: number;
  absence_deduction: number;
  ot_pay: number;
  additions_total: number;
  deductions_total: number;
  gross_pay: number;
  sso_employee: number;
  sso_employer: number;
  withholding_tax: number;
  net_pay: number;
  totalDeductions: number;
}

const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

const SLIP_CSS = `
  .slip-root { font-family: 'Sarabun', 'TH Sarabun New', Arial, sans-serif; color: #1a1a18; font-size: 12px; padding: 20px; background: #ffffff; width: 100%; box-sizing: border-box; }
  .slip-root h1 { font-size: 18px; margin: 0 0 2px; }
  .sub { color: #6b6b6b; font-size: 12px; margin-bottom: 20px; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; border: 1px solid #e8e6df; border-radius: 8px; padding: 12px; margin-bottom: 20px; background: #faf9f5; }
  .meta div span { display: block; color: #6b6b6b; font-size: 10px; }
  .meta div { font-weight: 500; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 20px; }
  h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e8e6df; padding-bottom: 6px; margin: 0 0 8px; color: #444; }
  .line { display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px; }
  .total-line { display: flex; justify-content: space-between; border-top: 1px solid #e8e6df; padding-top: 6px; margin-top: 6px; font-weight: 600; }
  .net { display: flex; justify-content: space-between; align-items: baseline; border-top: 2px solid #1a1a18; padding-top: 10px; margin-top: 12px; }
  .net .label { font-weight: 700; font-size: 13px; }
  .net .amount { font-size: 22px; font-weight: 700; }
`;

function fmt(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Slip markup WITHOUT document chrome (<style> included) — consumed by the PDF renderer. */
export function buildPayslipSlipNode(employee: Employee, run: PayrollRun, lineItem: PayrollLineItem, calc: PayslipCalc, hourlyRate: number): string {
  const otLines = (lineItem.ot_entries || [])
    .map((ot) => {
      const pay = Number(ot.hours) * hourlyRate * Number(ot.multiplier);
      return `<div class="line"><span>OT ${ot.type === "holiday" ? "วันหยุด" : "ปกติ"} ${ot.hours}ชม. ×${ot.multiplier}</span><span>฿${fmt(pay)}</span></div>`;
    })
    .join("");
  const addLines = (lineItem.additions || []).map((a) => `<div class="line"><span>${a.label}</span><span>฿${fmt(Number(a.amount) || 0)}</span></div>`).join("");
  const dedLines = (lineItem.deductions || []).map((d) => `<div class="line"><span>${d.label}</span><span>-฿${fmt(Number(d.amount) || 0)}</span></div>`).join("");

  return `<style>${SLIP_CSS}</style>
  <div class="slip-root">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
      <div><h1>สลิปเงินเดือน</h1><div class="sub">Pay Slip</div></div>
      <div style="text-align:right">
        <div style="color:#9b9b9b;font-size:11px">รอบการจ่าย</div>
        <div style="font-weight:500;font-size:13px">${run.pay_date}</div>
        <div style="color:#9b9b9b;font-size:11px;margin-top:4px">${MONTHS[(run.period_month ?? 1) - 1]} ${(run.period_year ?? 2025) + 543}</div>
      </div>
    </div>
    <div class="meta">
      <div><span>รหัสพนักงาน</span>${employee.employee_code}</div>
      <div><span>ชื่อ-นามสกุล</span>${employee.full_name}</div>
      <div><span>ตำแหน่ง</span>${employee.position || "—"}</div>
      <div><span>แผนก</span>${employee.department || "—"}</div>
    </div>
    <div class="cols">
      <div>
        <h3>รายได้</h3>
        <div class="line"><span>เงินเดือน${employee.salary_type === "daily" ? ` (${lineItem.days_worked ?? 0} วัน)` : ""}</span><span>฿${fmt(calc.base_pay)}</span></div>
        ${(calc.absence_deduction ?? 0) > 0 ? `<div class="line"><span>หักวันขาดงาน (${lineItem.absent_days} วัน)</span><span>-฿${fmt(calc.absence_deduction)}</span></div>` : ""}
        ${otLines}${addLines}
        <div class="total-line"><span>รวมรายได้</span><span>฿${fmt(calc.gross_pay)}</span></div>
      </div>
      <div>
        <h3>รายการหัก</h3>
        ${employee.sso_registered === false ? `<div class="line"><span>ประกันสังคม</span><span>— ไม่ลงทะเบียน</span></div>` : `<div class="line"><span>ประกันสังคม (พนักงาน)</span><span>-฿${fmt(calc.sso_employee)}</span></div>`}
        <div class="line"><span>${employee.sso_registered === false ? "ภาษีหัก ณ ที่จ่าย (ค่าจ้างทำของ 3%)" : "ภาษีหัก ณ ที่จ่าย"}</span><span>-฿${fmt(calc.withholding_tax)}</span></div>
        ${dedLines}
        <div class="total-line"><span>รวมหัก</span><span>-฿${fmt(calc.sso_employee + calc.withholding_tax + calc.totalDeductions)}</span></div>
      </div>
    </div>
    <div class="net"><span class="label">เงินเดือนสุทธิ Net Pay</span><span class="amount">฿${fmt(calc.net_pay)}</span></div>
  </div>`;
}

export function buildPayslipHtml(employee: Employee, run: PayrollRun, lineItem: PayrollLineItem, calc: PayslipCalc, hourlyRate: number): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>สลิปเงินเดือน ${employee.full_name}</title><style>@page { size: A4; margin: 0; } body { margin: 0; }</style></head><body>${buildPayslipSlipNode(employee, run, lineItem, calc, hourlyRate)}</body></html>`;
}

export interface BulkPayslipInput {
  employee: Employee;
  run: PayrollRun;
  lineItem: PayrollLineItem;
  calc: PayslipCalc;
  hourlyRate: number;
}

export function buildPayslipHtmlPerPage(inputs: BulkPayslipInput[]): string {
  const pages = inputs.map((i) => buildPayslipHtml(i.employee, i.run, i.lineItem, i.calc, i.hourlyRate));
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>สลิปเงินเดือน</title>
<style>@page { size: A4; margin: 12mm; } body { font-family: 'Sarabun', Arial, sans-serif; } .page { page-break-after: always; } .page:last-child { page-break-after: auto; }</style></head><body>
${pages.map((p) => `<div class="page">${p}</div>`).join("")}
</body></html>`;
}
