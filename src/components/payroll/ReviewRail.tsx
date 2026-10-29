import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  History,
  Loader2,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { AmountRow } from "../ui/AmountRow";
import { Button } from "../ui/Button";
import { Money } from "../ui/Money";
import { SectionCard } from "../ui/SectionCard";
import { StatusBadge } from "../ui/StatusBadge";
import type { Employee, PayrollRun } from "../../types";
import { BatchBadge } from "./BatchBadge";
import { batchTypeOf } from "../../lib/payroll/schedule";

export interface ReviewTotals {
  base: number;
  ot: number;
  additions: number;
  deductions: number;
  gross: number;
  sso: number;
  ssoEmp: number;
  wht: number;
  net: number;
}

interface ReviewRailProps {
  run: PayrollRun | null;
  isOtRun: boolean;
  totals: ReviewTotals;
  employeesCount: number;
  completedCount: number;
  attentionEmployees: Employee[];
  untouchedCount: number;
  excludedEmployeeCount: number;
  otPeople: number;
  otHours: number;
  payDate: string;
  canFinalize: boolean;
  finalizeReason: string;
  whtExistingCount: number | null;
  syncingWht: boolean;
  onFinalize: () => void;
  onSyncWht: () => void;
  onGoWht: () => void;
  onOpenEmployee: (id: string) => void;
  onOpenHistory: () => void;
  onReopen: () => void;
  onExport: () => void;
}

function ReadinessLine({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  const Icon = ok ? CheckCircle2 : AlertCircle;
  return (
    <div className="flex items-center gap-2 text-label">
      <Icon
        className={`h-3.5 w-3.5 shrink-0 ${ok ? "text-success-text" : "text-warning-text"}`}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate text-ink-600">{label}</span>
      <span
        className={`shrink-0 font-medium tabular-nums ${ok ? "text-success-text" : "text-warning-text"}`}
      >
        {value}
      </span>
    </div>
  );
}

function hoursLabel(hours: number) {
  return `${(Math.round(hours * 10) / 10).toLocaleString("th-TH", {
    maximumFractionDigits: 1,
  })} ชม.`;
}

export function ReviewRail({
  run,
  isOtRun,
  totals,
  employeesCount,
  completedCount,
  attentionEmployees,
  untouchedCount,
  excludedEmployeeCount,
  otPeople,
  otHours,
  payDate,
  canFinalize,
  finalizeReason,
  whtExistingCount,
  syncingWht,
  onFinalize,
  onSyncWht,
  onGoWht,
  onOpenEmployee,
  onOpenHistory,
  onReopen,
  onExport,
}: ReviewRailProps) {
  if (!run) return null;

  const finalized = run.status === "finalized";
  const revision = run.revision ?? 1;
  const complete = employeesCount > 0 && completedCount === employeesCount;
  const title = finalized
    ? "รอบนี้ปิดแล้ว"
    : employeesCount === 0
      ? "ยังไม่มีพนักงานในรอบนี้"
      : complete
        ? "พร้อมปิดรอบ"
        : "ต้องตรวจสอบก่อนปิดรอบ";

  return (
    <aside className="grid items-start gap-3 md:grid-cols-2 min-[1440px]:sticky min-[1440px]:top-4 min-[1440px]:block min-[1440px]:space-y-3">
      <SectionCard
        title={title}
        description={
          finalized
            ? `ปิดเมื่อ ${run.finalized_at ? new Date(run.finalized_at).toLocaleDateString("th-TH") : run.pay_date}`
            : `รอบจ่าย ${run.label || `${run.period_start} – ${run.period_end}`}`
        }
        icon={finalized ? <ShieldCheck className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
        titleRight={
          <div className="flex items-center gap-1.5">
            <BatchBadge type={batchTypeOf(run)} />
            <StatusBadge
              tone={finalized ? "green" : "amber"}
              label={finalized ? "ปิดรอบ" : "ร่าง"}
            />
          </div>
        }
      >
        <div className="space-y-2">
          <ReadinessLine
            ok={complete}
            label="กรอกข้อมูลพนักงาน"
            value={`${completedCount}/${employeesCount} คน`}
          />
          <ReadinessLine
            ok={attentionEmployees.length === 0 && employeesCount > 0}
            label="รายการต้องตรวจสอบ"
            value={employeesCount === 0 ? "—" : `${attentionEmployees.length} รายการ`}
          />
          <ReadinessLine
            ok={untouchedCount === 0}
            label="ยังไม่ได้กรอก"
            value={`${untouchedCount} คน`}
          />
          <ReadinessLine
            ok={!finalized || (whtExistingCount ?? 0) > 0}
            label="ภาษีหัก ณ ที่จ่าย"
            value={
              finalized
                ? whtExistingCount === null
                  ? "กำลังตรวจสอบ"
                  : whtExistingCount === 0
                    ? "ยังไม่สร้าง"
                    : `${whtExistingCount} รายการ`
                : "หลังปิดรอบ"
            }
          />
          {excludedEmployeeCount > 0 && (
            <p className="text-label leading-5 text-ink-400">
              ไม่รวมพนักงาน {excludedEmployeeCount} คน ที่อยู่นอกช่วงรอบนี้
            </p>
          )}
        </div>

        {attentionEmployees.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line-faint pt-3">
            {attentionEmployees.slice(0, 4).map((employee) => (
              <button
                key={employee.id}
                type="button"
                onClick={() => onOpenEmployee(employee.id)}
                className="rounded-full bg-danger-soft px-2 py-0.5 text-label font-medium text-danger-text transition-colors hover:bg-danger-border"
              >
                {employee.full_name || employee.employee_code}
              </button>
            ))}
            {attentionEmployees.length > 4 && (
              <span className="px-1 py-0.5 text-label text-ink-400">
                +{attentionEmployees.length - 4} คน
              </span>
            )}
          </div>
        )}

        {revision > 1 && !finalized && (
          <p className="mt-2 text-label text-warning-text">
            Revision {revision} — รอบนี้เคยปิดแล้วและถูกเปิดมาแก้ไข
          </p>
        )}
      </SectionCard>

      <SectionCard title="ยอดรอบนี้" description="ตัวเลขเดียวกับที่บันทึกและส่งออก">
        {isOtRun ? (
          <div className="space-y-1.5">
            <AmountRow label="คนมี OT" value={`${otPeople}/${employeesCount} คน`} />
            <AmountRow label="ชั่วโมง OT รวม" value={hoursLabel(otHours)} />
            <AmountRow label="ค่า OT รวม" value={<Money value={totals.ot} />} />
            <div className="mt-2 flex items-baseline justify-between border-t border-line-faint pt-2">
              <span className="text-body font-semibold text-ink-700">สุทธิรอบนี้</span>
              <Money value={totals.net} className="text-display font-semibold text-primary-deep" />
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <AmountRow label="ค่าแรงรวม" value={<Money value={totals.gross} />} />
            <AmountRow
              label="ประกันสังคม (พนักงาน)"
              value={<Money value={totals.sso} prefix="−฿" />}
              tone="red"
            />
            <AmountRow
              label="ภาษีหัก ณ ที่จ่าย"
              value={<Money value={totals.wht} prefix="−฿" />}
              tone="red"
            />
            {totals.deductions > 0 && (
              <AmountRow
                label="เงินหักอื่น"
                value={<Money value={totals.deductions} prefix="−฿" />}
                tone="red"
              />
            )}
            <div className="mt-2 flex items-baseline justify-between border-t border-line-faint pt-2">
              <span className="text-body font-semibold text-ink-700">เงินเดือนสุทธิ</span>
              <Money value={totals.net} className="text-display font-semibold text-primary-deep" />
            </div>
            <p className="pt-0.5 text-label text-ink-400">
              นายจ้างสมทบประกันสังคม <Money value={totals.ssoEmp} />
            </p>
          </div>
        )}

        <div className="mt-3 space-y-2 border-t border-line-faint pt-3">
          {finalized ? (
            <>
              <Button
                onClick={onSyncWht}
                loading={syncingWht}
                className="w-full"
                variant={whtExistingCount === 0 ? "primary" : "secondary"}
              >
                {syncingWht ? "กำลังซิงก์..." : "ซิงก์ภาษีหัก ณ ที่จ่าย"}
              </Button>
              <Button onClick={onGoWht} variant="secondary" className="w-full">
                ไปหน้าภาษีหัก ณ ที่จ่าย <ArrowRight className="h-3.5 w-3.5" />
              </Button>
              <Button onClick={onExport} variant="secondary" className="w-full">
                ส่งออกรายงาน
              </Button>
              <button
                type="button"
                onClick={onReopen}
                className="w-full text-center text-label font-medium text-ink-500 hover:text-ink-900"
              >
                เปิดรอบมาแก้ไข
              </button>
            </>
          ) : (
            <>
              <Button
                onClick={onFinalize}
                className="w-full"
                disabled={!canFinalize}
                title={canFinalize ? undefined : finalizeReason}
              >
                ปิดรอบ
              </Button>
              {!canFinalize && (
                <p className="text-center text-label leading-5 text-ink-400">{finalizeReason}</p>
              )}
              <Button onClick={onExport} variant="secondary" className="w-full">
                ส่งออกรายงาน
              </Button>
              <p className="text-center text-label text-ink-400">วันจ่าย {payDate}</p>
            </>
          )}
        </div>
      </SectionCard>

      <button
        type="button"
        onClick={onOpenHistory}
        className="flex w-full items-center justify-center gap-1.5 rounded-control border border-card-border bg-white px-3 py-2 text-label font-medium text-ink-600 transition-colors hover:border-line-strong hover:text-ink-900 md:col-span-2 min-[1440px]:col-span-1"
      >
        <History className="h-3.5 w-3.5" /> ประวัติรอบที่ผ่านมา
      </button>
      {syncingWht && (
        <p className="flex items-center justify-center gap-1.5 text-label text-ink-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> กำลังซิงก์รายการภาษี
        </p>
      )}
    </aside>
  );
}
