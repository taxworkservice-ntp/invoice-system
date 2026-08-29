import ExcelJS from "exceljs";
import type { Employee, PayrollRun, PayrollLineItem } from "../../types";
import { formatCurrency } from "../format";

const BRAND_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF378ADD" } };
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F7FB" } };
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE8E6DF" } },
  left: { style: "thin", color: { argb: "FFE8E6DF" } },
  bottom: { style: "thin", color: { argb: "FFE8E6DF" } },
  right: { style: "thin", color: { argb: "FFE8E6DF" } },
};
const CURRENCY_FMT = "#,##0.00";

function applyHeader(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  cell.fill = BRAND_FILL;
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = THIN_BORDER;
}

function applyTitle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 14, color: { argb: "FF1A1A18" } };
}

function applyBody(cell: ExcelJS.Cell, opts: { bold?: boolean; right?: boolean; color?: string } = {}) {
  cell.font = { size: 10, color: { argb: opts.color ?? "FF1A1A18" }, bold: opts.bold ?? false };
  cell.alignment = { vertical: "middle", horizontal: opts.right ? "right" : "left", wrapText: true };
  cell.border = THIN_BORDER;
}

function applyPageSetup(ws: ExcelJS.Worksheet) {
  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  };
}

export interface PayrollCalcRow {
  employee: Employee;
  lineItem: PayrollLineItem | null;
  base_pay: number;
  ot_pay: number;
  additions_total: number;
  deductions_total: number;
  gross_pay: number;
  sso_employee: number;
  sso_employer: number;
  withholding_tax: number;
  net_pay: number;
}

const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

function buildSummaryHeader(ws: ExcelJS.Worksheet, run: PayrollRun, rows: PayrollCalcRow[]) {
  ws.mergeCells("A1:K1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `สรุปเงินเดือน — ${MONTHS[run.period_month - 1]} ${run.period_year + 543}`;
  applyTitle(titleCell);

  ws.mergeCells("A2:K2");
  const subCell = ws.getCell("A2");
  subCell.value = `วันจ่าย ${run.pay_date} · พนักงาน ${rows.length} คน · สถานะ: ${run.status === "finalized" ? "ปิดรอบ" : "ร่าง"}`;
  subCell.font = { size: 10, color: { argb: "FF6B6B6B" } };

  const headers = ["รหัส", "ชื่อ-นามสกุล", "ตำแหน่ง", "ประเภท", "ฐานเงินเดือน", "OT", "เงินเพิ่ม", "เงินหัก", "ค่าแรงรวม", "SSO (พนักงาน)", "ภาษี", "สุทธิ"];
  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => applyHeader(cell));
}

export function buildRunSummaryWorkbook(run: PayrollRun, rows: PayrollCalcRow[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("สรุปเงินเดือน");
  applyPageSetup(ws);

  buildSummaryHeader(ws, run, rows);

  let totBase = 0, totOt = 0, totAdd = 0, totDed = 0, totGross = 0, totSso = 0, totSsoEmp = 0, totWht = 0, totNet = 0;

  for (const r of rows) {
    const row = ws.addRow([
      r.employee.employee_code,
      r.employee.full_name,
      r.employee.position,
      r.employee.salary_type === "monthly" ? "รายเดือน" : "รายวัน",
      r.base_pay,
      r.ot_pay,
      r.additions_total,
      r.deductions_total,
      r.gross_pay,
      r.sso_employee,
      r.withholding_tax,
      r.net_pay,
    ]);
    row.eachCell((cell, col) => {
      if (col >= 5) {
        cell.numFmt = CURRENCY_FMT;
        applyBody(cell, { right: true });
      } else {
        applyBody(cell);
      }
    });

    totBase += r.base_pay; totOt += r.ot_pay; totAdd += r.additions_total; totDed += r.deductions_total;
    totGross += r.gross_pay; totSso += r.sso_employee; totSsoEmp += r.sso_employer; totWht += r.withholding_tax; totNet += r.net_pay;
  }

  const totalRow = ws.addRow(["", "", "", "รวม", totBase, totOt, totAdd, totDed, totGross, totSso, totWht, totNet]);
  totalRow.eachCell((cell, col) => {
    if (col >= 5) cell.numFmt = CURRENCY_FMT;
    applyBody(cell, { bold: true, right: col >= 5 });
  });

  ws.columns = [
    { width: 10 }, { width: 22 }, { width: 16 }, { width: 10 },
    { width: 14 }, { width: 12 }, { width: 12 }, { width: 12 },
    { width: 14 }, { width: 14 }, { width: 12 }, { width: 14 },
  ];

  return wb;
}

export function buildBankPaymentWorkbook(run: PayrollRun, rows: PayrollCalcRow[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("รายการโอน");
  applyPageSetup(ws);

  ws.mergeCells("A1:E1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `รายการโอนเงินเดือน — ${MONTHS[run.period_month - 1]} ${run.period_year + 543} · วันจ่าย ${run.pay_date}`;
  applyTitle(titleCell);

  const headerRow = ws.addRow(["รหัส", "ชื่อ-นามสกุล", "เลขบัญชีธนาคาร", "จำนวนเงิน (บาท)", "หมายเหตุ"]);
  headerRow.eachCell((cell) => applyHeader(cell));

  let total = 0;
  for (const r of rows) {
    if (!r.employee.bank_account) continue;
    const row = ws.addRow([
      r.employee.employee_code,
      r.employee.full_name,
      r.employee.bank_account,
      r.net_pay,
      "",
    ]);
    row.getCell(4).numFmt = CURRENCY_FMT;
    row.eachCell((cell, col) => col === 4 ? applyBody(cell, { right: true }) : applyBody(cell));
    total += r.net_pay;
  }

  const totalRow = ws.addRow(["", "", "รวม", total, ""]);
  totalRow.getCell(4).numFmt = CURRENCY_FMT;
  totalRow.eachCell((cell, col) => applyBody(cell, { bold: true, right: col === 4 }));

  ws.columns = [{ width: 10 }, { width: 22 }, { width: 18 }, { width: 16 }, { width: 14 }];
  return wb;
}

function buildWhtSheet(ws: ExcelJS.Worksheet, run: PayrollRun, rows: PayrollCalcRow[], formLabel: string) {
  ws.mergeCells("A1:F1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `รายงานภาษีหัก ณ ที่จ่าย (${formLabel}) — ${MONTHS[run.period_month - 1]} ${run.period_year + 543}`;
  applyTitle(titleCell);

  ws.mergeCells("A2:F2");
  const subCell = ws.getCell("A2");
  subCell.value = `สำหรับยื่น ${formLabel} เดือน${MONTHS[run.period_month - 1]} · วันจ่าย ${run.pay_date}`;
  subCell.font = { size: 10, color: { argb: "FF6B6B6B" } };

  const headerRow = ws.addRow(["รหัส", "ชื่อ-นามสกุล", "เลขประจำตัวผู้เสียภาษี", "ค่าแรงรวม", "ภาษีหัก ณ ที่จ่าย", "วันจ่าย"]);
  headerRow.eachCell((cell) => applyHeader(cell));

  let totGross = 0, totWht = 0;
  for (const r of rows) {
    const row = ws.addRow([
      r.employee.employee_code,
      r.employee.full_name,
      r.employee.tax_id ?? "",
      r.gross_pay,
      r.withholding_tax,
      run.pay_date,
    ]);
    row.getCell(4).numFmt = CURRENCY_FMT;
    row.getCell(5).numFmt = CURRENCY_FMT;
    row.eachCell((cell, col) => (col === 4 || col === 5) ? applyBody(cell, { right: true }) : applyBody(cell));
    totGross += r.gross_pay;
    totWht += r.withholding_tax;
  }

  const totalRow = ws.addRow(["", "", "รวม", totGross, totWht, ""]);
  totalRow.getCell(4).numFmt = CURRENCY_FMT;
  totalRow.getCell(5).numFmt = CURRENCY_FMT;
  totalRow.eachCell((cell, col) => applyBody(cell, { bold: true, right: col === 4 || col === 5 }));

  ws.columns = [{ width: 10 }, { width: 22 }, { width: 20 }, { width: 14 }, { width: 16 }, { width: 14 }];
}

export function buildWhtWorkbook(run: PayrollRun, rows: PayrollCalcRow[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();

  const ssoRows = rows.filter((r) => r.employee.sso_registered !== false);
  const contractRows = rows.filter((r) => r.employee.sso_registered === false);

  if (ssoRows.length === 0 && contractRows.length === 0) {
    const ws = wb.addWorksheet("ภาษีหัก ณ ที่จ่าย");
    applyPageSetup(ws);
    buildWhtSheet(ws, run, rows, "ภ.ง.ด.1");
    return wb;
  }

  if (ssoRows.length > 0) {
    const ws = wb.addWorksheet("ภ.ง.ด.1");
    applyPageSetup(ws);
    buildWhtSheet(ws, run, ssoRows, "ภ.ง.ด.1");
  }

  if (contractRows.length > 0) {
    const ws = wb.addWorksheet("ภ.ง.ด.3 (ค่าจ้างทำของ)");
    applyPageSetup(ws);
    buildWhtSheet(ws, run, contractRows, "ภ.ง.ด.3");
  }

  return wb;
}

export async function workbookToBlob(wb: ExcelJS.Workbook): Promise<Blob> {
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
