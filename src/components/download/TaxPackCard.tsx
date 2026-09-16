import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Save } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth, useClientProfile } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { useDownloadJob } from "../../hooks/useDownloadJob";
import { downloadBlob, datedFilename } from "../../lib/download/download";
import { logDownload } from "../../lib/download/audit";
import {
  buildTaxPackXlsx,
  salesTaxCsvBlob,
  type SalesTaxRow,
  type WhtPayableRow,
} from "../../lib/download/taxReports";
import { DownloadJobBar } from "./DownloadJobBar";

const MONTH_LABELS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const SALES_STATUSES = ["sent", "paid", "issued", "in_billing", "overdue"];

function getMonthRange(year: number, month: number) {
  const m = String(month).padStart(2, "0");
  return { start: `${year}-${m}-01`, end: `${year}-${m}-${new Date(year, month, 0).getDate()}` };
}

interface TaxFiling {
  input_vat: number;
  note: string | null;
}

/**
 * Monthly tax pack: รายงานภาษีขาย + ภ.พ.30 worksheet. Output VAT is computed from
 * the month's tax invoices; input VAT is entered manually (no purchase ledger)
 * and persisted in `tax_filings`.
 */
export function TaxPackCard() {
  const { profile } = useAuth();
  const { clientProfile } = useClientProfile(profile?.id);
  const toast = useToast();
  const job = useDownloadJob();
  const userId = profile?.id;
  const vatRegistered = Boolean(clientProfile?.vat_registered);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [inputVat, setInputVat] = useState("0");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [sales, setSales] = useState<SalesTaxRow[]>([]);
  const [whtRows, setWhtRows] = useState<WhtPayableRow[]>([]);
  const [loading, setLoading] = useState(false);

  const range = useMemo(() => getMonthRange(year, month), [year, month]);
  const periodLabel = `${THAI_MONTHS[month - 1]} ${year + 543}`;
  const outputVat = sales.reduce((sum, row) => sum + row.vatAmount, 0);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [filingRes, salesRes, whtRes] = await Promise.all([
        supabase
          .from("tax_filings")
          .select("input_vat, note")
          .eq("user_id", userId)
          .eq("period_year", year)
          .eq("period_month", month)
          .maybeSingle(),
        vatRegistered
          ? supabase
              .from("documents")
              .select("doc_number, issue_date, subtotal, vat_amount, total_amount, customer:customer_id(name, tax_id)")
              .eq("user_id", userId)
              .eq("doc_type", "invoice")
              .in("status", SALES_STATUSES)
              .gte("issue_date", range.start)
              .lte("issue_date", range.end)
              .order("issue_date", { ascending: true })
          : Promise.resolve({ data: [] as unknown[] }),
        supabase
          .from("wht_records")
          .select("issue_date, certificate_no, amount, wht_rate, wht_amount, form_type, vendor:wht_vendors(name, tax_id)")
          .eq("user_id", userId)
          .gte("issue_date", range.start)
          .lte("issue_date", range.end)
          .order("issue_date", { ascending: true }),
      ]);

      const filing = filingRes.data as TaxFiling | null;
      setInputVat(String(filing?.input_vat ?? 0));
      setNote(filing?.note ?? "");

      setSales(
        ((salesRes.data ?? []) as Array<Record<string, unknown>>).map((doc) => ({
          date: String(doc.issue_date ?? ""),
          docNumber: String(doc.doc_number ?? "-"),
          customerName: (doc.customer as { name?: string } | null)?.name ?? "",
          customerTaxId: (doc.customer as { tax_id?: string } | null)?.tax_id ?? "",
          subtotal: Number(doc.subtotal ?? 0),
          vatAmount: Number(doc.vat_amount ?? 0),
          total: Number(doc.total_amount ?? 0),
        })),
      );
      setWhtRows(
        ((whtRes.data ?? []) as Array<Record<string, unknown>>).map((record) => ({
          date: String(record.issue_date ?? ""),
          certificateNo: String(record.certificate_no ?? ""),
          vendorName: (record.vendor as { name?: string } | null)?.name ?? "",
          vendorTaxId: (record.vendor as { tax_id?: string } | null)?.tax_id ?? "",
          formType: String(record.form_type ?? ""),
          amount: Number(record.amount ?? 0),
          whtRate: Number(record.wht_rate ?? 0),
          whtAmount: Number(record.wht_amount ?? 0),
        })),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "โหลดข้อมูลภาษีไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [userId, year, month, vatRegistered, range.start, range.end, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveFiling() {
    if (!userId || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("tax_filings").upsert(
        { user_id: userId, period_year: year, period_month: month, input_vat: Number(inputVat) || 0, note: note || null },
        { onConflict: "user_id,period_year,period_month" },
      );
      if (error) throw error;
      toast.success("บันทึกภาษีซื้อแล้ว");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload(format: "xlsx" | "csv") {
    if (!userId) return;
    await job.run(async () => {
      const inputVatValue = Number(inputVat) || 0;
      if (format === "csv") {
        downloadBlob(salesTaxCsvBlob(sales), datedFilename(`sales-tax_${year}-${String(month).padStart(2, "0")}`, "csv"));
      } else {
        const buffer = await buildTaxPackXlsx({ periodLabel, sales, inputVat: inputVatValue, inputVatNote: note || undefined, whtRows });
        downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `tax-pack_${year}-${String(month).padStart(2, "0")}.xlsx`);
      }
      await logDownload({
        workspaceUserId: userId,
        actorUserId: profile?.auth_user_id ?? userId,
        kind: "report_tax",
        format,
        params: { period: `${year}-${String(month).padStart(2, "0")}`, outputVat, inputVat: inputVatValue },
        status: "success",
      });
      return { total: 1, succeeded: 1, failed: 0 };
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-card-border bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-soft text-primary">
          <CalendarDays className="h-4 w-4" />
        </span>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-gray-400">ภาษีและใบกำกับ</div>
          <div className="text-[11px] text-gray-400">{vatRegistered ? "รายงานภาษีขาย · ภ.พ.30" : "ยังไม่จดทะเบียน VAT — แสดงเฉพาะภาษีหัก ณ ที่จ่าย"}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="tax-month" className="mb-0.5 block text-[10px] text-gray-500">เดือน</label>
          <select id="tax-month" value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-full rounded-md border border-[#E8E6DF] bg-white px-2 py-1.5 text-xs focus:border-[#378ADD] focus:outline-none focus:ring-2 focus:ring-[#378ADD]/20">
            {MONTH_LABELS.map((label, i) => (<option key={i} value={i + 1}>{label}</option>))}
          </select>
        </div>
        <div>
          <label htmlFor="tax-year" className="mb-0.5 block text-[10px] text-gray-500">ปี</label>
          <select id="tax-year" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-full rounded-md border border-[#E8E6DF] bg-white px-2 py-1.5 text-xs focus:border-[#378ADD] focus:outline-none focus:ring-2 focus:ring-[#378ADD]/20">
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (<option key={y} value={y}>{y + 543}</option>))}
          </select>
        </div>
      </div>

      {vatRegistered ? (
        <div className="rounded-lg bg-paper-field px-3 py-2 text-xs text-ink-700">
          <div className="flex justify-between"><span className="text-gray-500">ภาษีขาย (คำนวณจากใบกำกับภาษี)</span><span className="font-medium">฿{outputVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
          <div className="mt-1 flex justify-between"><span className="text-gray-500">จำนวนเอกสาร</span><span>{loading ? "…" : `${sales.length} ฉบับ`}</span></div>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor="tax-input-vat" className="mb-0.5 block text-[10px] text-gray-500">ภาษีซื้อ (บาท)</label>
          <input id="tax-input-vat" type="number" inputMode="decimal" value={inputVat} onChange={(e) => setInputVat(e.target.value)} className="w-full rounded-md border border-[#E8E6DF] bg-white px-2 py-1.5 text-xs focus:border-[#378ADD] focus:outline-none focus:ring-2 focus:ring-[#378ADD]/20" />
        </div>
        <div>
          <label htmlFor="tax-note" className="mb-0.5 block text-[10px] text-gray-500">หมายเหตุ</label>
          <input id="tax-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ไม่บังคับ" className="w-full rounded-md border border-[#E8E6DF] bg-white px-2 py-1.5 text-xs focus:border-[#378ADD] focus:outline-none focus:ring-2 focus:ring-[#378ADD]/20" />
        </div>
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-gray-400">ภาษีที่ต้องชำระ ≈ ฿{(outputVat - (Number(inputVat) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        <button type="button" onClick={saveFiling} disabled={saving} className="inline-flex items-center gap-1 rounded-md border border-card-border px-2 py-1 text-[11px] font-medium text-ink-700 hover:border-primary/40 disabled:opacity-50">
          <Save className="h-3 w-3" />{saving ? "กำลังบันทึก..." : "บันทึกภาษีซื้อ"}
        </button>
      </div>

      <DownloadJobBar state={job} onCancel={job.cancel} onDismiss={job.reset} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={() => handleDownload("xlsx")} disabled={job.status === "running"} className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50">
          ดาวน์โหลดชุดภาษี (XLSX)
        </button>
        <button type="button" onClick={() => handleDownload("csv")} disabled={job.status === "running"} className="rounded-lg border border-card-border px-3 py-2 text-xs font-medium text-ink-700 transition-colors hover:border-primary/40 disabled:opacity-50 sm:w-40">
          CSV ภาษีขาย
        </button>
      </div>
    </div>
  );
}
