import { useState, useMemo, useCallback } from "react";
import { useAuth, useClientProfile } from "../../../hooks/useAuth";
import { AppShell } from "../../../components/layout/AppShell";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Input";
import { Spinner } from "../../../components/ui/Spinner";
import { useToast } from "../../../hooks/useToast";
import { supabase } from "../../../lib/supabase";
import { DOC_TYPE_LABELS } from "../../../constants";
import type { DocumentType, Customer } from "../../../types";
import { Download, FileText, FileSpreadsheet } from "lucide-react";

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

function formatDate(d: string) {
  if (!d) return "";
  const date = new Date(d);
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear() + 543}`;
}

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

function buildCsv(rows: string[][]): string {
  const BOM = "\uFEFF";
  return BOM + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export default function DownloadCenterPage() {
  const { profile } = useAuth();
  const { clientProfile } = useClientProfile(profile?.id);
  const toast = useToast();
  const userId = profile?.id;

  const [copyType, setCopyType] = useState<"original" | "both">("original");
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
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
  const [vatMonth, setVatMonth] = useState(currentMonth);
  const [vatYear, setVatYear] = useState(currentYear);

  const thisMonth = useMemo(() => {
    return `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
  }, [currentYear, currentMonth]);

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
        query = query.gte("issue_date", thisMonth);
      } else if (preset.variant === "unpaid") {
        query = query.neq("status", "paid");
      }
      const { count, error } = await query;
      if (!error && count != null) counts[preset.key] = count;
    }
    return counts;
  }, [userId, thisMonth]);

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countsLoaded, setCountsLoaded] = useState(false);

  useState(() => {
    fetchPresetCounts().then((c) => {
      if (c) setCounts(c);
      setCountsLoaded(true);
    });
  });

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
      if (preset.variant === "thisMonth") query = query.gte("issue_date", thisMonth);
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
    if (!fromDate && !toDate) { toast.error("กรุณาเลือกช่วงวันที่"); return; }
    setDownloading(true);
    setReportExporting("");
    try {
      let query = supabase
        .from("documents")
        .select("id, doc_number")
        .eq("user_id", userId)
        .eq("doc_type", customDocType)
        .in("status", NON_DRAFT_STATUSES)
        .order("issue_date", { ascending: false });
      if (fromDate) query = query.gte("issue_date", fromDate);
      if (toDate) query = query.lte("issue_date", toDate);
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

  const downloadDocsAsZip = async (docs: Array<{ id: string; doc_number: string | null }>, template: "modern" | "classic") => {
    const JSZip = (await import("jszip")).default;
    const { getPrintableDocumentDataBase, generatePDFDocument } = await import("../../../lib/print");
    const zip = new JSZip();
    setProgress({ current: 0, total: docs.length });
    const copyTypes: Array<"original" | "copy"> = copyType === "both" ? ["original", "copy"] : ["original"];
    for (let i = 0; i < docs.length; i++) {
      setProgress({ current: i + 1, total: docs.length });
      const doc = docs[i];
      try {
        const data = await getPrintableDocumentDataBase(doc.id);
        const pdfDoc = await generatePDFDocument({ ...data, template } as any, copyTypes);
        zip.file(`${doc.doc_number || `doc_${i + 1}`}.pdf`, pdfDoc.output("blob"), { binary: true });
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
    setReportExporting("financial");
    try {
      const { start, end } = getMonthRange(finYear, finMonth);
      const { data: docs } = await supabase
        .from("documents")
        .select("doc_number, doc_type, status, issue_date, total_amount, net_payable, vat_amount, wht_amount, customer:customer_id(name)")
        .eq("user_id", userId)
        .neq("doc_type", "delivery_note")
        .neq("doc_type", "credit_note")
        .neq("status", "draft")
        .neq("status", "voided")
        .neq("status", "converted")
        .order("issue_date", { ascending: true });
      if (!docs || docs.length === 0) { toast.error("ไม่พบข้อมูล"); return; }
      const rows = [["วันที่", "เลขที่", "ประเภท", "ลูกค้า", "ยอดรวม", "VAT", "WHT", "ยอดสุทธิ", "สถานะ"]];
      for (const d of docs as any[]) {
        const recDate = (d.paid_at || d.issue_date || "").slice(0, 10);
        if (recDate < start || recDate > end) continue;
        rows.push([
          formatDate(recDate),
          d.doc_number || "",
          DOC_TYPE_LABELS[d.doc_type as DocumentType]?.th || d.doc_type,
          d.customer?.name || "",
          (d.total_amount || 0).toFixed(2),
          (d.vat_amount || 0).toFixed(2),
          (d.wht_amount || 0).toFixed(2),
          (d.net_payable || 0).toFixed(2),
          d.status,
        ]);
      }
      downloadBlob(new Blob([buildCsv(rows)], { type: "text/csv;charset=utf-8" }), `financial_${finYear}-${String(finMonth).padStart(2, "0")}.csv`);
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

  const handleExportVatCsv = async () => {
    if (!userId) return;
    setReportExporting("vat");
    try {
      const { start, end } = getMonthRange(vatYear, vatMonth);
      const { data: docs } = await supabase
        .from("documents")
        .select("doc_number, issue_date, total_amount, vat_amount, net_payable, customer:customer_id(name), customer:customer_id(tax_id)")
        .eq("user_id", userId)
        .eq("doc_type", "tax_invoice_receipt")
        .in("status", ["issued", "paid"])
        .gte("issue_date", start)
        .lte("issue_date", end)
        .order("issue_date", { ascending: true });
      if (!docs || docs.length === 0) { toast.error("ไม่พบใบกำกับภาษีในช่วงนี้"); return; }
      const rows = [["วันที่", "เลขที่", "ลูกค้า", "เลขผู้เสียภาษี", "ยอดรวม", "VAT", "ยอดสุทธิ"]];
      for (const d of docs as any[]) {
        rows.push([formatDate(d.issue_date), d.doc_number || "", d.customer?.name || "", d.customer?.tax_id || "", (d.total_amount || 0).toFixed(2), (d.vat_amount || 0).toFixed(2), (d.net_payable || 0).toFixed(2)]);
      }
      downloadBlob(new Blob([buildCsv(rows)], { type: "text/csv;charset=utf-8" }), `vat_${String(vatMonth).padStart(2, "0")}_${vatYear + 543}.csv`);
      toast.success("ดาวน์โหลดเรียบร้อย");
    } catch (err: any) { toast.error(err.message); }
    finally { setReportExporting(""); }
  };

  const handleExportArCsv = async () => {
    if (!userId) return;
    setReportExporting("ar");
    try {
      const { data: unpaidBills } = await supabase
        .from("documents")
        .select("customer_id, net_payable, due_date, doc_number, customer:customer_id(name)")
        .eq("user_id", userId)
        .eq("doc_type", "billing_note")
        .in("status", ["sent", "overdue"])
        .order("due_date", { ascending: true });
      if (!unpaidBills || unpaidBills.length === 0) { toast.error("ไม่มีใบวางบิลค้างชำระ"); return; }
      const arMap = new Map<string, { name: string; total: number; count: number; oldestDue: string }>();
      const today = new Date(new Date().toISOString().slice(0, 10));
      for (const b of unpaidBills as any[]) {
        const cid = b.customer_id;
        const existing = arMap.get(cid) || { name: b.customer?.name || "", total: 0, count: 0, oldestDue: b.due_date || "" };
        existing.total += b.net_payable || 0;
        existing.count++;
        if (b.due_date && (!existing.oldestDue || b.due_date < existing.oldestDue)) existing.oldestDue = b.due_date;
        arMap.set(cid, existing);
      }
      const rows = [["ลูกค้า", "จำนวนบิล", "ยอดค้าง", "ค้างนานสุด (วัน)", "ครบกำหนดเก่าสุด"]];
      for (const [, v] of Array.from(arMap.entries()).sort((a, b) => b[1].total - a[1].total)) {
        const dueDate = v.oldestDue ? new Date(v.oldestDue) : null;
        const daysOverdue = dueDate ? Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86400000)) : 0;
        rows.push([v.name, String(v.count), v.total.toFixed(2), String(daysOverdue), v.oldestDue ? formatDate(v.oldestDue) : ""]);
      }
      downloadBlob(new Blob([buildCsv(rows)], { type: "text/csv;charset=utf-8" }), `ar_summary_${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success("ดาวน์โหลดเรียบร้อย");
    } catch (err: any) { toast.error(err.message); }
    finally { setReportExporting(""); }
  };

  if (!userId) return <AppShell title="ศูนย์ดาวน์โหลด"><Spinner /></AppShell>;

  const busy = downloading || !!reportExporting;

  return (
    <AppShell title="ศูนย์ดาวน์โหลด">
      <div className="space-y-6">
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
              <div className="text-[11px] font-semibold text-gray-500 mb-3">ดาวน์โหลดด่วน</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PRESET_TYPES.map((preset) => (
                  <button key={preset.key} type="button" disabled={busy} onClick={() => handlePresetDownload(preset.key)}
                    className="flex items-center justify-between rounded-lg border border-card-border bg-white px-4 py-3 text-left hover:border-primary/30 hover:bg-blue-50/50 transition-colors disabled:opacity-50">
                    <div className="flex items-center gap-2.5 min-w-0"><FileText className="h-4 w-4 text-gray-400 shrink-0" /><span className="text-sm text-[#1A1A18] truncate">{preset.label}</span></div>
                    <span className="text-xs text-gray-400 tabular-nums shrink-0 ml-2">{countsLoaded ? counts[preset.key] ?? 0 : "—"}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t border-card-border pt-4">
              <div className="text-[11px] font-semibold text-gray-500 mb-3">ตามเงื่อนไข</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">จากวันที่</label><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full rounded-lg border border-[#E8E6DF] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">ถึงวันที่</label><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full rounded-lg border border-[#E8E6DF] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">ประเภทเอกสาร</label><Select value={customDocType} onChange={(e) => setCustomDocType(e.target.value as DocumentType)}>{Object.entries(DOC_TYPE_LABELS).map(([key, label]) => (<option key={key} value={key}>{label.th}</option>))}</Select></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">ลูกค้า (ไม่บังคับ)</label><CustomerQuickSelect value={customCustomerId} onChange={setCustomCustomerId} userId={userId} /></div>
              </div>
              <Button onClick={handleCustomDownload} disabled={busy} loading={downloading} className="w-full mt-3">
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
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-gray-400">รายงาน</div>

            {/* Financial */}
            <div className="border-t border-card-border pt-4">
              <div className="text-[11px] font-semibold text-gray-500 mb-2">รายงานการเงิน</div>
              <div className="flex items-end gap-2 flex-wrap">
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">เดือน</label>
                  <select value={finMonth} onChange={(e) => setFinMonth(Number(e.target.value))} className="rounded-lg border border-[#E8E6DF] px-2.5 py-1.5 text-xs bg-white">
                    {["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."].map((l, i) => (<option key={i} value={i + 1}>{l}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">ปี</label>
                  <select value={finYear} onChange={(e) => setFinYear(Number(e.target.value))} className="rounded-lg border border-[#E8E6DF] px-2.5 py-1.5 text-xs bg-white">
                    {[currentYear - 1, currentYear, currentYear + 1].map((y) => (<option key={y} value={y}>{y + 543}</option>))}
                  </select>
                </div>
                <Button size="sm" variant="secondary" loading={reportExporting === "financial"} onClick={handleExportFinancialCsv} disabled={busy}>
                  <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />ดาวน์โหลด CSV
                </Button>
              </div>
            </div>

            {/* Stock */}
            <div className="border-t border-card-border pt-4">
              <div className="text-[11px] font-semibold text-gray-500 mb-2">รายงานสต็อก</div>
              <div className="flex items-end gap-2 flex-wrap">
                <div><label className="block text-[10px] text-gray-400 mb-0.5">จากวันที่</label><input type="date" value={stockFrom} onChange={(e) => setStockFrom(e.target.value)} className="rounded-lg border border-[#E8E6DF] px-2.5 py-1.5 text-xs bg-white" /></div>
                <div><label className="block text-[10px] text-gray-400 mb-0.5">ถึงวันที่</label><input type="date" value={stockTo} onChange={(e) => setStockTo(e.target.value)} className="rounded-lg border border-[#E8E6DF] px-2.5 py-1.5 text-xs bg-white" /></div>
                <Button size="sm" variant="secondary" loading={reportExporting === "stock"} onClick={handleExportStockXlsx} disabled={busy}>
                  <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />ดาวน์โหลด XLSX
                </Button>
              </div>
            </div>

            {/* VAT */}
            <div className="border-t border-card-border pt-4">
              <div className="text-[11px] font-semibold text-gray-500 mb-2">รายงานภาษีมูลค่าเพิ่ม</div>
              <div className="flex items-end gap-2 flex-wrap">
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">เดือน</label>
                  <select value={vatMonth} onChange={(e) => setVatMonth(Number(e.target.value))} className="rounded-lg border border-[#E8E6DF] px-2.5 py-1.5 text-xs bg-white">
                    {["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."].map((l, i) => (<option key={i} value={i + 1}>{l}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">ปี</label>
                  <select value={vatYear} onChange={(e) => setVatYear(Number(e.target.value))} className="rounded-lg border border-[#E8E6DF] px-2.5 py-1.5 text-xs bg-white">
                    {[currentYear - 1, currentYear, currentYear + 1].map((y) => (<option key={y} value={y}>{y + 543}</option>))}
                  </select>
                </div>
                <Button size="sm" variant="secondary" loading={reportExporting === "vat"} onClick={handleExportVatCsv} disabled={busy}>
                  <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />ดาวน์โหลด CSV
                </Button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">เฉพาะใบกำกับภาษีที่ออกแล้ว</p>
            </div>

            {/* AR */}
            <div className="border-t border-card-border pt-4">
              <div className="text-[11px] font-semibold text-gray-500 mb-2">สรุปลูกหนี้คงค้าง</div>
              <Button size="sm" variant="secondary" loading={reportExporting === "ar"} onClick={handleExportArCsv} disabled={busy}>
                <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />ดาวน์โหลด CSV
              </Button>
              <p className="text-[10px] text-gray-400 mt-1">ใบวางบิลที่ยังไม่ชำระ แยกตามลูกค้า</p>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function getMonthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1).toISOString().slice(0, 10);
  const end = new Date(year, month, 0).toISOString().slice(0, 10);
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
