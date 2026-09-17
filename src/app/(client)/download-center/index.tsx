import { useState, useMemo, useCallback, useEffect, useId } from "react";
import { useAuth, useClientProfile, useWorkspaceRole } from "../../../hooks/useAuth";
import { AppShell } from "../../../components/layout/AppShell";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Input";
import { Spinner } from "../../../components/ui/Spinner";
import { useToast } from "../../../hooks/useToast";
import { supabase } from "../../../lib/supabase";
import { DOC_TYPE_LABELS } from "../../../constants";
import { formatBuddhistDate } from "../../../lib/dates";
import type { DocumentType } from "../../../types";
import { Download, FileText, BarChart3, Package, Database, FileSpreadsheet } from "lucide-react";
import { Modal } from "../../../components/ui/Modal";
import { buildCompanyDataWorkbook } from "../../../lib/companyDataXlsx";
import { downloadBlob, datedFilename } from "../../../lib/download/download";
import { buildZipBlob, safeZipSegment } from "../../../lib/download/zip";
import { fetchDocumentPdfs } from "../../../lib/download/pdfBatch";
import { documentsCsvBlob, stockValuationCsvBlob } from "../../../lib/download/csvReports";
import { logDownload } from "../../../lib/download/audit";
import { useDownloadJob } from "../../../hooks/useDownloadJob";
import { DownloadJobBar } from "../../../components/download/DownloadJobBar";
import { FinancialExportRunner } from "../../../components/download/FinancialExportRunner";
import { TaxPackCard } from "../../../components/download/TaxPackCard";
import { WhtBatchCard } from "../../../components/download/WhtBatchCard";
import { PayrollExportCard } from "../../../components/download/PayrollExportCard";
import type { BillingNoteInvoice, Customer, Deal, Document, DocumentLineItem, Item, StockMovement } from "../../../types";

type CopyType = "original" | "both";

type RangeMode = "thisMonth" | "prevMonth" | "thisQuarter" | "ytd" | "all" | "custom";
type StatusFilter = "active" | "all" | "sent" | "paid" | "overdue";

interface BuilderDoc {
  id: string;
  doc_number: string | null;
  doc_type: string;
  issue_date: string | null;
}

type ConfirmAction =
  | { type: "preset"; preset: (typeof PRESET_TYPES)[number] }
  | { type: "builder" }
  | null;

const PRESET_TYPES: { key: string; label: string; docType: DocumentType; variant: "thisMonth" | "unpaid" }[] = [
  { key: "invoice", label: "ใบแจ้งหนี้เดือนนี้", docType: "invoice", variant: "thisMonth" },
  { key: "billing", label: "ใบวางบิลเดือนนี้", docType: "billing_note", variant: "thisMonth" },
  { key: "receipt", label: "ใบเสร็จเดือนนี้", docType: "receipt", variant: "thisMonth" },
  { key: "delivery", label: "ใบส่งของเดือนนี้", docType: "delivery_note", variant: "thisMonth" },
  { key: "billing_unpaid", label: "ใบวางบิลที่ยังไม่ชำระ", docType: "billing_note", variant: "unpaid" },
  { key: "credit", label: "ใบลดหนี้เดือนนี้", docType: "credit_note", variant: "thisMonth" },
  { key: "debit", label: "ใบเพิ่มหนี้เดือนนี้", docType: "debit_note", variant: "thisMonth" },
];

const NON_DRAFT_STATUSES = ["sent", "issued", "generated", "paid", "converted", "in_billing"];

const RANGE_MODES: { key: RangeMode; label: string }[] = [
  { key: "thisMonth", label: "เดือนนี้" },
  { key: "prevMonth", label: "เดือนก่อน" },
  { key: "thisQuarter", label: "ไตรมาสนี้" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "ทั้งหมด" },
  { key: "custom", label: "กำหนดเอง" },
];

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "active", label: "ไม่รวมฉบับร่าง" },
  { key: "all", label: "ทั้งหมด" },
  { key: "sent", label: "ส่งแล้ว" },
  { key: "paid", label: "ชำระแล้ว" },
  { key: "overdue", label: "เกินกำหนด" },
];

const STATUS_FILTER_MAP: Record<Exclude<StatusFilter, "active" | "all">, string[]> = {
  sent: ["sent", "issued", "generated", "converted", "in_billing"],
  paid: ["paid"],
  overdue: ["overdue"],
};

const MONTH_LABELS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

function getMonthRange(year: number, month: number) {
  const m = String(month).padStart(2, "0");
  return { start: `${year}-${m}-01`, end: `${year}-${m}-${new Date(year, month, 0).getDate()}` };
}

function computeRange(mode: RangeMode, customFrom: string, customTo: string): { start?: string; end?: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  switch (mode) {
    case "thisMonth":
      return getMonthRange(y, m);
    case "prevMonth": {
      const d = new Date(y, m - 2, 1);
      return getMonthRange(d.getFullYear(), d.getMonth() + 1);
    }
    case "thisQuarter": {
      const first = Math.floor((m - 1) / 3) * 3 + 1;
      const last = first + 2;
      return { start: `${y}-${String(first).padStart(2, "0")}-01`, end: `${y}-${String(last).padStart(2, "0")}-${new Date(y, last, 0).getDate()}` };
    }
    case "ytd":
      return { start: `${y}-01-01`, end: now.toISOString().slice(0, 10) };
    case "all":
      return {};
    default:
      return { start: customFrom || undefined, end: customTo || undefined };
  }
}

function docTypeLabel(type: string | undefined): string {
  if (!type) return "อื่น ๆ";
  return DOC_TYPE_LABELS[type as keyof typeof DOC_TYPE_LABELS]?.th ?? type;
}

const chipClass = (active: boolean) =>
  `rounded-full border px-3 py-1.5 text-label font-medium transition-colors ${active ? "border-primary bg-primary text-white" : "border-line bg-white text-ink-600 hover:border-line-strong"}`;

export default function DownloadCenterPage() {
  const { profile } = useAuth();
  const { workspaceRole } = useWorkspaceRole();
  const { clientProfile } = useClientProfile(profile?.id);
  const toast = useToast();
  const userId = profile?.id;

  const docsJob = useDownloadJob();
  const reportJob = useDownloadJob();
  const actorUserId = profile?.auth_user_id ?? userId;

  const [copyType, setCopyType] = useState<CopyType>("original");
  const [zipGrouping, setZipGrouping] = useState(true);
  const [mergePdf, setMergePdf] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  // Documents builder filters
  const [rangeMode, setRangeMode] = useState<RangeMode>("thisMonth");
  const [customFrom, setCustomFrom] = useState(() => {
    const now = new Date();
    return getMonthRange(now.getFullYear(), now.getMonth() + 1).start;
  });
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [builderDocType, setBuilderDocType] = useState<DocumentType>("invoice");
  const [builderCustomerId, setBuilderCustomerId] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [builderCount, setBuilderCount] = useState<number | null>(null);

  // Quick presets (this/last month)
  const [quickFilter, setQuickFilter] = useState<"thisMonth" | "prevMonth">("thisMonth");

  // Report periods / formats
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const [finPeriodMode, setFinPeriodMode] = useState<"month" | "quarter" | "ytd" | "year">("month");
  const [finMonth, setFinMonth] = useState(currentMonth);
  const [finQuarter, setFinQuarter] = useState(Math.floor(currentMonth / 3.01) + 1);
  const [finYear, setFinYear] = useState(currentYear);
  const [financialFormat, setFinancialFormat] = useState<"xlsx" | "csv">("xlsx");
  const [stockFormat, setStockFormat] = useState<"xlsx" | "csv">("xlsx");
  const [stockFrom, setStockFrom] = useState(`${currentYear}-${String(currentMonth).padStart(2, "0")}-01`);
  const [stockTo, setStockTo] = useState(new Date().toISOString().slice(0, 10));
  const [dataExporting, setDataExporting] = useState(false);
  const [financialRequest, setFinancialRequest] = useState<
    { from: string; to: string; periodLabel: string; format: "xlsx" | "csv" } | null
  >(null);

  const isVatRegistered = clientProfile?.vat_registered;

  const finRange = useMemo(() => {
    const todayISO = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    switch (finPeriodMode) {
      case "quarter": {
        const firstMonth = (finQuarter - 1) * 3 + 1;
        const lastMonth = firstMonth + 2;
        return { start: `${finYear}-${String(firstMonth).padStart(2, "0")}-01`, end: `${finYear}-${String(lastMonth).padStart(2, "0")}-${new Date(finYear, lastMonth, 0).getDate()}` };
      }
      case "ytd":
        return { start: `${finYear}-01-01`, end: finYear === currentYear ? todayISO : `${finYear}-12-31` };
      case "year":
        return { start: `${finYear}-01-01`, end: `${finYear}-12-31` };
      default:
        return getMonthRange(finYear, finMonth);
    }
  }, [finPeriodMode, finYear, finMonth, finQuarter, currentYear, currentMonth, now]);

  const finPeriodLabel = useMemo(() => {
    const fmtEnd = (() => {
      const [y, m, d] = finRange.end.split("-");
      return `${d}/${m}/${Number(y) + 543}`;
    })();
    switch (finPeriodMode) {
      case "quarter": {
        const firstMonth = (finQuarter - 1) * 3 + 1;
        return `ไตรมาส ${finQuarter} (${MONTH_LABELS[firstMonth - 1]}–${MONTH_LABELS[firstMonth + 1]} ${finYear + 543})`;
      }
      case "ytd":
        return `ตั้งแต่ต้นปี ${finYear + 543} (ถึง ${fmtEnd})`;
      case "year":
        return `ทั้งปี ${finYear + 543} (ม.ค.–ธ.ค.)`;
      default:
        return `${THAI_MONTHS[finMonth - 1]} ${finYear + 543}`;
    }
  }, [finPeriodMode, finYear, finMonth, finQuarter, finRange]);

  // Quick preset month (this/last)
  const quickMonth = useMemo(() => {
    const d = new Date(currentYear, currentMonth - 1, 1);
    if (quickFilter === "prevMonth") d.setMonth(d.getMonth() - 1);
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  }, [currentYear, currentMonth, quickFilter]);
  const quickRange = useMemo(() => getMonthRange(quickMonth.year, quickMonth.month), [quickMonth]);
  const selectedMonthLabel = `${THAI_MONTHS[quickMonth.month - 1]} ${quickMonth.year + 543}`;
  const monthSuffix = MONTH_LABELS[quickMonth.month - 1];

  const presetTypes = useMemo(
    () =>
      PRESET_TYPES.map((p) => {
        let label = p.label;
        if (p.key === "invoice" && isVatRegistered) label = "ใบกำกับภาษีเดือนนี้";
        if (p.variant === "thisMonth") label = label.replace("เดือนนี้", `(${monthSuffix})`);
        return { ...p, label };
      }),
    [isVatRegistered, monthSuffix],
  );

  const docTypeLabels = useMemo(() => {
    const labels = { ...DOC_TYPE_LABELS };
    if (isVatRegistered) labels.invoice = { th: "ใบกำกับภาษี", en: "Tax Invoice" };
    return labels;
  }, [isVatRegistered]);

  // --- preset counts ---
  const fetchPresetCounts = useCallback(async () => {
    if (!userId) return {} as Record<string, number>;
    const entries = await Promise.all(
      PRESET_TYPES.map(async (preset) => {
        let query = supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("doc_type", preset.docType)
          .in("status", NON_DRAFT_STATUSES);
        if (preset.variant === "thisMonth") {
          query = query.gte("issue_date", quickRange.start).lte("issue_date", quickRange.end);
        } else if (preset.variant === "unpaid") {
          query = query.neq("status", "paid");
        }
        const { count, error } = await query;
        return [preset.key, !error && count != null ? count : 0] as const;
      }),
    );
    return Object.fromEntries(entries) as Record<string, number>;
  }, [userId, quickRange.start, quickRange.end]);

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countsLoaded, setCountsLoaded] = useState(false);

  useEffect(() => {
    setCountsLoaded(false);
    let cancelled = false;
    fetchPresetCounts().then((c) => {
      if (cancelled) return;
      setCounts(c);
      setCountsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchPresetCounts]);

  // --- documents builder filter application ---
  const builderRange = useMemo(() => computeRange(rangeMode, customFrom, customTo), [rangeMode, customFrom, customTo]);

  const applyBuilderFilters = useCallback(
     
    (query: any): any => {
      let q = query.eq("user_id", userId).eq("doc_type", builderDocType);
      if (builderCustomerId) q = q.eq("customer_id", builderCustomerId);
      if (builderRange.start) q = q.gte("issue_date", builderRange.start);
      if (builderRange.end) q = q.lte("issue_date", builderRange.end);
      if (statusFilter === "active") q = q.in("status", NON_DRAFT_STATUSES);
      else if (statusFilter !== "all") q = q.in("status", STATUS_FILTER_MAP[statusFilter]);
      return q;
    },
    [userId, builderDocType, builderCustomerId, builderRange.start, builderRange.end, statusFilter],
  );

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setBuilderCount(null);
    const load = async () => {
      const { count } = await applyBuilderFilters(
        supabase.from("documents").select("id", { count: "exact", head: true }),
      );
      if (!cancelled) setBuilderCount(count ?? 0);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, applyBuilderFilters]);

  // --- document job engine ---
  const runDocumentsJob = async (
    docs: BuilderDoc[],
    meta: { kind: string; params: Record<string, unknown>; artifactLabel: string },
  ) => {
    if (!userId || !clientProfile) return;
    const copyTypes: Array<"original" | "copy"> = copyType === "both" ? ["original", "copy"] : ["original"];
    const docTypeById = new Map(docs.map((d) => [d.id, d.doc_type]));
    await docsJob.run(async ({ signal, onProgress }) => {
      const results = await fetchDocumentPdfs(docs, {
        copyTypes,
        companyName: clientProfile.company_name_th ?? null,
        signal,
        onProgress,
      });
      if (signal.aborted) throw new Error("ยกเลิกการดาวน์โหลดแล้ว");
      const ok = results.filter((r) => r.ok && r.blob);
      const failed = results.filter((r) => !r.ok);
      const canMerge = mergePdf && copyTypes.length === 1;

      let artifact = "";
      let format = "pdf_zip";
      if (ok.length > 0 && canMerge) {
        const { mergePdfBlobs } = await import("../../../lib/download/pdfMerge");
        const merged = await mergePdfBlobs(ok.map((r) => r.blob as Blob));
        artifact = datedFilename("documents_merged", "pdf");
        downloadBlob(merged, artifact);
        format = "pdf";
      } else if (ok.length > 0) {
        const entries = ok.map((r) => ({
          path: zipGrouping ? `${safeZipSegment(docTypeLabel(docTypeById.get(r.id)))}/${r.filename}` : r.filename,
          blob: r.blob as Blob,
        }));
        artifact = datedFilename("documents", "zip");
        downloadBlob(await buildZipBlob(entries), artifact);
      }

      await logDownload({
        workspaceUserId: userId,
        actorUserId,
        kind: meta.kind,
        format,
        params: { ...meta.params, copyType, grouping: zipGrouping, merge: canMerge, artifactLabel: meta.artifactLabel },
        fileCount: ok.length,
        status: failed.length === 0 ? "success" : ok.length === 0 ? "failed" : "partial",
        error: failed.length > 0 ? `${failed.length} ไฟล์ล้มเหลว` : undefined,
      });

      return {
        total: results.length,
        succeeded: ok.length,
        failed: failed.length,
        artifact,
        failures: failed.map((r) => ({ label: r.filename, error: r.error })),
      };
    });
  };

  const handlePresetDownload = async (presetKey: string) => {
    if (!userId || !clientProfile) return;
    const preset = PRESET_TYPES.find((p) => p.key === presetKey);
    if (!preset) return;
    let query = supabase
      .from("documents")
      .select("id, doc_number, issue_date, doc_type")
      .eq("user_id", userId)
      .eq("doc_type", preset.docType)
      .in("status", NON_DRAFT_STATUSES)
      .order("issue_date", { ascending: false });
    if (preset.variant === "thisMonth") query = query.gte("issue_date", quickRange.start).lte("issue_date", quickRange.end);
    else if (preset.variant === "unpaid") query = query.neq("status", "paid");
    const { data: docs, error } = await query;
    if (error) {
      toast.error("โหลดรายการเอกสารไม่สำเร็จ");
      return;
    }
    if (!docs || docs.length === 0) {
      toast.error("ไม่พบเอกสาร");
      return;
    }
    await runDocumentsJob(docs as BuilderDoc[], {
      kind: "documents",
      params: { source: "preset", preset: preset.key, period: selectedMonthLabel },
      artifactLabel: preset.label,
    });
  };

  const handleBuilderDownload = async () => {
    if (!userId || !clientProfile) return;
    const { data: docs, error } = await applyBuilderFilters(
      supabase.from("documents").select("id, doc_number, issue_date, doc_type").order("issue_date", { ascending: false }),
    );
    if (error) {
      toast.error("โหลดรายการเอกสารไม่สำเร็จ");
      return;
    }
    if (!docs || docs.length === 0) {
      toast.error("ไม่พบเอกสารตามเงื่อนไข");
      return;
    }
    await runDocumentsJob(docs as BuilderDoc[], {
      kind: "documents",
      params: { source: "builder", doc_type: builderDocType, range: builderRange, status: statusFilter, customer: builderCustomerId || null },
      artifactLabel: "เอกสารตามเงื่อนไข",
    });
  };

  const handleBuilderCsv = async () => {
    if (!userId) return;
    const { data: docs, error } = await applyBuilderFilters(
      supabase
        .from("documents")
        .select("id, doc_number, doc_type, status, issue_date, due_date, subtotal, vat_amount, wht_amount, total_amount, net_payable, paid_at, customer:customer_id(name)")
        .order("issue_date", { ascending: false }),
    );
    if (error) {
      toast.error("โหลดรายการเอกสารไม่สำเร็จ");
      return;
    }
    if (!docs || docs.length === 0) {
      toast.error("ไม่พบเอกสารตามเงื่อนไข");
      return;
    }
    const rows = (docs as Array<Record<string, unknown>>).map((doc) => ({
      ...(doc as unknown as { doc_number: string | null; doc_type: string; status: string; issue_date: string | null }),
      customer_name: (doc as { customer?: { name?: string } }).customer?.name ?? "",
    }));
    downloadBlob(documentsCsvBlob(rows), datedFilename("documents_export", "csv"));
    await logDownload({
      workspaceUserId: userId,
      actorUserId,
      kind: "documents",
      format: "csv",
      params: { source: "builder", doc_type: builderDocType, range: builderRange, status: statusFilter },
      fileCount: rows.length,
      status: "success",
    });
    toast.success(`ส่งออก ${rows.length} รายการเรียบร้อย`);
  };

  // --- report handlers ---
  const handleFinancialExport = (format: "xlsx" | "csv") => {
    if (!userId) return;
    reportJob.reset();
    setFinancialRequest({ from: finRange.start, to: finRange.end, periodLabel: finPeriodLabel, format });
  };

  const handleStockExport = (format: "xlsx" | "csv") => {
    if (!userId) return;
    reportJob.reset();
    void reportJob.run(async () => {
      const { fetchFullStockReport } = await import("../../../hooks/useReports");
      const data = await fetchFullStockReport(userId, stockFrom, stockTo);
      if (format === "csv") {
        downloadBlob(stockValuationCsvBlob(data.valuation), datedFilename(`stock_${stockFrom}_${stockTo}`, "csv"));
      } else {
        const { buildStockReportXlsx } = await import("../../../lib/stockReportXlsx");
        const buffer = await buildStockReportXlsx({ ...data, dateFrom: stockFrom, dateTo: stockTo });
        downloadBlob(
          new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
          `stock_${stockFrom}_to_${stockTo}.xlsx`,
        );
      }
      await logDownload({
        workspaceUserId: userId,
        actorUserId,
        kind: "report_stock",
        format,
        params: { from: stockFrom, to: stockTo },
        status: "success",
      });
      return { total: 1, succeeded: 1, failed: 0 };
    });
  };

  async function handleCompanyDataExport() {
    if (!userId || workspaceRole !== "owner" || dataExporting) return;
    setDataExporting(true);
    try {
      const [customersRes, itemsRes, dealsRes, documentsRes, movementsRes] = await Promise.all([
        supabase.from("customers").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
        supabase.from("items").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
        supabase.from("deals").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
        supabase.from("documents").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
        supabase.from("stock_movements").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
      ]);
      const firstError = [customersRes, itemsRes, dealsRes, documentsRes, movementsRes].find((result) => result.error)?.error;
      if (firstError) throw firstError;

      const documents = (documentsRes.data || []) as Document[];
      const documentIds = documents.map((document) => document.id);
      const billingNoteIds = documents.filter((document) => document.doc_type === "billing_note").map((document) => document.id);
      const [{ data: lineItems, error: lineItemsError }, { data: billingLinks, error: billingLinksError }] = await Promise.all([
        documentIds.length ? supabase.from("document_line_items").select("*").in("document_id", documentIds) : Promise.resolve({ data: [], error: null }),
        billingNoteIds.length ? supabase.from("billing_note_invoices").select("*").in("billing_note_id", billingNoteIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (lineItemsError) throw lineItemsError;
      if (billingLinksError) throw billingLinksError;

      const buffer = await buildCompanyDataWorkbook({
        profile: clientProfile,
        customers: (customersRes.data || []) as Customer[],
        items: (itemsRes.data || []) as Item[],
        deals: (dealsRes.data || []) as Deal[],
        documents,
        lineItems: (lineItems || []) as DocumentLineItem[],
        billingLinks: (billingLinks || []) as BillingNoteInvoice[],
        stockMovements: (movementsRes.data || []) as StockMovement[],
      });
      downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), datedFilename("company-data", "xlsx"));
      await logDownload({ workspaceUserId: userId, actorUserId, kind: "backup", format: "xlsx", params: { scope: "company-data" }, status: "success" });
      toast.success("ส่งออกข้อมูลบริษัทเรียบร้อยแล้ว");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ส่งออกข้อมูลบริษัทไม่สำเร็จ");
    } finally {
      setDataExporting(false);
    }
  }

  if (!userId) {
    return (
      <AppShell title="ศูนย์ดาวน์โหลด">
        <Spinner />
      </AppShell>
    );
  }

  const busy = docsJob.status === "running" || reportJob.status === "running";

  const confirmCount =
    confirmAction?.type === "preset" ? counts[confirmAction.preset.key] ?? 0 : builderCount ?? 0;

  return (
    <AppShell title="ศูนย์ดาวน์โหลด">
      <div className="space-y-6">
        {/* Quick presets */}
        <Card>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-control bg-primary-soft text-primary">
                  <Download className="h-4 w-4" />
                </span>
                <span className="text-label font-semibold text-ink-400">ดาวน์โหลดด่วน</span>
              </div>
              <div className="flex gap-1">
                <button type="button" onClick={() => setQuickFilter("thisMonth")} className={chipClass(quickFilter === "thisMonth")}>เดือนนี้</button>
                <button type="button" onClick={() => setQuickFilter("prevMonth")} className={chipClass(quickFilter === "prevMonth")}>เดือนก่อน</button>
              </div>
            </div>
            <div className="text-label text-ink-400">{selectedMonthLabel}</div>
            <div className="grid gap-2 grid-cols-2 lg:grid-cols-3 3xl:grid-cols-4">
              {presetTypes.map((preset) => {
                const count = counts[preset.key] ?? 0;
                const empty = countsLoaded && count === 0;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    disabled={busy || empty}
                    onClick={() => setConfirmAction({ type: "preset", preset })}
                    title={empty ? "ไม่มีเอกสารในช่วงนี้" : undefined}
                    className="group flex items-center justify-between rounded-control border border-card-border bg-white px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 disabled:translate-y-0 disabled:opacity-50 disabled:hover:shadow-none"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-ink-400 group-hover:text-primary" />
                      <span className="truncate text-body text-ink-900">{preset.label}</span>
                    </div>
                    <span className="ml-2 shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-label font-medium tabular-nums text-primary-deep">
                      {countsLoaded ? count : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        <DownloadJobBar state={docsJob} onCancel={docsJob.cancel} onDismiss={docsJob.reset} />
        <DownloadJobBar state={reportJob} onCancel={reportJob.cancel} onDismiss={reportJob.reset} />

        {/* Documents builder */}
        <Card>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-control bg-primary-soft text-primary">
                <FileText className="h-4 w-4" />
              </span>
              <div>
                <div className="text-label font-semibold text-ink-400">เอกสารตามเงื่อนไข</div>
                <div className="text-label text-ink-400">รวม PDF เป็น ZIP หรือรวมเป็นไฟล์เดียว</div>
              </div>
            </div>

            <div>
              <div className="mb-2 text-label font-semibold text-ink-500">ช่วงวันที่</div>
              <div className="flex flex-wrap gap-1.5">
                {RANGE_MODES.map((mode) => (
                  <button key={mode.key} type="button" onClick={() => setRangeMode(mode.key)} className={chipClass(rangeMode === mode.key)}>
                    {mode.label}
                  </button>
                ))}
              </div>
              {rangeMode === "custom" && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="builder-from" className="mb-0.5 block text-label text-ink-500">จากวันที่</label>
                    <input id="builder-from" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-full rounded-control border border-card-border bg-white px-2 py-1.5 text-label focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                  <div>
                    <label htmlFor="builder-to" className="mb-0.5 block text-label text-ink-500">ถึงวันที่</label>
                    <input id="builder-to" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-full rounded-control border border-card-border bg-white px-2 py-1.5 text-label focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="ประเภทเอกสาร" value={builderDocType} onChange={(e) => setBuilderDocType(e.target.value as DocumentType)}>
                {Object.entries(docTypeLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label.th}</option>
                ))}
              </Select>
              <CustomerQuickSelect value={builderCustomerId} onChange={setBuilderCustomerId} userId={userId} />
            </div>

            <div>
              <div className="mb-2 text-label font-semibold text-ink-500">สถานะ</div>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_FILTERS.map((status) => (
                  <button key={status.key} type="button" onClick={() => setStatusFilter(status.key)} className={chipClass(statusFilter === status.key)}>
                    {status.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-control border border-card-border bg-paper-field px-3 py-2 text-label text-ink-700">
                <input type="checkbox" checked={zipGrouping} onChange={(e) => setZipGrouping(e.target.checked)} className="h-3.5 w-3.5 rounded border-line text-primary focus:ring-primary" />
                จัดโฟลเดอร์ใน ZIP ตามประเภทเอกสาร
              </label>
              <label className={`flex cursor-pointer items-center gap-2 rounded-control border border-card-border px-3 py-2 text-label ${copyType === "both" ? "bg-paper-field text-ink-400" : "bg-paper-field text-ink-700"}`}>
                <input type="checkbox" checked={mergePdf} disabled={copyType === "both"} onChange={(e) => setMergePdf(e.target.checked)} className="h-3.5 w-3.5 rounded border-line text-primary focus:ring-primary disabled:opacity-50" />
                รวมเป็น PDF ไฟล์เดียว {copyType === "both" && "(ไม่ใช้กับต้นฉบับ+สำเนา)"}
              </label>
            </div>

            <div>
              <div className="mb-2 text-label font-semibold text-ink-500">รูปแบบสำเนา</div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setCopyType("original")} className={chipClass(copyType === "original")}>ต้นฉบับ</button>
                <button type="button" onClick={() => setCopyType("both")} className={chipClass(copyType === "both")}>ต้นฉบับ + สำเนา</button>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-card-border pt-4 sm:flex-row">
              <Button onClick={() => setConfirmAction({ type: "builder" })} disabled={busy || builderCount === 0} className="flex-1">
                <Download className="mr-2 h-4 w-4" />
                {mergePdf && copyType === "original" ? "รวมเป็น PDF ไฟล์เดียว" : "ดาวน์โหลดเป็น ZIP"}
                {builderCount != null ? ` (${builderCount})` : ""}
              </Button>
              <Button variant="secondary" onClick={handleBuilderCsv} disabled={busy || builderCount === 0} className="sm:w-48">
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                ดาวน์โหลด CSV
              </Button>
            </div>
            {builderCount === 0 && <div className="text-label text-ink-400">ไม่พบเอกสารตามเงื่อนไขที่เลือก</div>}
          </div>
        </Card>

        {/* Reports */}
        <Card>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-control bg-primary-soft text-primary">
                  <BarChart3 className="h-4 w-4" />
                </span>
                <span className="text-label font-semibold text-ink-400">รายงาน</span>
              </div>
              <span className="text-label text-ink-400">XLSX / CSV</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <ReportCard
                icon={<BarChart3 className="h-4 w-4" />}
                title="รายงานการเงิน"
                description="ยอดขาย ลูกหนี้ รายการธุรกรรม"
                exporting={reportJob.status === "running" && financialRequest != null}
                disabled={busy}
                onDownload={() => handleFinancialExport(financialFormat)}
                formatToggle={
                  <FormatToggle value={financialFormat} onChange={setFinancialFormat} />
                }
              >
                <div className="mb-2 flex flex-wrap gap-1">
                  {([["month", "เดือน"], ["quarter", "ไตรมาส"], ["ytd", "YTD"], ["year", "ทั้งปี"]] as const).map(([mode, label]) => (
                    <button key={mode} type="button" onClick={() => setFinPeriodMode(mode)} className={chipClass(finPeriodMode === mode)}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {finPeriodMode === "month" && <MonthSelect label="เดือน" value={finMonth} onChange={setFinMonth} />}
                  {finPeriodMode === "quarter" && (
                    <div>
                      <label htmlFor="download-fin-quarter" className="mb-0.5 block text-label text-ink-500">ไตรมาส</label>
                      <select id="download-fin-quarter" value={finQuarter} onChange={(e) => setFinQuarter(Number(e.target.value))} className="w-full rounded-control border border-card-border bg-white px-2 py-1.5 text-label focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
                        {[1, 2, 3, 4].map((q) => (<option key={q} value={q}>Q{q}</option>))}
                      </select>
                    </div>
                  )}
                  <YearSelect label="ปี" value={finYear} onChange={setFinYear} />
                </div>
                <div className="mt-1.5 text-label text-ink-400">{finPeriodLabel}</div>
              </ReportCard>

              <ReportCard
                icon={<Package className="h-4 w-4" />}
                title="รายงานสต็อก"
                description="มูลค่า ความเคลื่อนไหว แจ้งเติม"
                exporting={reportJob.status === "running" && financialRequest == null}
                disabled={busy}
                onDownload={() => handleStockExport(stockFormat)}
                formatToggle={<FormatToggle value={stockFormat} onChange={setStockFormat} />}
              >
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="download-stock-from" className="mb-0.5 block text-label text-ink-500">จากวันที่</label>
                    <input id="download-stock-from" type="date" value={stockFrom} onChange={(e) => setStockFrom(e.target.value)} className="w-full rounded-control border border-card-border bg-white px-2 py-1.5 text-label focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                  <div>
                    <label htmlFor="download-stock-to" className="mb-0.5 block text-label text-ink-500">ถึงวันที่</label>
                    <input id="download-stock-to" type="date" value={stockTo} onChange={(e) => setStockTo(e.target.value)} className="w-full rounded-control border border-card-border bg-white px-2 py-1.5 text-label focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                </div>
              </ReportCard>
            </div>
          </div>
        </Card>

        {/* Tax, WHT, payroll */}
        <div>
          <div className="mb-2 text-label font-semibold text-ink-400">ภาษีและเงินเดือน</div>
          <div className="grid gap-3 lg:grid-cols-2">
            <TaxPackCard />
            <div className="space-y-3">
              <WhtBatchCard />
              <PayrollExportCard />
            </div>
          </div>
        </div>

        {/* Backup & data (owner) */}
        {workspaceRole === "owner" && (
          <Card>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary">
                  <Database className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-body font-semibold text-ink-900">สำรองข้อมูลและส่งออก</div>
                  <p className="mt-1 text-label leading-5 text-ink-500">ดาวน์โหลดสำเนาข้อมูลบริษัทไว้เปิดใน Excel การส่งออกจะไม่ลบหรือเปลี่ยนแปลงข้อมูลในระบบ</p>
                  <div className="mt-1 text-label text-ink-400">รวมข้อมูลบริษัท ลูกค้า สินค้า งานขาย เอกสาร รายการเอกสาร ใบวางบิล และสต็อก</div>
                </div>
              </div>
              <Button onClick={handleCompanyDataExport} loading={dataExporting} disabled={dataExporting} className="shrink-0">
                {dataExporting ? "กำลังสร้างไฟล์..." : "ดาวน์โหลดข้อมูลทั้งหมด (Excel)"}
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* Lazy financial report runner */}
      {financialRequest && clientProfile && (
        <FinancialExportRunner
          key={`fin-${financialRequest.from}-${financialRequest.to}-${financialRequest.format}`}
          userId={userId}
          workspaceUserId={userId}
          actorUserId={actorUserId}
          from={financialRequest.from}
          to={financialRequest.to}
          periodLabel={financialRequest.periodLabel}
          format={financialRequest.format}
          companyName={clientProfile.company_name_th ?? undefined}
          vatRegistered={Boolean(isVatRegistered)}
          run={reportJob.run}
          onDone={() => setFinancialRequest(null)}
        />
      )}

      <Modal open={!!confirmAction} onClose={() => setConfirmAction(null)} title="ยืนยันการดาวน์โหลด">
        {confirmAction?.type === "preset" && (
          <div className="space-y-3">
            <p className="text-body text-ink-600">คุณต้องการดาวน์โหลดเอกสารต่อไปนี้หรือไม่?</p>
            <div className="space-y-1.5 rounded-control bg-paper-field p-3 text-body">
              <div className="flex justify-between"><span className="text-ink-500">ประเภท:</span><span>{confirmAction.preset.label}</span></div>
              <div className="flex justify-between"><span className="text-ink-500">เดือน:</span><span>{selectedMonthLabel}</span></div>
              <div className="flex justify-between"><span className="text-ink-500">จำนวน:</span><span>{confirmCount} ฉบับ</span></div>
              <div className="flex justify-between"><span className="text-ink-500">รูปแบบ:</span><span>{copyType === "original" ? "ต้นฉบับ" : "ต้นฉบับ + สำเนา"}</span></div>
            </div>
          </div>
        )}
        {confirmAction?.type === "builder" && (
          <div className="space-y-3">
            <p className="text-body text-ink-600">ยืนยันการสร้างไฟล์ตามเงื่อนไข</p>
            <div className="space-y-1.5 rounded-control bg-paper-field p-3 text-body">
              <div className="flex justify-between"><span className="text-ink-500">ประเภท:</span><span>{docTypeLabels[builderDocType]?.th}</span></div>
              <div className="flex justify-between"><span className="text-ink-500">ช่วงวันที่:</span><span>{builderRange.start ? formatBuddhistDate(builderRange.start) : "ทั้งหมด"}{builderRange.end ? ` – ${formatBuddhistDate(builderRange.end)}` : ""}</span></div>
              <div className="flex justify-between"><span className="text-ink-500">สถานะ:</span><span>{STATUS_FILTERS.find((s) => s.key === statusFilter)?.label}</span></div>
              <div className="flex justify-between"><span className="text-ink-500">จำนวน:</span><span>{confirmCount} ฉบับ</span></div>
              <div className="flex justify-between"><span className="text-ink-500">รูปแบบ:</span><span>{mergePdf && copyType === "original" ? "รวมเป็น PDF ไฟล์เดียว" : zipGrouping ? "ZIP (แยกโฟลเดอร์)" : "ZIP"}{copyType === "both" ? " · ต้นฉบับ + สำเนา" : ""}</span></div>
            </div>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2 border-t border-line-faint pt-3">
          <Button variant="secondary" onClick={() => setConfirmAction(null)}>ยกเลิก</Button>
          <Button
            variant="primary"
            onClick={() => {
              const action = confirmAction;
              setConfirmAction(null);
              if (!action) return;
              if (action.type === "preset") handlePresetDownload(action.preset.key);
              else if (action.type === "builder") handleBuilderDownload();
            }}
          >
            ยืนยันดาวน์โหลด
          </Button>
        </div>
      </Modal>
    </AppShell>
  );
}

function FormatToggle({ value, onChange }: { value: "xlsx" | "csv"; onChange: (v: "xlsx" | "csv") => void }) {
  return (
    <div className="mb-2 inline-flex overflow-hidden rounded-control border border-card-border">
      {(["xlsx", "csv"] as const).map((format) => (
        <button
          key={format}
          type="button"
          onClick={() => onChange(format)}
          className={`px-2.5 py-1 text-label font-semibold transition-colors ${value === format ? "bg-primary text-white" : "bg-white text-ink-500 hover:bg-paper-field"}`}
        >
          {format}
        </button>
      ))}
    </div>
  );
}

function CustomerQuickSelect({ value, onChange, userId }: { value: string; onChange: (id: string) => void; userId: string }) {
  const selectId = useId();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("customers")
      .select("id, name, code")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("name")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setLoadError(true);
          return;
        }
        setCustomers((data ?? []) as Customer[]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div>
      <label htmlFor={selectId} className="mb-1 block text-label font-medium text-ink-600">ลูกค้า (ไม่บังคับ)</label>
      <select id={selectId} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-control border border-card-border bg-white px-3 py-2 text-body focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
        <option value="">ทั้งหมด</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ""}</option>
        ))}
      </select>
      {loadError && <p className="mt-1 text-label text-red-500">โหลดรายชื่อลูกค้าไม่สำเร็จ</p>}
    </div>
  );
}

function MonthSelect({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const selectId = useId();
  return (
    <div>
      <label htmlFor={selectId} className="mb-0.5 block text-label text-ink-500">{label}</label>
      <select id={selectId} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full rounded-control border border-card-border bg-white px-2 py-1.5 text-label focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
        {MONTH_LABELS.map((l, i) => (<option key={i} value={i + 1}>{l}</option>))}
      </select>
    </div>
  );
}

function YearSelect({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const selectId = useId();
  const nowYear = new Date().getFullYear();
  return (
    <div>
      <label htmlFor={selectId} className="mb-0.5 block text-label text-ink-500">{label}</label>
      <select id={selectId} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full rounded-control border border-card-border bg-white px-2 py-1.5 text-label focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
        {[nowYear - 1, nowYear, nowYear + 1].map((y) => (<option key={y} value={y}>{y + 543}</option>))}
      </select>
    </div>
  );
}

function ReportCard({
  icon,
  title,
  description,
  formatToggle,
  exporting,
  disabled,
  onDownload,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  formatToggle: React.ReactNode;
  exporting: boolean;
  disabled: boolean;
  onDownload: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-control border border-card-border bg-white p-4 transition-colors hover:border-primary/30 hover:bg-blue-50/30">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="shrink-0 rounded-control bg-blue-50 p-1.5 text-primary">{icon}</div>
          <div className="min-w-0">
            <div className="truncate text-body font-semibold text-ink-900">{title}</div>
            <div className="text-label leading-snug text-ink-500">{description}</div>
          </div>
        </div>
      </div>
      <div className="mt-2 flex-1">
        {formatToggle}
        {children}
      </div>
      <Button size="sm" variant="primary" loading={exporting} onClick={onDownload} disabled={disabled} className="mt-3 w-full">
        {!exporting && <Download className="mr-1.5 h-3.5 w-3.5" />}
        {exporting ? "กำลังสร้าง..." : "ดาวน์โหลด"}
      </Button>
    </div>
  );
}
