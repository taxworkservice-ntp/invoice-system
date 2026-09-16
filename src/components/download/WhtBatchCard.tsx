import { useCallback, useEffect, useState } from "react";
import { FileBadge } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { apiFetchBlob } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { useDownloadJob } from "../../hooks/useDownloadJob";
import { downloadBlob, datedFilename } from "../../lib/download/download";
import { logDownload } from "../../lib/download/audit";
import { whtPayableCsvBlob, type WhtPayableRow } from "../../lib/download/taxReports";
import { assignWhtCertificateNo } from "../../lib/whtCertificate";
import { DownloadJobBar } from "./DownloadJobBar";

interface WhtRow {
  id: string;
  issue_date: string;
  certificate_no: string | null;
}

function monthRange(monthValue: string) {
  const [y, m] = monthValue.split("-").map(Number);
  return { start: `${monthValue}-01`, end: `${monthValue}-${new Date(y, m, 0).getDate()}` };
}

/**
 * Withholding-tax filing surface: batch-download the month's certificates as a
 * single PDF (assigning certificate numbers first) and export the ภ.ง.ด.3/53
 * register as CSV.
 */
export function WhtBatchCard() {
  const { profile } = useAuth();
  const toast = useToast();
  const job = useDownloadJob();
  const userId = profile?.id;

  const now = new Date();
  const [monthValue, setMonthValue] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [rows, setRows] = useState<WhtRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { start, end } = monthRange(monthValue);
      const { data, error } = await supabase
        .from("wht_records")
        .select("id, issue_date, certificate_no")
        .eq("user_id", userId)
        .gte("issue_date", start)
        .lte("issue_date", end)
        .order("issue_date", { ascending: true });
      if (error) throw error;
      setRows((data ?? []) as WhtRow[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "โหลดรายการภาษีหักไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [userId, monthValue, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function assignMissing(): Promise<string[]> {
    if (!userId) return [];
    const ids: string[] = [];
    for (const row of rows) {
      let certificateNo = row.certificate_no;
      if (!certificateNo) {
        certificateNo = await assignWhtCertificateNo(row.id, userId, row.issue_date);
      }
      ids.push(row.id);
    }
    return ids;
  }

  async function handleCertificatesPdf() {
    if (!userId || rows.length === 0) return;
    await job.run(async () => {
      const ids = await assignMissing();
      const blob = await apiFetchBlob("/api/wht/generate", {
        method: "POST",
        body: JSON.stringify({ ids, layout: "pnd" }),
      });
      downloadBlob(blob, datedFilename(`wht-certificates_${monthValue}`, "pdf"));
      await logDownload({
        workspaceUserId: userId,
        actorUserId: profile?.auth_user_id ?? userId,
        kind: "wht_certificates",
        format: "pdf",
        params: { month: monthValue },
        fileCount: ids.length,
        status: "success",
      });
      await load();
      return { total: ids.length, succeeded: ids.length, failed: 0 };
    });
  }

  async function handleCsv() {
    if (!userId || rows.length === 0) return;
    await job.run(async () => {
      const { start, end } = monthRange(monthValue);
      const { data, error } = await supabase
        .from("wht_records")
        .select("issue_date, certificate_no, amount, wht_rate, wht_amount, form_type, vendor:wht_vendors(name, tax_id)")
        .eq("user_id", userId)
        .gte("issue_date", start)
        .lte("issue_date", end)
        .order("issue_date", { ascending: true });
      if (error) throw error;
      const payable: WhtPayableRow[] = ((data ?? []) as Array<Record<string, unknown>>).map((record) => ({
        date: String(record.issue_date ?? ""),
        certificateNo: String(record.certificate_no ?? ""),
        vendorName: (record.vendor as { name?: string } | null)?.name ?? "",
        vendorTaxId: (record.vendor as { tax_id?: string } | null)?.tax_id ?? "",
        formType: String(record.form_type ?? ""),
        amount: Number(record.amount ?? 0),
        whtRate: Number(record.wht_rate ?? 0),
        whtAmount: Number(record.wht_amount ?? 0),
      }));
      downloadBlob(whtPayableCsvBlob(payable), datedFilename(`wht-payable_${monthValue}`, "csv"));
      await logDownload({
        workspaceUserId: userId,
        actorUserId: profile?.auth_user_id ?? userId,
        kind: "wht_register",
        format: "csv",
        params: { month: monthValue },
        fileCount: payable.length,
        status: "success",
      });
      return { total: payable.length, succeeded: payable.length, failed: 0 };
    });
  }

  return (
    <div className="space-y-4 rounded-control border border-card-border bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-control bg-primary-soft text-primary">
          <FileBadge className="h-4 w-4" />
        </span>
        <div>
          <div className="text-label font-semibold text-ink-400">ภาษีหัก ณ ที่จ่าย</div>
          <div className="text-label text-ink-400">ใบรับรอง · ภ.ง.ด.3/53</div>
        </div>
      </div>

      <div>
        <label htmlFor="wht-month" className="mb-0.5 block text-label text-ink-500">เดือน</label>
        <input id="wht-month" type="month" value={monthValue} onChange={(e) => setMonthValue(e.target.value)} className="w-full rounded-control border border-card-border bg-white px-2 py-1.5 text-label focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
      </div>

      <div className="rounded-control bg-paper-field px-3 py-2 text-label text-ink-700">
        <div className="flex justify-between"><span className="text-ink-500">รายการในเดือนนี้</span><span className="font-medium">{loading ? "…" : `${rows.length} รายการ`}</span></div>
        <div className="mt-1 flex justify-between"><span className="text-ink-500">ยังไม่มีเลขที่ใบรับรอง</span><span>{rows.filter((r) => !r.certificate_no).length}</span></div>
      </div>

      <DownloadJobBar state={job} onCancel={job.cancel} onDismiss={job.reset} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={handleCertificatesPdf} disabled={job.status === "running" || rows.length === 0} className="flex-1 rounded-control bg-primary px-3 py-2 text-label font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50">
          ดาวน์โหลดใบรับรอง (PDF)
        </button>
        <button type="button" onClick={handleCsv} disabled={job.status === "running" || rows.length === 0} className="rounded-control border border-card-border px-3 py-2 text-label font-medium text-ink-700 transition-colors hover:border-primary/40 disabled:opacity-50 sm:w-40">
          CSV ภ.ง.ด.3/53
        </button>
      </div>
    </div>
  );
}
