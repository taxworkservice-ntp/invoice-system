import { useState } from "react";
import { useToast } from "../../../hooks/useToast";
import { logAuditEvent, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../../lib/payroll/audit";
import {
  buildAdminCalcRows,
  fetchAdminMonthBundle,
  type AdminMonthBundle,
} from "../../../lib/adminPayrollExport";
import { buildRunSummaryWorkbook, workbookToBlob } from "../../../lib/payroll/reportXlsx";
import {
  buildSso110Rows,
  buildSso110Workbook,
  buildSsoMovementRows,
  buildSsoMovementWorkbook,
  buildSsoRosterRows,
  buildSsoRows,
  buildSsoWorkbook,
} from "../../../lib/payroll/ssoExport";
import { downloadBlob, sanitizeFilenamePart } from "../../../lib/download/download";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Select } from "../../ui/Input";
import { SectionHeader } from "./shared";

const REPORT_MONTHS = [
  { value: 1, label: "มกราคม" },
  { value: 2, label: "กุมภาพันธ์" },
  { value: 3, label: "มีนาคม" },
  { value: 4, label: "เมษายน" },
  { value: 5, label: "พฤษภาคม" },
  { value: 6, label: "มิถุนายน" },
  { value: 7, label: "กรกฎาคม" },
  { value: 8, label: "สิงหาคม" },
  { value: 9, label: "กันยายน" },
  { value: 10, label: "ตุลาคม" },
  { value: 11, label: "พฤศจิกายน" },
  { value: 12, label: "ธันวาคม" },
];

type ReportId = "sso110" | "joiners" | "leavers" | "roster" | "summary";

const REPORTS: { id: ReportId; label: string; hint: string }[] = [
  { id: "sso110", label: "สปส.1-10 รายเดือน", hint: "ค่าจ้าง + เงินสมทบรวมทั้งเดือน" },
  { id: "joiners", label: "เข้าใหม่ประจำเดือน (สปส.1-03)", hint: "พร้อมกำหนดยื่นภายใน 30 วัน" },
  { id: "leavers", label: "ลาออกประจำเดือน (สปส.6-09)", hint: "พร้อมกำหนดยื่นภายในวันที่ 15" },
  { id: "roster", label: "รายชื่อประกันสังคม", hint: "ค่าจ้าง + เงินสมทบทุกคน" },
  { id: "summary", label: "สรุปเงินเดือน", hint: "แยกรายรอบ รวมรอบร่างด้วย" },
];

/**
 * Admin export center: downloads for one client's statutory month.
 * Always-anytime semantics — finalized rounds at stored numbers, drafts at
 * their currently saved working values. Every download is audit-logged.
 */
export function ReportsTab({ clientId }: { clientId: string | undefined }) {
  const toast = useToast();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [busy, setBusy] = useState<ReportId | null>(null);

  function slug(bundle: AdminMonthBundle): string {
    const name = bundle.profile?.company_name_th?.trim() || "client";
    return sanitizeFilenamePart(name);
  }

  function ym(): string {
    return `${year}-${String(month).padStart(2, "0")}`;
  }

  function audit(report: string, draftLabels: string[]) {
    if (!clientId) return;
    void logAuditEvent({
      action: AUDIT_ACTIONS.PAYROLL_EXPORTED,
      entity_type: AUDIT_ENTITY_TYPES.CLIENT_PROFILE,
      entity_id: clientId,
      details: { report, month: ym(), draft_rounds: draftLabels, exported_by: "admin" },
    });
  }

  function blockedError(built: {
    errors: { employeeCode: string; fullName: string; reason: string }[];
  }): boolean {
    if (built.errors.length === 0) return false;
    const names = built.errors
      .slice(0, 3)
      .map((e) => `${e.employeeCode} ${e.fullName}`.trim())
      .join(", ");
    const more = built.errors.length > 3 ? ` และอีก ${built.errors.length - 3} คน` : "";
    toast.error(`ส่งออกไม่ได้: ${names}${more} — ${built.errors[0].reason}`);
    return true;
  }

  async function withBundle<T>(
    report: ReportId,
    fn: (bundle: AdminMonthBundle) => Promise<T>,
  ): Promise<T | null> {
    if (!clientId || busy) return null;
    setBusy(report);
    try {
      return await fn(await fetchAdminMonthBundle(clientId, year, month));
    } catch (error: any) {
      toast.error(error?.message || "ส่งออกไม่สำเร็จ");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function handleSso110() {
    await withBundle("sso110", async (bundle) => {
      if (!bundle.monthData) {
        toast.error("เดือนนี้ไม่มีรอบเงินเดือน");
        return;
      }
      const built = buildSso110Rows(bundle.employees, bundle.monthData.owed);
      if (blockedError(built)) return;
      if (built.rows.length === 0) {
        toast.error("เดือนนี้ไม่มีพนักงานที่ต้องยื่นประกันสังคม");
        return;
      }
      const wb = buildSso110Workbook(built.rows, {
        companyName: bundle.profile?.company_name_th ?? null,
        ssoAccountNo: bundle.profile?.sso_account_no ?? null,
        ssoBranchNo: bundle.profile?.sso_branch_no ?? null,
        year,
        month,
        scopeNote:
          bundle.draftLabels.length > 0 ? `รวมรอบร่าง: ${bundle.draftLabels.join(" · ")}` : null,
      });
      downloadBlob(await workbookToBlob(wb), `sso-1-10-${ym()}-${slug(bundle)}.xlsx`);
      const skips: string[] = [];
      if (built.skippedContract > 0) skips.push(`ภ.ง.ด.3 ${built.skippedContract}`);
      if (built.skippedOver60 > 0) skips.push(`เกิน 60 ตอนเข้างาน ${built.skippedOver60}`);
      if (built.skippedZeroWage > 0) skips.push(`ไม่มีค่าจ้าง ${built.skippedZeroWage}`);
      toast.success(
        `ส่งออก สปส.1-10 ${built.rows.length} คน${skips.length > 0 ? ` (ข้าม: ${skips.join(" · ")})` : ""}`,
      );
      audit("sso110", bundle.draftLabels);
    });
  }

  async function handleMovement(direction: "joiners" | "leavers") {
    await withBundle(direction, async (bundle) => {
      const isJoiners = direction === "joiners";
      const built = buildSsoMovementRows(bundle.employees, year, month, direction);
      if (blockedError(built)) return;
      if (built.rows.length === 0) {
        toast.error(isJoiners ? "เดือนนี้ไม่มีพนักงานเข้าใหม่" : "เดือนนี้ไม่มีพนักงานลาออก");
        return;
      }
      const wb = buildSsoMovementWorkbook(built.rows, { direction, year, month });
      downloadBlob(
        await workbookToBlob(wb),
        `sso-${isJoiners ? "joiners" : "leavers"}-${ym()}-${slug(bundle)}.xlsx`,
      );
      const skips: string[] = [];
      if (built.skippedDaily > 0) skips.push(`รายวัน ${built.skippedDaily}`);
      if (built.skippedContract > 0) skips.push(`ภ.ง.ด.3 ${built.skippedContract}`);
      if (built.skippedOver60 > 0) skips.push(`เกิน 60 ตอนเข้างาน ${built.skippedOver60}`);
      toast.success(
        `ส่งออกบัญชี${isJoiners ? "เข้าใหม่" : "ลาออก"} ${built.rows.length} คน${skips.length > 0 ? ` (ข้าม: ${skips.join(" · ")})` : ""}`,
      );
      audit(direction, bundle.draftLabels);
    });
  }

  async function handleRoster() {
    await withBundle("roster", async (bundle) => {
      const roster = buildSsoRosterRows(bundle.employees);
      if (roster.skippedDaily.length > 0) {
        const names = roster.skippedDaily
          .slice(0, 3)
          .map((e) => `${e.employee_code} ${e.full_name}`.trim())
          .join(", ");
        const more =
          roster.skippedDaily.length > 3 ? ` และอีก ${roster.skippedDaily.length - 3} คน` : "";
        toast.error(
          `ส่งออกไม่ได้: พนักงานรายวัน ${names}${more} ต้องส่งออกจากรอบเงินเดือน (ค่าจ้างตามวันทำงานจริง)`,
        );
        return;
      }
      const built = buildSsoRows(roster.rows);
      if (blockedError(built)) return;
      if (built.rows.length === 0) {
        toast.error("ไม่มีพนักงานประกันสังคม");
        return;
      }
      downloadBlob(
        await workbookToBlob(buildSsoWorkbook(built.rows)),
        `sso-roster-${ym()}-${slug(bundle)}.xlsx`,
      );
      const skips: string[] = [];
      if (built.skippedInactive > 0) skips.push(`ลาออก ${built.skippedInactive}`);
      if (built.skippedContract > 0) skips.push(`ภ.ง.ด.3 ${built.skippedContract}`);
      if (built.skippedOver60 > 0) skips.push(`เกิน 60 ตอนเข้างาน ${built.skippedOver60}`);
      toast.success(
        `ส่งออกประกันสังคม ${built.rows.length} คน${skips.length > 0 ? ` (ข้าม: ${skips.join(" · ")})` : ""}`,
      );
      audit("roster", bundle.draftLabels);
    });
  }

  async function handleSummary() {
    await withBundle("summary", async (bundle) => {
      if (bundle.runs.length === 0) {
        toast.error("เดือนนี้ไม่มีรอบเงินเดือน");
        return;
      }
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      let count = 0;
      for (const r of bundle.runs) {
        const rows = buildAdminCalcRows(bundle, r);
        const wb = buildRunSummaryWorkbook(r, rows);
        const blob = await workbookToBlob(wb);
        const label = r.label || `${r.period_start}_${r.period_end}`;
        zip.file(`payroll-summary-${ym()}-${sanitizeFilenamePart(label)}.xlsx`, blob);
        count += 1;
      }
      if (count === 1) {
        const first = Object.values(zip.files)[0];
        const blob = await first.async("blob");
        downloadBlob(blob, `payroll-summary-${ym()}-${slug(bundle)}.xlsx`);
      } else {
        downloadBlob(
          await zip.generateAsync({ type: "blob" }),
          `payroll-summary-${ym()}-${slug(bundle)}.zip`,
        );
      }
      toast.success(`ส่งออกสรุปเงินเดือน ${count} รอบ`);
      audit("summary", bundle.draftLabels);
    });
  }

  const handlers: Record<ReportId, () => void> = {
    sso110: () => void handleSso110(),
    joiners: () => void handleMovement("joiners"),
    leavers: () => void handleMovement("leavers"),
    roster: () => void handleRoster(),
    summary: () => void handleSummary(),
  };

  return (
    <div className="space-y-4">
      <div>
        <SectionHeader>รายงานลูกค้า</SectionHeader>
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-label text-ink-500">รอบรายงาน</span>
            <Select
              aria-label="เดือนรายงาน"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-[118px]"
            >
              {REPORT_MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="ปีรายงาน"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-[88px]"
            >
              {[year - 1, year, year + 1].map((y) => (
                <option key={y} value={y}>
                  {y + 543}
                </option>
              ))}
            </Select>
          </div>
          <p className="mt-2 text-label leading-5 text-ink-400">
            ส่งออกได้ทุกเมื่อตามค่าปัจจุบัน — รอบร่างรวมด้วยตามที่บันทึกไว้ล่าสุด
          </p>
          <div className="mt-3 space-y-2">
            {REPORTS.map((report) => (
              <div
                key={report.id}
                className="flex items-center justify-between gap-3 rounded-control border border-card-border bg-paper-tint px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="text-body font-medium text-ink-900">{report.label}</div>
                  <div className="text-label text-ink-400">{report.hint}</div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy !== null}
                  loading={busy === report.id}
                  onClick={handlers[report.id]}
                >
                  ดาวน์โหลด
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
