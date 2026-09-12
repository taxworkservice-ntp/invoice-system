// Professional time & leave helpers for the accountant-portal payroll.
// HumanSoft-inspired, but scoped to our niche: no hardware clock-in,
// no full HRMS — just a clean bridge from raw attendance (manual/CSV import)
// into the existing days_worked / absent_days / OT calculation path.
//
// All functions are pure (no Supabase) so they are unit-testable in isolation.

export type AttendanceStatus = "present" | "absent" | "leave" | "holiday" | "off";

export interface AttendanceDay {
  employee_code: string;
  date: string; // ISO YYYY-MM-DD
  status: AttendanceStatus;
  /** Optional worked hours for the day (drives OT suggestion, not base pay). */
  hours?: number | null;
  note?: string | null;
}

export interface AttendanceSummary {
  employee_code: string;
  present_days: number;
  absent_days: number;
  leave_days: number;
  holiday_days: number;
  /** Sum of hours beyond 8h/day across present days — suggested OT hours. */
  suggested_ot_hours: number;
}

export interface LeaveQuota {
  type: string;
  quota_days: number;
}

export interface LeaveBalance extends LeaveQuota {
  used_days: number;
  remaining_days: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function normalizeStatus(raw: string): AttendanceStatus | null {
  const v = raw.trim().toLowerCase();
  if (["present", "p", "มา", "มาทำงาน", "1"].includes(v)) return "present";
  if (["absent", "a", "ขาด", "ขาดงาน", "0"].includes(v)) return "absent";
  if (["leave", "l", "ลา", "ลางาน"].includes(v)) return "leave";
  if (["holiday", "h", "หยุด", "วันหยุด"].includes(v)) return "holiday";
  if (["off", "o", "หยุดประจำสัปดาห์"].includes(v)) return "off";
  return null;
}

/**
 * Parse pasted CSV / tab-separated attendance rows.
 * Accepted header (optional): employee_code,date,status[,hours[,note]]
 * Date must be ISO YYYY-MM-DD. Status accepts Thai + EN shorthands.
 * Returns parsed days + human-readable line errors (1-based, Thai messages).
 */
export function parseAttendanceCsv(text: string): { days: AttendanceDay[]; errors: string[] } {
  const days: AttendanceDay[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { days, errors: ["ไม่มีข้อมูล — วางข้อมูล CSV ก่อนกดนำเข้า"] };

  let start = 0;
  const first = lines[0].toLowerCase();
  if (first.includes("employee") || first.includes("รหัส") || first.includes("code")) start = 1;

  lines.slice(start).forEach((line, idx) => {
    const lineNo = idx + start + 1;
    const parts = line.split(/[,;\t]/).map((p) => p.trim());
    if (parts.length < 3) {
      errors.push(`บรรทัด ${lineNo}: ต้องมีอย่างน้อย รหัส, วันที่, สถานะ`);
      return;
    }
    const [codeRaw, dateRaw, statusRaw, hoursRaw, ...noteRest] = parts;
    if (!codeRaw) {
      errors.push(`บรรทัด ${lineNo}: ไม่มีรหัสพนักงาน`);
      return;
    }
    if (!ISO_DATE.test(dateRaw)) {
      errors.push(`บรรทัด ${lineNo}: วันที่ต้องเป็น ปปปป-ดด-วว (${dateRaw || "ว่าง"})`);
      return;
    }
    const status = normalizeStatus(statusRaw);
    if (!status) {
      errors.push(`บรรทัด ${lineNo}: สถานะไม่ถูกต้อง (${statusRaw || "ว่าง"} — ใช้ มา/ขาด/ลา/หยุด)`);
      return;
    }
    let hours: number | null = null;
    if (hoursRaw !== undefined && hoursRaw !== "") {
      const h = Number(hoursRaw);
      if (!Number.isFinite(h) || h < 0 || h > 24) {
        errors.push(`บรรทัด ${lineNo}: ชั่วโมงต้องอยู่ระหว่าง 0–24`);
        return;
      }
      hours = h;
    }
    days.push({
      employee_code: normalizeCode(codeRaw),
      date: dateRaw,
      status,
      hours,
      note: noteRest.join(",").trim() || null,
    });
  });

  return { days, errors };
}

/** Summarize attendance days per employee code (case-insensitive). */
export function summarizeAttendance(days: AttendanceDay[]): Map<string, AttendanceSummary> {
  const map = new Map<string, AttendanceSummary>();
  for (const d of days) {
    const code = normalizeCode(d.employee_code);
    let s = map.get(code);
    if (!s) {
      s = { employee_code: code, present_days: 0, absent_days: 0, leave_days: 0, holiday_days: 0, suggested_ot_hours: 0 };
      map.set(code, s);
    }
    switch (d.status) {
      case "present": s.present_days += 1; break;
      case "absent": s.absent_days += 1; break;
      case "leave": s.leave_days += 1; break;
      case "holiday": case "off": s.holiday_days += 1; break;
    }
    const extra = (Number(d.hours) || 0) - 8;
    if (d.status === "present" && extra > 0) s.suggested_ot_hours += extra;
  }
  // Round OT suggestion to 1 decimal to avoid float noise.
  for (const s of map.values()) s.suggested_ot_hours = Math.round(s.suggested_ot_hours * 10) / 10;
  return map;
}

/**
 * Map an attendance summary onto existing payroll line-item inputs.
 * - Daily staff: days_worked = present days (base pay driver).
 * - Monthly staff: absent_days = absent + unpaid-leave days (paid leave excluded).
 * - Leave days split by caller into paid vs unpaid; default treats all leave as absent
 *   unless paidLeaveDays is provided.
 */
export function summaryToPayrollInput(
  summary: AttendanceSummary,
  salaryType: "monthly" | "daily",
  opts?: { paidLeaveDays?: number },
): { days_worked: number | null; absent_days: number } {
  if (salaryType === "daily") {
    return { days_worked: summary.present_days, absent_days: 0 };
  }
  const paid = Math.max(0, Math.min(summary.leave_days, opts?.paidLeaveDays ?? 0));
  const unpaidLeave = summary.leave_days - paid;
  return { days_worked: null, absent_days: summary.absent_days + unpaidLeave };
}

/** Leave balance math — pure, shared by UI chips and future DB-backed quotas. */
export function computeLeaveBalances(
  quotas: LeaveQuota[],
  usedByType: Record<string, number>,
): LeaveBalance[] {
  return quotas.map((q) => {
    const used = Math.max(0, Number(usedByType[q.type]) || 0);
    return { ...q, used_days: used, remaining_days: Math.max(0, q.quota_days - used) };
  });
}

export const DEFAULT_LEAVE_QUOTAS: LeaveQuota[] = [
  { type: "ลาป่วย", quota_days: 30 },
  { type: "ลากิจ", quota_days: 6 },
  { type: "ลาพักร้อน", quota_days: 6 },
];

/**
 * OT cut-off window (HumanSoft "งวดโอที"): OT is earned in [otStart..otEnd]
 * which may differ from the salary period. Returns Thai helper text for the UI.
 */
export function describeOtWindow(salaryStart: string, salaryEnd: string, otStart?: string | null, otEnd?: string | null): string {
  if (!otStart || !otEnd) return `OT ตามรอบเงินเดือน ${salaryStart} → ${salaryEnd}`;
  if (otStart === salaryStart && otEnd === salaryEnd) return `OT ตรงกับรอบเงินเดือน (${salaryStart} → ${salaryEnd})`;
  return `OT แยกตัดรอบ ${otStart} → ${otEnd} (เงินเดือน ${salaryStart} → ${salaryEnd})`;
}

/** Suggest an OT cut-off window ending `cutoffDay` days before salary period end. */
export function suggestOtWindow(salaryStart: string, salaryEnd: string, cutoffDay: number): { ot_start: string; ot_end: string } {
  const end = new Date(`${salaryEnd}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - Math.max(0, Math.min(28, Math.floor(cutoffDay) || 0)));
  const otEnd = end.toISOString().slice(0, 10);
  return { ot_start: salaryStart <= otEnd ? salaryStart : otEnd, ot_end: otEnd >= salaryStart ? otEnd : salaryStart };
}
