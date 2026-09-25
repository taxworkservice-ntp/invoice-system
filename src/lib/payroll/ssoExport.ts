import ExcelJS from "exceljs";
import type { Employee } from "../../types";
import type { PayrollCalcRow } from "./reportXlsx";

/**
 * SSO monthly contribution filing (สปส. 1-10 e-filing layout).
 *
 * Sheet "000000" (head office; branches file under their own number):
 *   เลขประจำตัวประชาชน | คำนำหน้าชื่อ | ชื่อผู้ประกันตน |
 *   นามสกุลผู้ประกันตน | ค่าจ้าง | จำนวนเงินสมทบ
 *
 * Only active, SSO-registered staff are filed. Wages come from the payroll
 * run's actual gross (not master salary) so daily staff, OT, and additions
 * are correct. Contributions reuse the run's computed sso_employee, which
 * already applies calculateSSO (5% over a 17,500 ceiling) + rounding.
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
      contribution: row.sso_employee,
    });
  }

  return { rows, errors, skippedInactive, skippedContract };
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
