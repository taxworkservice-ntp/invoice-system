import { useCallback, useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { useAuth, useClientProfile } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { useDownloadJob } from "../../hooks/useDownloadJob";
import { downloadBlob } from "../../lib/download/download";
import { logDownload } from "../../lib/download/audit";
import { getProxiedImageUrl } from "../../lib/r2";
import type { PayslipCompany } from "../../lib/payroll/payslipPdf";
import type { PayrollRun } from "../../types";
import { DownloadJobBar } from "./DownloadJobBar";

type PayrollExportKind = "summary" | "bank" | "wht" | "payslips";

function monthSuffix(run: PayrollRun | null) {
  if (!run) return "";
  return `${run.period_year}-${String(run.period_month).padStart(2, "0")}`;
}

function runLabel(run: PayrollRun) {
  return `${run.label || `รอบ ${run.period_month}/${run.period_year}`} · ${monthSuffix(run)}`;
}

/**
 * Payroll exports surfaced centrally: summary / bank payment / WHT (XLSX) and
 * bulk payslips (ZIP of PDFs) for a chosen run — reusing the Payroll page's
 * pure builders so figures match.
 */
export function PayrollExportCard() {
  const { profile } = useAuth();
  const { clientProfile } = useClientProfile(profile?.id);
  const toast = useToast();
  const job = useDownloadJob();
  const userId = profile?.id;

  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [runId, setRunId] = useState("");
  const [loading, setLoading] = useState(false);

  const company: PayslipCompany | null = useMemo(() => {
    if (!clientProfile) return null;
    return {
      name: clientProfile.company_name_th || null,
      address: clientProfile.address,
      taxId: clientProfile.tax_id,
      phone: clientProfile.phone,
      logoUrl: clientProfile.logo_url ? getProxiedImageUrl(clientProfile.logo_url) : null,
    };
  }, [clientProfile]);

  const loadRuns = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { listPayrollRuns } = await import("../../lib/payroll/exportRun");
      const list = await listPayrollRuns(userId);
      setRuns(list);
      setRunId((current) => current || list[0]?.id || "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "โหลดรอบจ่ายไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [userId, toast]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const selectedRun = runs.find((run) => run.id === runId) ?? null;

  async function handleWorkbook(kind: Exclude<PayrollExportKind, "payslips">) {
    if (!userId || !runId) return;
    await job.run(async () => {
      const { loadPayrollExportBundle } = await import("../../lib/payroll/exportRun");
      const { buildRunSummaryWorkbook, buildBankPaymentWorkbook, buildWhtWorkbook, workbookToBlob } = await import("../../lib/payroll/reportXlsx");
      const bundle = await loadPayrollExportBundle(userId, runId);
      const suffix = monthSuffix(bundle.run);

      let workbook;
      if (kind === "summary") {
        workbook = buildRunSummaryWorkbook(bundle.run, bundle.rows);
      } else if (kind === "bank") {
        const rows = bundle.rows.filter((row) => row.employee.bank_account);
        if (rows.length === 0) throw new Error("ไม่มีพนักงานที่มีเลขบัญชีธนาคาร");
        workbook = buildBankPaymentWorkbook(bundle.run, rows);
      } else {
        workbook = buildWhtWorkbook(bundle.run, bundle.rows);
      }

      const blob = await workbookToBlob(workbook);
      downloadBlob(blob, `payroll-${kind}_${suffix}.xlsx`);
      await logDownload({
        workspaceUserId: userId,
        actorUserId: profile?.auth_user_id ?? userId,
        kind: `payroll_${kind}`,
        format: "xlsx",
        params: { run: runId },
        fileCount: bundle.rows.length,
        status: "success",
      });
      return { total: 1, succeeded: 1, failed: 0 };
    });
  }

  async function handlePayslips() {
    if (!userId || !runId) return;
    await job.run(async () => {
      const { loadPayrollExportBundle } = await import("../../lib/payroll/exportRun");
      const { buildPayslipsZip } = await import("../../lib/payroll/payslipBatch");
      const bundle = await loadPayrollExportBundle(userId, runId);
      const result = await buildPayslipsZip(bundle, company);
      if (!result.blob) throw new Error("สร้างสลิปไม่สำเร็จ");
      downloadBlob(result.blob, `payslips_${monthSuffix(bundle.run)}.zip`);
      await logDownload({
        workspaceUserId: userId,
        actorUserId: profile?.auth_user_id ?? userId,
        kind: "payroll_payslips",
        format: "pdf_zip",
        params: { run: runId },
        fileCount: result.succeeded,
        status: result.failed === 0 ? "success" : result.succeeded === 0 ? "failed" : "partial",
        error: result.failed > 0 ? `${result.failed} คนล้มเหลว` : undefined,
      });
      return { total: bundle.employees.length, succeeded: result.succeeded, failed: result.failed, failures: result.failures };
    });
  }

  return (
    <div className="space-y-4 rounded-control border border-card-border bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-control bg-primary-soft text-primary">
          <Users className="h-4 w-4" />
        </span>
        <div>
          <div className="text-label font-semibold text-ink-400">เงินเดือน</div>
          <div className="text-label text-ink-400">สรุป · เงินโอน · ภาษี · สลิป</div>
        </div>
      </div>

      <div>
        <label htmlFor="payroll-run" className="mb-0.5 block text-label text-ink-500">รอบจ่าย</label>
        <select id="payroll-run" value={runId} onChange={(e) => setRunId(e.target.value)} disabled={loading || runs.length === 0} className="w-full rounded-control border border-card-border bg-white px-2 py-1.5 text-label focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50">
          {runs.length === 0 && <option value="">{loading ? "กำลังโหลด..." : "ยังไม่มีรอบจ่าย"}</option>}
          {runs.map((run) => (<option key={run.id} value={run.id}>{runLabel(run)}</option>))}
        </select>
      </div>

      {selectedRun && (
        <div className="rounded-control bg-paper-field px-3 py-2 text-label text-ink-700">
          <div className="flex justify-between"><span className="text-ink-500">พนักงาน</span><span className="font-medium">{selectedRun.employee_count ?? 0} คน</span></div>
          <div className="mt-1 flex justify-between"><span className="text-ink-500">สถานะรอบ</span><span>{selectedRun.status === "finalized" ? "ยืนยันแล้ว" : "ฉบับร่าง"}</span></div>
        </div>
      )}

      <DownloadJobBar state={job} onCancel={job.cancel} onDismiss={job.reset} />

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => handleWorkbook("summary")} disabled={!runId || job.status === "running"} className="rounded-control border border-card-border px-3 py-2 text-label font-medium text-ink-700 transition-colors hover:border-primary/40 disabled:opacity-50">สรุปเงินเดือน (XLSX)</button>
        <button type="button" onClick={() => handleWorkbook("bank")} disabled={!runId || job.status === "running"} className="rounded-control border border-card-border px-3 py-2 text-label font-medium text-ink-700 transition-colors hover:border-primary/40 disabled:opacity-50">เงินโอนธนาคาร (XLSX)</button>
        <button type="button" onClick={() => handleWorkbook("wht")} disabled={!runId || job.status === "running"} className="rounded-control border border-card-border px-3 py-2 text-label font-medium text-ink-700 transition-colors hover:border-primary/40 disabled:opacity-50">ภาษีหัก ณ ที่จ่าย (XLSX)</button>
        <button type="button" onClick={handlePayslips} disabled={!runId || job.status === "running"} className="rounded-control bg-primary px-3 py-2 text-label font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50">สลิปเงินเดือน (ZIP)</button>
      </div>
    </div>
  );
}
