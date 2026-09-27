import ExcelJS from "exceljs";
import type { Employee } from "../../types";
import { formatBuddhistShort } from "./ssoExport";

/**
 * HR employee report (รายงานพนักงาน) for the employee page export.
 *
 * One workbook, five sheets: everyone, SSO-registered, non-SSO, joiners and
 * leavers. Unlike the SSO filing exports this is headcount, not filing —
 * no one is excluded for age, pay type or contract status. Joiners/leavers
 * are scoped to the selected report month; the other three sheets always
 * reflect the current roster.
 */

export const EMPLOYEE_REPORT_HEADERS = [
  "ลำดับ",
  "รหัสพนักงาน",
  "ชื่อ-สกุล",
  "ตำแหน่ง",
  "แผนก",
  "ประเภทการจ้าง",
  "ฐานเงินเดือน",
  "เลขบัตรประชาชน",
  "วันเกิด",
  "ที่อยู่",
  "วันที่เข้า",
  "วันที่ออก",
  "เหตุผลที่ออก",
  "สถานะ",
  "ขึ้น SSO",
];

const RESIGN_LABELS: Record<string, string> = {
  resigned: "ลาออกเอง",
  contract_ended: "สิ้นสุดสัญญาจ้าง",
  terminated: "เลิกจ้าง",
  retired: "เกษียณอายุ",
  other: "อื่น ๆ",
};

export interface EmployeeReportBuild {
  all: Employee[];
  sso: Employee[];
  nonSso: Employee[];
  joiners: Employee[];
  leavers: Employee[];
}

function byCode(a: Employee, b: Employee): number {
  return a.employee_code.localeCompare(b.employee_code, "th");
}

export function buildEmployeeReportRows(
  employees: Employee[],
  year: number,
  month: number,
): EmployeeReportBuild {
  const mm = String(month).padStart(2, "0");
  const start = `${year}-${mm}-01`;
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${mm}-${String(endDay).padStart(2, "0")}`;

  const all = [...employees].sort(byCode);
  const active = all.filter((e) => e.status === "active");
  return {
    all,
    sso: active.filter((e) => e.sso_registered !== false),
    nonSso: active.filter((e) => e.sso_registered === false),
    joiners: all
      .filter((e) => e.start_date && e.start_date >= start && e.start_date <= end)
      .sort((a, b) =>
        a.start_date === b.start_date ? byCode(a, b) : a.start_date < b.start_date ? -1 : 1,
      ),
    leavers: all
      .filter((e) => e.end_date && e.end_date >= start && e.end_date <= end)
      .sort((a, b) =>
        (a.end_date ?? "") === (b.end_date ?? "")
          ? byCode(a, b)
          : (a.end_date ?? "") < (b.end_date ?? "")
            ? -1
            : 1,
      ),
  };
}

function toDisplay(iso: string | null | undefined): string {
  return iso ? formatBuddhistShort(iso) : "—";
}

function addEmployeeSheet(
  wb: ExcelJS.Workbook,
  name: string,
  title: string,
  rows: Employee[],
): void {
  const ws = wb.addWorksheet(name);
  ws.columns = [6, 14, 24, 18, 14, 12, 14, 20, 14, 30, 14, 14, 16, 14, 10].map((width) => ({
    width,
  }));

  const titleRow = ws.addRow([title]);
  titleRow.font = { bold: true, size: 12 };
  ws.addRow([]);

  const headerRow = ws.addRow(EMPLOYEE_REPORT_HEADERS);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  rows.forEach((emp, i) => {
    const taxId = (emp.tax_id ?? "").trim();
    const excelRow = ws.addRow([
      i + 1,
      emp.employee_code,
      emp.full_name,
      emp.position || "—",
      (emp.department ?? "").trim() || "—",
      emp.salary_type === "daily" ? "รายวัน" : "รายเดือน",
      Number(emp.base_salary) || 0,
      "",
      toDisplay(emp.date_of_birth),
      (emp.address ?? "").trim() || "—",
      toDisplay(emp.start_date),
      toDisplay(emp.end_date),
      emp.end_date ? RESIGN_LABELS[emp.resign_reason ?? ""] || "—" : "—",
      emp.status === "active" ? "กำลังทำงาน" : "ลาออกแล้ว",
      emp.sso_registered === false ? "ไม่ใช่" : "ใช่",
    ]);
    excelRow.getCell(7).numFmt = "#,##0";
    // Text cell: keeps leading zeros on IDs, shows — when missing.
    excelRow.getCell(8).value = taxId ? { richText: [{ text: taxId }] } : "—";
  });
}

/**
 * Five-sheet HR workbook. Joiners/leavers cover the report month; the rest
 * show the current roster.
 */
export function buildEmployeeReportWorkbook(
  built: EmployeeReportBuild,
  opts: { year: number; month: number; companyName?: string | null },
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const company = opts.companyName?.trim() ? `${opts.companyName.trim()} · ` : "";
  const monthLabel = `ประจำเดือน ${opts.month}/${opts.year + 543}`;

  addEmployeeSheet(
    wb,
    "ทั้งหมด",
    `${company}รายงานพนักงาน — ทั้งหมด · จำนวน ${built.all.length} คน`,
    built.all,
  );
  addEmployeeSheet(
    wb,
    "ประกันสังคม",
    `${company}รายงานพนักงาน — ประกันสังคม · จำนวน ${built.sso.length} คน`,
    built.sso,
  );
  addEmployeeSheet(
    wb,
    "ไม่ขึ้นประกันสังคม",
    `${company}รายงานพนักงาน — ไม่ขึ้นประกันสังคม · จำนวน ${built.nonSso.length} คน`,
    built.nonSso,
  );
  addEmployeeSheet(
    wb,
    "เข้าใหม่",
    `${company}รายงานพนักงาน — เข้าใหม่ ${monthLabel} · จำนวน ${built.joiners.length} คน`,
    built.joiners,
  );
  addEmployeeSheet(
    wb,
    "ลาออก",
    `${company}รายงานพนักงาน — ลาออก ${monthLabel} · จำนวน ${built.leavers.length} คน`,
    built.leavers,
  );

  return wb;
}
