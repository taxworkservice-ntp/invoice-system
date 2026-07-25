import { useState, useMemo, useCallback, useEffect } from "react";
import { useAuth, useClientProfile } from "../../../hooks/useAuth";
import { AppShell } from "../../../components/layout/AppShell";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Input";
import { Spinner } from "../../../components/ui/Spinner";
import { useToast } from "../../../hooks/useToast";
import { supabase } from "../../../lib/supabase";
import { DOC_TYPE_LABELS } from "../../../constants";
import { useFinancialReport } from "../../../hooks/useReports";
import type { DocumentType, Customer } from "../../../types";
import { Download, FileText, BarChart3, Package } from "lucide-react";
import { Modal } from "../../../components/ui/Modal";

type ConfirmAction =
  | { type: "preset"; preset: (typeof PRESET_TYPES)[number] }
  | { type: "custom"; count: number }
  | { type: "report"; reportType: "financial" | "stock" }
  | null;

const PRESET_TYPES: { key: string; label: string; docType: DocumentType; variant: "thisMonth" | "unpaid" }[] = [
  { key: "invoice", label: "ใบแจ้งหนี้เดือนนี้", docType: "invoice", variant: "thisMonth" },
  { key: "tax_invoice", label: "ใบกำกับภาษีเดือนนี้", docType: "tax_invoice_receipt", variant: "thisMonth" },
  { key: "billing", label: "ใบวางบิลเดือนนี้", docType: "billing_note", variant: "thisMonth" },
  { key: "receipt", label: "ใบเสร็จเดือนนี้", docType: "receipt", variant: "thisMonth" },
  { key: "delivery", label: "ใบส่งของเดือนนี้", docType: "delivery_note", variant: "thisMonth" },
  { key: "billing_unpaid", label: "ใบวางบิลที่ยังไม่ชำระ", docType: "billing_note", variant: "unpaid" },
  { key: "credit", label: "ใบลดหนี้เดือนนี้", docType: "credit_note", variant: "thisMonth" },
];

const NON_DRAFT_STATUSES = ["sent", "issued", "generated", "paid", "converted", "in_billing"];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function DownloadCenterPage() {
  const { profile } = useAuth();
  const { clientProfile } = useClientProfile(profile?.id);
  const toast = useToast();
  const userId = profile?.id;

  const [copyType, setCopyType] = useState<"original" | "both">("original");
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const [customDocType, setCustomDocType] = useState<DocumentType>("invoice");
  const [customCustomerId, setCustomCustomerId] = useState("");

  const [reportExporting, setReportExporting] = useState("");

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const [finMonth, setFinMonth] = useState(currentMonth);
  const [finYear, setFinYear] = useState(currentYear);
  const [stockFrom, setStockFrom] = useState(`${currentYear}-${String(currentMonth).padStart(2, "0")}-01`);
  const [stockTo, setStockTo] = useState(new Date().toISOString().slice(0, 10));
  const [customMonth, setCustomMonth] = useState(currentMonth);
  const [customYear, setCustomYear] = useState(currentYear);
  const [quickFilter, setQuickFilter] = useState<"thisMonth" | "prevMonth">("thisMonth");

  const { summary: finSummary, transactions: finTransactions, arByCustomer: finArByCustomer, arDetails: finArDetails, arAging: finArAging, topCustomers: finTopCustomers, monthly: finMonthly, byType: finByType, lineItems: finLineItems, dealNotes: finDealNotes, cogs: finCogs, collectionRate: finCollectionRate } = useFinancialReport(userId, finYear, finMonth);

  const isVatRegistered = clientProfile?.vat_registered;

  const quickMonthStart = useMemo(() => {
    const d = new Date(currentYear, currentMonth - 1, 1);
    if (quickFilter === "prevMonth") d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }, [currentYear, currentMonth, quickFilter]);

  const quickMonth = useMemo(() => {
    const d = new Date(currentYear, currentMonth - 1, 1);
    if (quickFilter === "prevMonth") d.setMonth(d.getMonth() - 1);
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  }, [currentYear, currentMonth, quickFilter]);

  const monthSuffix = MONTH_LABELS[quickMonth.month - 1];
  const selectedMonthLabel = `${THAI_MONTHS[quickMonth.month - 1]} ${quickMonth.year + 543}`;

  const presetTypes = useMemo(() => {
    return PRESET_TYPES
      .filter(p => isVatRegistered || p.docType !== "tax_invoice_receipt")
      .map(p => {
        let label = p.label;
        if (p.key === "tax_invoice") label = "ใบกำกับภาษี/ใบเสร็จเดือนนี้";
        if (p.key === "invoice" && isVatRegistered) label = "ใบกำกับภาษีเดือนนี้";
        if (p.variant === "thisMonth") {
          label = label.replace("เดือนนี้", `(${monthSuffix})`);
        }
        return { ...p, label };
      });
  }, [isVatRegistered, monthSuffix]);

  const docTypeLabels = useMemo(() => {
    const labels = { ...DOC_TYPE_LABELS };
    if (isVatRegistered) {
      labels.invoice = { th: "ใบกำกับภาษี", en: "Tax Invoice" };
    }
    return labels;
  }, [isVatRegistered]);

  const fetchPresetCounts = useCallback(async () => {
    if (!userId) return;
    const counts: Record<string, number> = {};
    for (const preset of PRESET_TYPES) {
      let query = supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("doc_type", preset.docType)
        .in("status", NON_DRAFT_STATUSES);
      if (preset.variant === "thisMonth") {
        query = query.gte("issue_date", quickMonthStart);
      } else if (preset.variant === "unpaid") {
        query = query.neq("status", "paid");
      }
      const { count, error } = await query;
      if (!error && count != null) counts[preset.key] = count;
    }
    return counts;
  }, [userId, quickMonthStart]);

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countsLoaded, setCountsLoaded] = useState(false);

  useEffect(() => {
    fetchPresetCounts().then((c) => {
      if (c) setCounts(c);
      setCountsLoaded(true);
    });
  }, [userId, quickFilter]);

  const handlePresetDownload = async (presetKey: string) => {
    if (!userId || !clientProfile) return;
    const preset = PRESET_TYPES.find((p) => p.key === presetKey);
    if (!preset) return;
    setDownloading(true);
    setReportExporting("");
    try {
      let query = supabase
        .from("documents")
        .select("id, doc_number")
        .eq("user_id", userId)
        .eq("doc_type", preset.docType)
        .in("status", NON_DRAFT_STATUSES)
        .order("issue_date", { ascending: false });
      if (preset.variant === "thisMonth") query = query.gte("issue_date", quickMonthStart);
      else if (preset.variant === "unpaid") query = query.neq("status", "paid");
      const { data: docs, error } = await query;
      if (error || !docs || docs.length === 0) { toast.error("ไม่พบเอกสาร"); return; }
      await downloadDocsAsZip(docs, clientProfile.pdf_template === "classic" ? "classic" : "modern");
      toast.success(`ดาวน์โหลด ${docs.length} ไฟล์เรียบร้อย`);
    } catch (err: any) {
      toast.error(err.message || "เกิดข้อผิดพลาด");
    } finally {
      setDownloading(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  const handleCustomDownload = async () => {
    if (!userId || !clientProfile) return;
    setDownloading(true);
    setReportExporting("");
    try {
      const { start, end } = getMonthRange(customYear, customMonth);
      let query = supabase
        .from("documents")
        .select("id, doc_number")
        .eq("user_id", userId)
        .eq("doc_type", customDocType)
        .in("status", NON_DRAFT_STATUSES)
        .gte("issue_date", start)
        .lte("issue_date", end)
        .order("issue_date", { ascending: false });
      if (customCustomerId) query = query.eq("customer_id", customCustomerId);
      const { data: docs, error } = await query;
      if (error || !docs || docs.length === 0) { toast.error("ไม่พบเอกสาร"); return; }
      await downloadDocsAsZip(docs, clientProfile.pdf_template === "classic" ? "classic" : "modern");
      toast.success(`ดาวน์โหลด ${docs.length} ไฟล์เรียบร้อย`);
    } catch (err: any) {
      toast.error(err.message || "เกิดข้อผิดพลาด");
    } finally {
      setDownloading(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  const handleCustomConfirm = async () => {
    if (!userId) return;
    const { start, end } = getMonthRange(customYear, customMonth);
    let query = supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("doc_type", customDocType)
      .in("status", NON_DRAFT_STATUSES)
      .gte("issue_date", start)
      .lte("issue_date", end);
    if (customCustomerId) query = query.eq("customer_id", customCustomerId);
    const { count, error } = await query;
    if (error || !count) { toast.error("ไม่พบเอกสาร"); return; }
    setConfirmAction({ type: "custom", count });
  };

  const downloadDocsAsZip = async (docs: Array<{ id: string; doc_number: string | null }>, _template: "modern" | "classic") => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    setProgress({ current: 0, total: docs.length });
    const copyTypes: Array<"original" | "copy"> = copyType === "both" ? ["original", "copy"] : ["original"];

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token || "";

    for (let i = 0; i < docs.length; i++) {
      setProgress({ current: i + 1, total: docs.length });
      const doc = docs[i];
      try {
        const res = await fetch(`/api/documents/${encodeURIComponent(doc.id)}/pdf`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ copyTypes }),
        });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition");
        let pdfName = `${doc.doc_number || `doc_${i + 1}`}.pdf`;
        if (disposition) {
          const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/);
          if (utf8Match) {
            pdfName = decodeURIComponent(utf8Match[1]);
          } else {
            const asciiMatch = disposition.match(/filename="([^"]+)"/);
            if (asciiMatch) pdfName = asciiMatch[1];
          }
        }
        zip.file(pdfName, blob, { binary: true });
      } catch {
        toast.error(`ไม่สามารถสร้าง PDF สำหรับ ${doc.doc_number || doc.id}`);
      }
    }
    const zipBlob = await zip.generateAsync({ type: "blob" });
    downloadBlob(zipBlob, `download_${new Date().toISOString().slice(0, 10)}.zip`);
  };

  // --- Report download handlers ---

  const handleExportFinancialCsv = async () => {
    if (!userId) return;
    if (!finSummary) { toast.error("ยังไม่มีข้อมูล"); return; }
    setReportExporting("financial");
    try {
      const { buildFinancialReportXlsx } = await import("../../../lib/financialReportXlsx");
      const buffer = await buildFinancialReportXlsx({
        summary: finSummary,
        transactions: finTransactions,
        arByCustomer: finArByCustomer,
        arDetails: finArDetails,
        arAging: finArAging,
        topCustomers: finTopCustomers,
        monthly: finMonthly,
        byType: finByType,
        lineItems: finLineItems,
        dealNotes: finDealNotes,
        cogs: finCogs,
        collectionRate: finCollectionRate,
        dateFrom: `${String(finMonth).padStart(2, "0")}/${finYear}`,
      });
      downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `financial_${finYear}-${String(finMonth).padStart(2, "0")}.xlsx`);
      toast.success("ดาวน์โหลดเรียบร้อย");
    } catch (err: any) { toast.error(err.message); }
    finally { setReportExporting(""); }
  };

  const handleExportStockXlsx = async () => {
    if (!userId) return;
    setReportExporting("stock");
    try {
      const { fetchFullStockReport } = await import("../../../hooks/useReports");
      const { buildStockReportXlsx } = await import("../../../lib/stockReportXlsx");
      const data = await fetchFullStockReport(userId, stockFrom, stockTo);
      const buffer = await buildStockReportXlsx({ ...data, dateFrom: stockFrom, dateTo: stockTo });
      downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `stock_${stockFrom}_to_${stockTo}.xlsx`);
      toast.success("ดาวน์โหลดเรียบร้อย");
    } catch (err: any) { toast.error(err.message); }
    finally { setReportExporting(""); }
  };

  if (!userId) return <AppShell title="ศูนย์ดาวน์โหลด"><Spinner /></AppShell>;

  const busy = downloading || !!reportExporting;

  return (
    <AppShell title="ศูนย์ดาวน์โหลด">
      <div className="space-y-6">
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-2.5 text-[12px] text-gray-600 leading-relaxed">
          เลือกประเภทเอกสารและเดือน <strong className="text-gray-700">ระบบจะรวม PDF เป็น ZIP</strong> ให้ดาวน์โหลดครั้งเดียว — ส่วน<strong className="text-gray-700">รายงาน</strong> ส่งออกเป็นไฟล์ Excel (XLSX) ใช้เปิดในโปรแกรมตารางคำนวณ
        </div>
        {/* ---- เอกสาร ---- */}
        <Card>
          <div className="space-y-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-gray-400">เอกสาร</div>
            <div>
              <div className="text-[11px] font-semibold text-gray-500 mb-2">รูปแบบ</div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setCopyType("original")} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${copyType === "original" ? "border-primary bg-primary text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}>ต้นฉบับ</button>
                <button type="button" onClick={() => setCopyType("both")} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${copyType === "both" ? "border-primary bg-primary text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}>ต้นฉบับ + สำเนา</button>
              </div>
            </div>
            <div className="border-t border-card-border pt-4">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[11px] font-semibold text-gray-500">ดาวน์โหลดด่วน</div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => setQuickFilter("thisMonth")} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${quickFilter === "thisMonth" ? "border-primary bg-primary text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}>เดือนนี้</button>
                  <button type="button" onClick={() => setQuickFilter("prevMonth")} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${quickFilter === "prevMonth" ? "border-primary bg-primary text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}>เดือนก่อน</button>
                </div>
              </div>
              <div className="text-[11px] text-gray-400 mb-2">{selectedMonthLabel}</div>
              <div className="grid gap-1.5 grid-cols-2 lg:grid-cols-3">
                {presetTypes.map((preset) => (
                  <button key={preset.key} type="button" disabled={busy} onClick={() => setConfirmAction({ type: "preset", preset })}
                    className="flex items-center justify-between rounded-md border border-card-border bg-white px-3 py-2 text-left hover:border-primary/30 hover:bg-blue-50/50 transition-colors disabled:opacity-50">
                    <div className="flex items-center gap-2 min-w-0"><FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" /><span className="text-[13px] text-[#1A1A18] truncate">{preset.label}</span></div>
                    <span className="text-[11px] text-gray-400 tabular-nums shrink-0 ml-2">{countsLoaded ? counts[preset.key] ?? 0 : "—"}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-6 border-t-2 border-[#E8E6DF] pt-5">
              <div className="text-[11px] font-semibold text-gray-500 mb-3">ตามเงื่อนไข</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <MonthSelect label="เดือน" value={customMonth} onChange={setCustomMonth} />
                <YearSelect label="ปี" value={customYear} onChange={setCustomYear} />
                <div><label className="block text-xs font-medium text-gray-600 mb-1">ประเภทเอกสาร</label><Select value={customDocType} onChange={(e) => setCustomDocType(e.target.value as DocumentType)}>{Object.entries(docTypeLabels).filter(([key]) => isVatRegistered || key !== "tax_invoice_receipt").map(([key, label]) => (<option key={key} value={key}>{label.th}</option>))}</Select></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">ลูกค้า (ไม่บังคับ)</label><CustomerQuickSelect value={customCustomerId} onChange={setCustomCustomerId} userId={userId} /></div>
              </div>
              <Button onClick={handleCustomConfirm} disabled={busy} loading={downloading} className="w-full mt-3">
                <Download className="mr-2 h-4 w-4" />{downloading ? `กำลังสร้าง ${progress.current}/${progress.total}` : "ดาวน์โหลดเป็น ZIP"}
              </Button>
              {downloading && progress.total > 0 && (
                <div className="w-full bg-gray-100 rounded-full h-2 mt-2"><div className="bg-primary h-2 rounded-full transition-all duration-300" style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }} /></div>
              )}
            </div>
          </div>
        </Card>

        {/* ---- รายงาน ---- */}
        <Card>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-gray-400">รายงาน</div>
              <div className="text-[10px] text-gray-400">XLSX / CSV</div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* Financial */}
              <ReportCard
                icon={<BarChart3 className="h-4 w-4" />}
                title="รายงานการเงิน"
                description="ยอดขาย ลูกหนี้ รายการธุรกรรม"
                format="XLSX"
                exporting={reportExporting === "financial"}
                disabled={busy}
                onDownload={() => setConfirmAction({ type: "report", reportType: "financial" })}
              >
                <div className="grid grid-cols-2 gap-2">
                  <MonthSelect label="เดือน" value={finMonth} onChange={setFinMonth} />
                  <YearSelect label="ปี" value={finYear} onChange={setFinYear} />
                </div>
              </ReportCard>

              {/* Stock */}
              <ReportCard
                icon={<Package className="h-4 w-4" />}
                title="รายงานสต็อก"
                description="มูลค่า ความเคลื่อนไหว แจ้งเติม"
                format="XLSX"
                exporting={reportExporting === "stock"}
                disabled={busy}
                onDownload={() => setConfirmAction({ type: "report", reportType: "stock" })}
              >
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-0.5">จากวันที่</label>
                    <input type="date" value={stockFrom} onChange={(e) => setStockFrom(e.target.value)} className="w-full rounded-md border border-[#E8E6DF] bg-white px-2 py-1.5 text-xs focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-0.5">ถึงวันที่</label>
                    <input type="date" value={stockTo} onChange={(e) => setStockTo(e.target.value)} className="w-full rounded-md border border-[#E8E6DF] bg-white px-2 py-1.5 text-xs focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20" />
                  </div>
                </div>
              </ReportCard>
            </div>
          </div>
        </Card>
      </div>

      <Modal open={!!confirmAction} onClose={() => setConfirmAction(null)} title="ยืนยันการดาวน์โหลด">
        {confirmAction?.type === "preset" && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">คุณต้องการดาวน์โหลดเอกสารต่อไปนี้หรือไม่?</p>
            <div className="rounded-lg bg-gray-50 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">ประเภท:</span><span>{confirmAction.preset.label}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">เดือน:</span><span>{selectedMonthLabel}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">จำนวน:</span><span>{counts[confirmAction.preset.key] ?? 0} ฉบับ</span></div>
              <div className="flex justify-between"><span className="text-gray-500">รูปแบบ:</span><span>{copyType === "original" ? "ต้นฉบับ" : "ต้นฉบับ + สำเนา"}</span></div>
            </div>
          </div>
        )}
        {confirmAction?.type === "custom" && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">คุณต้องการดาวน์โหลดเอกสารตามเงื่อนไขต่อไปนี้หรือไม่?</p>
            <div className="rounded-lg bg-gray-50 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">ประเภท:</span><span>{docTypeLabels[customDocType]?.th}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">เดือน:</span><span>{MONTH_LABELS[customMonth - 1]} {customYear + 543}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">จำนวน:</span><span>{confirmAction.count} ฉบับ</span></div>
              <div className="flex justify-between"><span className="text-gray-500">รูปแบบ:</span><span>{copyType === "original" ? "ต้นฉบับ" : "ต้นฉบับ + สำเนา"}</span></div>
            </div>
          </div>
        )}
        {confirmAction?.type === "report" && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">คุณต้องการดาวน์โหลดรายงานนี้หรือไม่?</p>
            <div className="rounded-lg bg-gray-50 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">รายงาน:</span><span>{confirmAction.reportType === "financial" ? "รายงานการเงิน" : "รายงานสต็อก"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">รูปแบบ:</span><span>XLSX</span></div>
              {confirmAction.reportType === "financial" && (
                <div className="flex justify-between"><span className="text-gray-500">รอบ:</span><span>{MONTH_LABELS[finMonth - 1]} {finYear + 543}</span></div>
              )}
              {confirmAction.reportType === "stock" && (
                <div className="flex justify-between"><span className="text-gray-500">ช่วงวันที่:</span><span>{stockFrom} ถึง {stockTo}</span></div>
              )}
            </div>
          </div>
        )}
        <div className="flex gap-2 justify-end pt-3 border-t border-gray-100 mt-4">
          <Button variant="secondary" onClick={() => setConfirmAction(null)}>ยกเลิก</Button>
          <Button variant="primary" onClick={() => {
            const action = confirmAction;
            setConfirmAction(null);
            if (!action) return;
            if (action.type === "preset") handlePresetDownload(action.preset.key);
            else if (action.type === "custom") handleCustomDownload();
            else if (action.type === "report") {
              if (action.reportType === "financial") handleExportFinancialCsv();
              else handleExportStockXlsx();
            }
          }}>ยืนยันดาวน์โหลด</Button>
        </div>
      </Modal>
    </AppShell>
  );
}

function getMonthRange(year: number, month: number) {
  const m = String(month).padStart(2, "0");
  const start = `${year}-${m}-01`;
  const end = `${year}-${m}-${new Date(year, month, 0).getDate()}`;
  return { start, end };
}

function CustomerQuickSelect({ value, onChange, userId }: { value: string; onChange: (id: string) => void; userId: string }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  useState(() => {
    supabase.from("customers").select("id, name, code").eq("user_id", userId).eq("is_active", true).order("name").then(({ data }) => { if (data) setCustomers(data as Customer[]); });
  });
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-[#E8E6DF] px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20">
      <option value="">ทั้งหมด</option>
      {customers.map((c) => (<option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ""}</option>))}
    </select>
  );
}

const MONTH_LABELS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

function MonthSelect({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-[10px] text-gray-500 mb-0.5">{label}</label>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full rounded-md border border-[#E8E6DF] bg-white px-2 py-1.5 text-xs focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20">
        {MONTH_LABELS.map((l, i) => (<option key={i} value={i + 1}>{l}</option>))}
      </select>
    </div>
  );
}

function YearSelect({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const now = new Date().getFullYear();
  return (
    <div>
      <label className="block text-[10px] text-gray-500 mb-0.5">{label}</label>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full rounded-md border border-[#E8E6DF] bg-white px-2 py-1.5 text-xs focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20">
        {[now - 1, now, now + 1].map((y) => (<option key={y} value={y}>{y + 543}</option>))}
      </select>
    </div>
  );
}

function ReportCard({
  icon,
  title,
  description,
  format,
  exporting,
  disabled,
  onDownload,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  format: "XLSX" | "CSV";
  exporting: boolean;
  disabled: boolean;
  onDownload: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-card-border bg-white p-4 transition-colors hover:border-primary/30 hover:bg-blue-50/30">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="shrink-0 rounded-md bg-blue-50 text-primary p-1.5">{icon}</div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[#1A1A18] truncate">{title}</div>
            <div className="text-[11px] text-gray-500 leading-snug">{description}</div>
          </div>
        </div>
        <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-mono font-semibold text-gray-600">{format}</span>
      </div>
      <div className="mt-2 flex-1">{children}</div>
      <Button size="sm" variant="primary" loading={exporting} onClick={onDownload} disabled={disabled} className="w-full mt-3">
        {!exporting && <Download className="mr-1.5 h-3.5 w-3.5" />}
        {exporting ? "กำลังสร้าง..." : "ดาวน์โหลด"}
      </Button>
    </div>
  );
}
