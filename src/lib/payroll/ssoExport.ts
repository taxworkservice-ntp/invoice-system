import ExcelJS from "exceljs";
import type { Employee } from "../../types";
import { calculateSSO } from "./calculations";
import { isSsoCovered } from "./ssoEligibility";
import type { PayrollCalcRow } from "./reportXlsx";

/**
 * SSO monthly contribution filing (สปส. 1-10 e-filing layout).
 *
 * Sheet "000000" (head office; branches file under their own number):
 *   เลขประจำตัวประชาชน | คำนำหน้าชื่อ | ชื่อผู้ประกันตน |
 *   นามสกุลผู้ประกันตน | ค่าจ้าง | จำนวนเงินสมทบ
 *
 * Only active, SSO-registered staff are filed. Two wage modes: run mode
 * uses the payroll run's actual gross (daily staff, OT, additions correct);
 * roster mode (buildSsoRosterRows) uses master base salary for the
 * employee-page export. Contributions always follow calculateSSO (5% over
 * a 17,500 ceiling).
 */

export const SSO_SHEET_NAME = "000000";

export const SSO_HEADERS = [
  "เลขประจำตัวประชาชน",
  "คำนำหน้าชื่อ",
  "ชื่อผู้ประกันตน",
  "นามสกุลผู้ประกันตน",
  "ค่าจ้าง",
  "จำนวนเงินสมทบ",
];

const TITLE_TOKENS = [
  "นางสาว",
  "เด็กชาย",
  "เด็กหญิง",
  "นาย",
  "นาง",
  "ด.ช.",
  "ด.ญ.",
  "นส.",
  "น.",
  "ดร.",
  "Mrs.",
  "Mrs",
  "Miss",
  "Mr.",
  "Mr",
  "Ms.",
  "Ms",
].sort((a, b) => b.length - a.length);

export interface InsuredName {
  title: string;
  firstName: string;
  lastName: string;
}

/**
 * Split a full name into SSO columns. A leading title token is peeled off;
 * the last remaining token becomes the family name. Single-token names
 * (common for Myanmar staff) file with an empty family name.
 */
export function splitInsuredName(fullName: string): InsuredName {
  const cleaned = (fullName || "").replace(/\s+/g, " ").trim();
  let rest = cleaned;
  let title = "";
  for (const token of TITLE_TOKENS) {
    if (rest === token) {
      title = rest;
      rest = "";
      break;
    }
    // Thai titles glue to the given name without a space (นายวิทยา);
    // western ones use a space or dot (Mr Smith, ด.ช. ใจดี).
    if (rest.startsWith(token)) {
      const remainder = rest.slice(token.length).replace(/^[.\s]+/, "");
      if (remainder) {
        title = token;
        rest = remainder;
        break;
      }
    }
  }
  if (!rest) return { title, firstName: "", lastName: "" };
  const parts = rest.split(" ").filter(Boolean);
  if (parts.length === 1) return { title, firstName: parts[0], lastName: "" };
  return { title, firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

/** Thai 13-digit national ID, format + checksum. */
export function isValidThaiId(id: string | null | undefined): boolean {
  const digits = (id || "").replace(/\D/g, "");
  if (!/^[0-9]{13}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(digits[12]);
}

export interface SsoFilingRow {
  taxId: string;
  title: string;
  firstName: string;
  lastName: string;
  wage: number;
  contribution: number;
}

export interface SsoRowError {
  employeeCode: string;
  fullName: string;
  reason: string;
}

export interface SsoBuildResult {
  rows: SsoFilingRow[];
  errors: SsoRowError[];
  skippedInactive: number;
  skippedContract: number;
  skippedOver60: number;
}

export interface SsoRosterBuild {
  rows: PayrollCalcRow[];
  skippedDaily: Employee[];
}

/**
 * Roster-mode rows for the employee-page export: wage = master base salary
 * (no payroll run involved), contribution rounded to whole baht the way the
 * SSO form expects.
 *
 * Daily staff are EXCLUDED, never estimated: base_salary is their daily
 * rate, so filing it as a monthly wage would under-report by an order of
 * magnitude. They must use the payroll-run export, which prices actual
 * days worked.
 */
export function buildSsoRosterRows(employees: Employee[]): SsoRosterBuild {
  const rows: PayrollCalcRow[] = [];
  const skippedDaily: Employee[] = [];
  for (const emp of employees) {
    if (emp.salary_type === "daily") {
      skippedDaily.push(emp);
      continue;
    }
    const gross = Number(emp.base_salary) || 0;
    const contribution = Math.round(calculateSSO(gross).employee);
    rows.push({
      employee: emp,
      lineItem: null,
      base_pay: gross,
      ot_pay: 0,
      additions_total: 0,
      deductions_total: 0,
      gross_pay: gross,
      sso_employee: contribution,
      sso_employer: contribution,
      withholding_tax: 0,
      net_pay: gross,
    });
  }
  return { rows, skippedDaily };
}

/**
 * Build filing rows from run calc rows. Strict: any SSO-registered active
 * employee with a missing/invalid ID or non-positive wage blocks the file.
 */
export function buildSsoRows(calcRows: PayrollCalcRow[]): SsoBuildResult {
  const rows: SsoFilingRow[] = [];
  const errors: SsoRowError[] = [];
  let skippedInactive = 0;
  let skippedContract = 0;
  let skippedOver60 = 0;

  for (const row of calcRows) {
    const emp: Employee = row.employee;
    if (emp.status !== "active") {
      skippedInactive += 1;
      continue;
    }
    if (emp.sso_registered === false) {
      skippedContract += 1;
      continue;
    }
    // Thai SSO age-60 rule: already 60+ on the start date → never filed.
    if (!isSsoCovered(emp)) {
      skippedOver60 += 1;
      continue;
    }
    if (!isValidThaiId(emp.tax_id)) {
      errors.push({
        employeeCode: emp.employee_code,
        fullName: emp.full_name,
        reason: "เลขประจำตัวประชาชนไม่ถูกต้อง (ต้องมี 13 หลัก)",
      });
      continue;
    }
    if (!(row.gross_pay > 0)) {
      errors.push({
        employeeCode: emp.employee_code,
        fullName: emp.full_name,
        reason: "ไม่มีค่าจ้างในรอบนี้",
      });
      continue;
    }
    const name = splitInsuredName(emp.full_name);
    if (!name.firstName) {
      errors.push({
        employeeCode: emp.employee_code,
        fullName: emp.full_name,
        reason: "ชื่อผู้ประกันตนว่างเปล่า",
      });
      continue;
    }
    rows.push({
      taxId: (emp.tax_id || "").replace(/\D/g, ""),
      title: name.title,
      firstName: name.firstName,
      lastName: name.lastName,
      wage: row.gross_pay,
      // Whole baht only: e-filing cells must hold integers, not display-rounded floats.
      contribution: Math.round(row.sso_employee),
    });
  }

  return { rows, errors, skippedInactive, skippedContract, skippedOver60 };
}

export type SsoMovementDirection = "joiners" | "leavers";

export interface SsoMovementRow {
  employeeCode: string;
  title: string;
  firstName: string;
  lastName: string;
  taxId: string;
  position: string;
  /** Hire date (joiners) or exit date (leavers), ISO YYYY-MM-DD. */
  eventDate: string;
  /** Filing deadline, ISO: hire +30d (สปส.1-03) or 15th of next month (สปส.6-09). */
  deadline: string;
}

export interface SsoMovementBuild {
  rows: SsoMovementRow[];
  errors: SsoRowError[];
  skippedDaily: number;
  skippedContract: number;
  skippedOver60: number;
}

/** Add whole days in UTC (avoids TZ drift on ISO dates). */
function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 15th of the month following the given ISO date. */
function fifteenthOfNextMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0-based: +1 rolls to next month
  const ny = m === 11 ? y + 1 : y;
  const nm = m === 11 ? 0 : m + 1;
  return `${ny}-${String(nm + 1).padStart(2, "0")}-15`;
}

/** Buddhist-era display for handover readability: 01/08/2569. */
export function formatBuddhistShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear() + 543}`;
}

function toMovementRow(
  emp: Employee,
  eventDate: string,
  deadline: string,
  errors: SsoRowError[],
): SsoMovementRow | null {
  if (!isValidThaiId(emp.tax_id)) {
    errors.push({
      employeeCode: emp.employee_code,
      fullName: emp.full_name,
      reason: "เลขประจำตัวประชาชนไม่ถูกต้อง (ต้องมี 13 หลัก)",
    });
    return null;
  }
  const name = splitInsuredName(emp.full_name);
  if (!name.firstName) {
    errors.push({
      employeeCode: emp.employee_code,
      fullName: emp.full_name,
      reason: "ชื่อผู้ประกันตนว่างเปล่า",
    });
    return null;
  }
  return {
    employeeCode: emp.employee_code,
    title: name.title,
    firstName: name.firstName,
    lastName: name.lastName,
    taxId: (emp.tax_id || "").replace(/\D/g, ""),
    position: emp.position || "—",
    eventDate,
    deadline,
  };
}

/**
 * Monthly in/out movement for SSO registration reference (สปส.1-03 joiners,
 * สปส.6-09 leavers). Monthly staff only (business choice — the roster wage
 * exclusion does not apply here, registration is pay-type agnostic, but the
 * client files daily staff through a separate practice).
 * Sorted by event date, then employee code.
 */
export function buildSsoMovementRows(
  employees: Employee[],
  year: number,
  month: number,
  direction: SsoMovementDirection,
): SsoMovementBuild {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
  const rows: SsoMovementRow[] = [];
  const errors: SsoRowError[] = [];
  let skippedDaily = 0;
  let skippedContract = 0;
  let skippedOver60 = 0;

  for (const emp of employees) {
    const eventDate = direction === "joiners" ? emp.start_date : (emp.end_date ?? "");
    if (!eventDate || eventDate < start || eventDate > end) continue;
    if (emp.salary_type !== "monthly") {
      skippedDaily += 1;
      continue;
    }
    if (emp.sso_registered === false) {
      skippedContract += 1;
      continue;
    }
    if (!isSsoCovered(emp)) {
      skippedOver60 += 1;
      continue;
    }
    const deadline =
      direction === "joiners" ? addDaysISO(eventDate, 30) : fifteenthOfNextMonth(eventDate);
    const row = toMovementRow(emp, eventDate, deadline, errors);
    if (row) rows.push(row);
  }

  rows.sort((a, b) =>
    a.eventDate === b.eventDate
      ? a.employeeCode.localeCompare(b.employeeCode)
      : a.eventDate < b.eventDate
        ? -1
        : 1,
  );
  return { rows, errors, skippedDaily, skippedContract, skippedOver60 };
}

export const SSO_MOVEMENT_HEADERS_JOINERS = [
  "ลำดับ",
  "รหัสพนักงาน",
  "คำนำหน้า",
  "ชื่อ",
  "นามสกุล",
  "เลขบัตรประชาชน",
  "ตำแหน่ง",
  "ประเภทการจ้าง",
  "วันที่เข้าทำงาน",
  "กำหนดยื่นภายใน (สปส.1-03)",
];

export const SSO_MOVEMENT_HEADERS_LEAVERS = [
  "ลำดับ",
  "รหัสพนักงาน",
  "คำนำหน้า",
  "ชื่อ",
  "นามสกุล",
  "เลขบัตรประชาชน",
  "ตำแหน่ง",
  "ประเภทการจ้าง",
  "วันที่ออก",
  "กำหนดยื่นภายใน (สปส.6-09)",
];

/**
 * Single-sheet handover workbook: title block (form reference + month) then
 * one flat table. IDs and dates are text (leading zeros, Buddhist year).
 */
export function buildSsoMovementWorkbook(
  rows: SsoMovementRow[],
  opts: {
    direction: SsoMovementDirection;
    year: number;
    month: number;
    companyName?: string | null;
  },
): ExcelJS.Workbook {
  const { direction, year, month } = opts;
  const isJoiners = direction === "joiners";
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(isJoiners ? "เข้าใหม่" : "ลาออก");
  ws.columns = [6, 14, 10, 20, 20, 20, 18, 12, 14, 20].map((width) => ({ width }));

  const title = isJoiners
    ? "บัญชีรายชื่อผู้ประกันตนเข้าใหม่ — เพื่อประกอบแบบ สปส.1-03"
    : "บัญชีรายชื่อผู้ประกันตนลาออก — เพื่อประกอบแบบ สปส.6-09";
  const titleRow = ws.addRow([title]);
  titleRow.font = { bold: true, size: 12 };
  const subRow = ws.addRow([
    `${opts.companyName?.trim() ? `${opts.companyName.trim()} · ` : ""}ประจำเดือน ${month}/${year + 543} · จำนวน ${rows.length} คน`,
  ]);
  subRow.font = { size: 10, color: { argb: "FF6B6B6B" } };
  ws.addRow([]);

  const headers = isJoiners ? SSO_MOVEMENT_HEADERS_JOINERS : SSO_MOVEMENT_HEADERS_LEAVERS;
  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  rows.forEach((row, i) => {
    const excelRow = ws.addRow([
      i + 1,
      row.employeeCode,
      row.title,
      row.firstName,
      row.lastName,
      "",
      row.position,
      "รายเดือน",
      "",
      "",
    ]);
    excelRow.getCell(6).value = { richText: [{ text: row.taxId }] };
    excelRow.getCell(9).value = formatBuddhistShort(row.eventDate);
    excelRow.getCell(10).value = formatBuddhistShort(row.deadline);
  });

  return wb;
}

export interface Sso110Row extends SsoFilingRow {
  employeeCode: string;
  employerContribution: number;
}

export interface Sso110Build {
  rows: Sso110Row[];
  errors: SsoRowError[];
  skippedContract: number;
  skippedOver60: number;
  skippedZeroWage: number;
}

export const SSO110_HEADERS = ["ลำดับที่", ...SSO_HEADERS];

/**
 * สปส.1-10 Part 2 rows on the roster template layout: everyone with
 * month-aggregated insurable wage — including mid-month leavers and daily
 * staff. Only contractors and over-60-at-hire are excluded (never insured).
 * Blocking errors mirror the roster (bad ID / empty name halt the file).
 * Sorted by employee code.
 */
export function buildSso110Rows(
  employees: Employee[],
  obligations: Map<string, { insurable: number; sso_employee: number; sso_employer: number }>,
): Sso110Build {
  const rows: Sso110Row[] = [];
  const errors: SsoRowError[] = [];
  let skippedContract = 0;
  let skippedOver60 = 0;
  let skippedZeroWage = 0;

  for (const emp of employees) {
    if (emp.sso_registered === false) {
      skippedContract += 1;
      continue;
    }
    if (!isSsoCovered(emp)) {
      skippedOver60 += 1;
      continue;
    }
    const obligation = obligations.get(emp.id);
    const insurable = Math.max(0, Number(obligation?.insurable) || 0);
    if (insurable <= 0) {
      skippedZeroWage += 1;
      continue;
    }
    if (!isValidThaiId(emp.tax_id)) {
      errors.push({
        employeeCode: emp.employee_code,
        fullName: emp.full_name,
        reason: "เลขประจำตัวประชาชนไม่ถูกต้อง (ต้องมี 13 หลัก)",
      });
      continue;
    }
    const name = splitInsuredName(emp.full_name);
    if (!name.firstName) {
      errors.push({
        employeeCode: emp.employee_code,
        fullName: emp.full_name,
        reason: "ชื่อผู้ประกันตนว่างเปล่า",
      });
      continue;
    }
    rows.push({
      employeeCode: emp.employee_code,
      taxId: (emp.tax_id || "").replace(/\D/g, ""),
      title: name.title,
      firstName: name.firstName,
      lastName: name.lastName,
      wage: Math.round(insurable),
      // Whole baht only: e-filing cells must hold integers.
      contribution: Math.round(Number(obligation?.sso_employee) || 0),
      employerContribution: Math.round(Number(obligation?.sso_employer) || 0),
    });
  }

  rows.sort((a, b) => a.taxId.localeCompare(b.taxId));
  return { rows, errors, skippedContract, skippedOver60, skippedZeroWage };
}

export interface Sso110Meta {
  companyName?: string | null;
  ssoAccountNo?: string | null;
  ssoBranchNo?: string | null;
  year: number;
  month: number;
  /** Honesty line for anytime exports, e.g. names of included draft rounds. */
  scopeNote?: string | null;
}

/**
 * สปส.1-10 handover workbook on the roster template: title block (form
 * reference + employer + contribution month), the familiar 6-column table
 * with a ลำดับที่ column, and a รวม footer (headcount, wages, both
 * contributions). Single sheet named by branch (head office 000000).
 */
export function buildSso110Workbook(rows: Sso110Row[], meta: Sso110Meta): ExcelJS.Workbook {
  const branch = (meta.ssoBranchNo ?? "").trim() || "000000";
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(branch);
  ws.columns = [8, 18, 12, 20, 20, 14, 16].map((width) => ({ width }));

  const titleRow = ws.addRow(["แบบรายการแสดงการส่งเงินสมทบ สปส.1-10 (ส่วนที่ 2)"]);
  titleRow.font = { bold: true, size: 12 };
  const account = (meta.ssoAccountNo ?? "").trim();
  ws.addRow([
    `${meta.companyName?.trim() ? `${meta.companyName.trim()} · ` : ""}เลขที่บัญชี ${account || "—"} · ลำดับที่สาขา ${branch}`,
  ]).font = { size: 10, color: { argb: "FF6B6B6B" } };
  ws.addRow([
    `สำหรับค่าจ้างเดือน ${meta.month}/${meta.year + 543} · จำนวน ${rows.length} คน`,
  ]).font = {
    size: 10,
    color: { argb: "FF6B6B6B" },
  };
  if (meta.scopeNote?.trim()) {
    ws.addRow([meta.scopeNote.trim()]).font = { size: 10, color: { argb: "FF6B6B6B" } };
  }
  ws.addRow([]);

  const headerRow = ws.addRow(SSO110_HEADERS);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  let totalWage = 0;
  let totalEmployee = 0;
  let totalEmployer = 0;
  rows.forEach((row, i) => {
    const excelRow = ws.addRow([i + 1, "", "", "", "", 0, 0]);
    excelRow.getCell(2).value = { richText: [{ text: row.taxId }] };
    excelRow.getCell(3).value = row.title;
    excelRow.getCell(4).value = row.firstName;
    excelRow.getCell(5).value = row.lastName;
    excelRow.getCell(6).value = row.wage;
    excelRow.getCell(6).numFmt = "#,##0";
    excelRow.getCell(7).value = row.contribution;
    excelRow.getCell(7).numFmt = "#,##0";
    totalWage += row.wage;
    totalEmployee += row.contribution;
    totalEmployer += row.employerContribution;
  });

  const totalRow = ws.addRow(["", "", "", "", "รวม", totalWage, totalEmployee]);
  totalRow.font = { bold: true, size: 10 };
  totalRow.getCell(6).numFmt = "#,##0";
  totalRow.getCell(7).numFmt = "#,##0";
  ws.addRow(["", "", "", "", "เงินสมทบนายจ้าง", totalEmployer, ""]).font = {
    size: 10,
    color: { argb: "FF6B6B6B" },
  };

  return wb;
}

/** Filing workbook in the SSO e-filing layout. IDs are text (keep leading zeros). */
export function buildSsoWorkbook(rows: SsoFilingRow[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(SSO_SHEET_NAME);
  ws.columns = [
    { width: 18 },
    { width: 12 },
    { width: 20 },
    { width: 20 },
    { width: 12 },
    { width: 14 },
  ];

  const headerRow = ws.addRow(SSO_HEADERS);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  for (const row of rows) {
    const excelRow = ws.addRow(["", "", "", "", 0, 0]);
    excelRow.getCell(1).value = { richText: [{ text: row.taxId }] };
    excelRow.getCell(2).value = row.title;
    excelRow.getCell(3).value = row.firstName;
    excelRow.getCell(4).value = row.lastName;
    excelRow.getCell(5).value = row.wage;
    excelRow.getCell(5).numFmt = "#,##0";
    excelRow.getCell(6).value = row.contribution;
    excelRow.getCell(6).numFmt = "#,##0";
  }

  return wb;
}
