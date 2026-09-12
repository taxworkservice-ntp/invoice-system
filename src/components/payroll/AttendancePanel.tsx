import { useMemo, useState } from "react";
import { CalendarClock, Upload, AlertCircle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { Button } from "../ui/Button";
import {
  parseAttendanceCsv,
  summarizeAttendance,
  summaryToPayrollInput,
  describeOtWindow,
  type AttendanceSummary,
} from "../../lib/payroll/attendance";
import type { Employee } from "../../types";

interface AttendancePanelProps {
  employees: Employee[];
  run: { period_start: string; period_end: string; ot_start?: string | null; ot_end?: string | null } | null;
  paidLeaveDaysPerYear?: number | null;
  disabled?: boolean;
  onApply: (updates: { employee_id: string; days_worked: number | null; absent_days: number }[]) => Promise<void>;
}

const SAMPLE = `employee_code,date,status,hours
EMP001,2026-09-01,มา,8
EMP001,2026-09-02,ขาด,
EMP002,2026-09-01,ลา,`;

export function AttendancePanel({ employees, run, paidLeaveDaysPerYear, disabled, onApply }: AttendancePanelProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [parsed, setParsed] = useState<AttendanceSummary[]>([]);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const codeToEmployee = useMemo(() => {
    const m = new Map<string, Employee>();
    for (const e of employees) m.set(e.employee_code.trim().toUpperCase(), e);
    return m;
  }, [employees]);

  function handleParse() {
    const { days, errors: errs } = parseAttendanceCsv(text);
    setErrors(errs);
    const map = summarizeAttendance(days);
    setParsed([...map.values()].sort((a, b) => a.employee_code.localeCompare(b.employee_code)));
    setApplied(false);
  }

  function handleFillSample() {
    setText(SAMPLE);
    setErrors([]);
    setParsed([]);
    setApplied(false);
  }

  const unknownCodes = parsed.filter((s) => !codeToEmployee.has(s.employee_code));
  const knownSummaries = parsed.filter((s) => codeToEmployee.has(s.employee_code));

  // Paid-leave heuristic: distribute yearly quota across 12 months for the import.
  const paidLeavePerMonth = Math.max(0, Math.floor((paidLeaveDaysPerYear ?? 0) / 12));

  async function handleApply() {
    if (knownSummaries.length === 0 || applying) return;
    setApplying(true);
    const updates = knownSummaries.map((s) => {
      const emp = codeToEmployee.get(s.employee_code)!;
      const mapped = summaryToPayrollInput(s, emp.salary_type, { paidLeaveDays: paidLeavePerMonth });
      return { employee_id: emp.id, ...mapped };
    });
    await onApply(updates);
    setApplying(false);
    setApplied(true);
  }

  return (
    <details
      className="bg-white border border-card-border rounded-card px-4 py-3"
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="flex items-center gap-2 text-cool-700 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <CalendarClock className="w-4 h-4 text-cool-400" />
        <span className="text-sm font-medium">เวลา & การลา — นำเข้าจากไฟล์ตอกบัตร</span>
        <span className="ml-auto text-[11px] text-cool-400">
          {run ? describeOtWindow(run.period_start, run.period_end, run.ot_start, run.ot_end) : "เลือกรอบก่อน"}
        </span>
      </summary>

      {open && (
        <div className="pt-3 space-y-3">
          <p className="text-xs text-cool-500">
            วางข้อมูล CSV จากเครื่องสแกน/Excel (รหัส, วันที่ ปปปป-ดด-วว, สถานะ มา/ขาด/ลา/หยุด, ชั่วโมง)
            ระบบจะสรุปวันทำงาน–วันขาดให้อัตโนมัติ แล้วกรอกลงแถวเงินเดือนแต่ละคน —
            พนักงานรายวันใช้วันมาทำงานคูณอัตรารายวัน, รายเดือนหักวันขาดตามฐานคำนวณที่ตั้งไว้
          </p>

          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setApplied(false); }}
            placeholder="วาง CSV ที่นี่…"
            rows={5}
            disabled={disabled}
            className="w-full text-xs font-mono rounded-lg border border-card-border bg-cool-25/50 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
          />

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={handleFillSample} disabled={disabled} className="!text-xs !rounded-lg">
              <FileSpreadsheet className="w-3.5 h-3.5" /> ตัวอย่าง
            </Button>
            <Button size="sm" variant="secondary" onClick={handleParse} disabled={disabled || !text.trim()} className="!text-xs !rounded-lg">
              ตรวจสอบข้อมูล
            </Button>
            {knownSummaries.length > 0 && (
              <Button size="sm" onClick={handleApply} disabled={disabled || applying} className="!text-xs !rounded-lg">
                <Upload className="w-3.5 h-3.5" />
                {applying ? "กำลังกรอก…" : `กรอกลงเงินเดือน ${knownSummaries.length} คน`}
              </Button>
            )}
          </div>

          {errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 space-y-0.5">
              {errors.map((e, i) => (
                <p key={i} className="flex items-start gap-1.5 text-xs text-red-700">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {e}
                </p>
              ))}
            </div>
          )}

          {parsed.length > 0 && (
            <div className="rounded-lg border border-card-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-cool-50 text-cool-500">
                    <th className="px-2.5 py-1.5 text-left font-medium">รหัส</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">มา</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">ขาด</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">ลา</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">OT แนะนำ (ชม.)</th>
                    <th className="px-2.5 py-1.5 text-left font-medium">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {parsed.map((s) => {
                    const known = codeToEmployee.has(s.employee_code);
                    return (
                      <tr key={s.employee_code} className={known ? "" : "bg-amber-50/50"}>
                        <td className="px-2.5 py-1.5 font-mono text-[11px] text-cool-900">{s.employee_code}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{s.present_days}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{s.absent_days}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{s.leave_days}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{s.suggested_ot_hours || "—"}</td>
                        <td className="px-2.5 py-1.5">
                          {known ? (
                            <span className="text-green-700">พร้อมกรอก</span>
                          ) : (
                            <span className="text-amber-700">ไม่พบรหัสในระบบ</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {unknownCodes.length > 0 && (
            <p className="text-[11px] text-amber-700">
              มี {unknownCodes.length} รหัสที่ไม่ตรงกับพนักงานในระบบ — จะถูกข้ามตอนกรอก
            </p>
          )}

          {applied && (
            <p className="flex items-center gap-1.5 text-xs text-green-700">
              <CheckCircle2 className="w-3.5 h-3.5" /> กรอกข้อมูลเวลาเรียบร้อย — ตรวจสอบยอดในตารางแล้วกดบันทึกแต่ละแถว
            </p>
          )}
        </div>
      )}
    </details>
  );
}
