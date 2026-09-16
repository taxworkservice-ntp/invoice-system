import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Search,
  SlidersHorizontal,
  X,
  XCircle,
} from "lucide-react";
import { AppShell } from "../../../components/layout/AppShell";
import { Select } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { Modal } from "../../../components/ui/Modal";
import { EmptyState } from "../../../components/ui/EmptyState";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { DocumentRow } from "../../../components/documents/DocumentRow";
import { DocumentFilterSheet } from "../../../components/documents/DocumentFilterSheet";
import { ActiveFilterChips } from "../../../components/documents/ActiveFilterChips";
import { SavedViewsMenu } from "../../../components/documents/SavedViewsMenu";
import { useDocuments } from "../../../hooks/useDocuments";
import { useClientProfile, useWorkspaceRole } from "../../../hooks/useAuth";
import { useToast } from "../../../hooks/useToast";
import { supabase } from "../../../lib/supabase";
import { warmPdfCache } from "../../../lib/pdfWarm";
import { confirmDraftReceipt } from "../../../lib/receiptConfirm";
import { sendDocumentWithSideEffects } from "../../../lib/documentSend";
import { voidDocumentWithSideEffects } from "../../../lib/documentVoid";
import { copyDocumentAsDraft } from "../../../lib/documentCopy";
import { deleteDraftDocument } from "../../../lib/documentDelete";
import { isDocumentOverdue } from "../../../lib/dealStatus";
import {
  EMPTY_FILTERS,
  countActiveFilters,
  getDocumentDisplayAmount,
  matchesDocumentFilters,
  sortDocuments,
  type AgingBucket,
  type DocumentFilters,
  type DocumentSort,
} from "../../../lib/documentFilters";
import {
  deleteView,
  readSavedViews,
  saveView,
  type SavedDocumentView,
} from "../../../lib/savedDocumentViews";
import { businessTodayString } from "../../../lib/devDate";
import { buildCsvBlob, datedFilename, downloadBlob } from "../../../lib/download/download";
import { DOC_TYPE_LABELS, STATUS_LABELS } from "../../../constants";
import { formatCurrency } from "../../../lib/format";
import {
  canSendDocumentType,
  getWorkspacePermissions,
  type WorkspacePermissions,
} from "../../../lib/permissions";
import type { DocumentActionId } from "../../../lib/documentActions";
import type { Document, DocumentStatus as DocStatus, DocumentType } from "../../../types";

export const DOC_TYPE_FILTERS: { label: string; value: DocumentType | "all" }[] = [
  { label: "ทุกประเภท", value: "all" },
  { label: "ใบเสนอราคา", value: "quotation" },
  { label: "ใบแจ้งหนี้หรือใบกำกับภาษี", value: "invoice" },
  { label: "ใบวางบิล", value: "billing_note" },
  { label: "ใบเสร็จรับเงิน", value: "receipt" },
  { label: "ใบส่งของ", value: "delivery_note" },
  { label: "ใบลดหนี้", value: "credit_note" },
  { label: "ใบเพิ่มหนี้", value: "debit_note" },
];

const STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: "ทุกสถานะ", value: "all" },
  { label: "กำลังดำเนินการ", value: "processing" },
  { label: "เสร็จแล้ว", value: "done" },
  { label: "เกินกำหนด", value: "overdue" },
  { label: "ร่าง", value: "draft" },
  { label: "ส่งแล้ว", value: "sent" },
  { label: "ชำระบางส่วน", value: "partially_paid" },
  { label: "ชำระแล้ว", value: "paid" },
  { label: "ยกเลิก", value: "voided" },
];

const SORT_OPTIONS: { label: string; value: DocumentSort }[] = [
  { label: "ใหม่สุดก่อน", value: "newest" },
  { label: "เก่าสุดก่อน", value: "oldest" },
  { label: "ยอดมาก → น้อย", value: "amount_desc" },
  { label: "ยอดน้อย → มาก", value: "amount_asc" },
  { label: "ครบกำหนดใกล้สุด", value: "due_soonest" },
  { label: "ชื่อลูกค้า ก-ฮ", value: "customer_az" },
];

const CORRECTION_TYPES = ["credit_note", "debit_note"];
const DONE_STATUSES: DocStatus[] = ["paid", "generated", "issued"];

const MONTH_LABELS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

const CURRENT_YEAR = new Date().getFullYear();
const PAGE_SIZE = 25;
const RECENTS_KEY = "invoice-system.document-search-recent";
const RECENTS_MAX = 5;

function getDisplayAmountLabel(doc: Document): string {
  return doc.doc_type === "delivery_note" ? "มูลค่าอ้างอิง" : "ยอดสุทธิ";
}

function getNextStepText(doc: Document): string {
  if (doc.status === "draft") return "ยังไม่ได้ส่ง";
  if (doc.status === "overdue") return "ต้องติดตามการชำระ";
  if (doc.doc_type === "quotation" && doc.status === "sent") return "รอลูกค้ายืนยัน";
  if (doc.doc_type === "invoice" && doc.status === "sent") return "พร้อมวางบิลหรือรับเงิน";
  if (doc.doc_type === "delivery_note" && doc.status === "sent") return "ส่งของแล้ว รอออกใบแจ้งหนี้";
  if (doc.doc_type === "billing_note" && doc.status === "sent") return "รอรับเงิน";
  if (DONE_STATUSES.includes(doc.status)) return "เสร็จสมบูรณ์";
  if (doc.status === "voided") return "เก็บไว้เป็นประวัติ";
  return "";
}

function getQuickAction(
  doc: Document,
  permissions: WorkspacePermissions,
): { id: DocumentActionId; label: string } | null {
  if (doc.status === "draft" && doc.doc_type !== "receipt" && !CORRECTION_TYPES.includes(doc.doc_type)) {
    return { id: "edit", label: "แก้ไข" };
  }
  if (doc.status === "sent" && doc.doc_type === "quotation" && canSendDocumentType(permissions, doc.doc_type)) {
    return { id: "convert", label: "ออกใบแจ้งหนี้" };
  }
  if (
    (doc.status === "sent" || doc.status === "overdue" || doc.status === "partially_paid") &&
    (doc.doc_type === "invoice" || doc.doc_type === "billing_note") &&
    permissions.canRecordPayments
  ) {
    return { id: "pay", label: "รับเงิน" };
  }
  if (doc.status === "sent" && doc.doc_type === "delivery_note" && canSendDocumentType(permissions, doc.doc_type)) {
    return { id: "invoice_from_dn", label: "ออกบิล" };
  }
  return null;
}

function readRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeRecent(query: string) {
  const trimmed = query.trim();
  if (!trimmed || typeof window === "undefined") return;
  const next = [trimmed, ...readRecents().filter((item) => item !== trimmed)].slice(0, RECENTS_MAX);
  window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
}

function optionalNumber(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

interface StatChip {
  key: string;
  label: string;
  count: number;
  status?: string;
  type?: DocumentType;
  tone: "blue" | "amber" | "red" | "green" | "gray";
  icon: ReactNode;
}

export default function DocumentsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile, workspaceRole, workspacePermissions } = useWorkspaceRole();
  const permissions = getWorkspacePermissions(workspaceRole, workspacePermissions);
  const toast = useToast();
  const { documents, loading, error, refetch } = useDocuments(profile?.id);
  const { clientProfile } = useClientProfile(profile?.id);
  const businessToday = businessTodayString(clientProfile);
  const devIssueDate =
    clientProfile?.dev_mode_enabled && clientProfile.dev_effective_date ? businessToday : undefined;
  const workspaceId = profile?.workspace_user_id ?? profile?.id;

  const q = searchParams.get("q") || "";
  const typeFilter = (searchParams.get("type") || "all") as DocumentType | "all";
  const statusFilter = searchParams.get("status") || "all";
  const monthFilter = searchParams.get("month") || "all";
  const yearFilter = searchParams.get("year") || "all";
  const dateFrom = searchParams.get("from") || "";
  const dateTo = searchParams.get("to") || "";
  const hideVoided = searchParams.get("voided") === "hide";
  const amountMin = optionalNumber(searchParams.get("amountMin"));
  const amountMax = optionalNumber(searchParams.get("amountMax"));
  const aging = (searchParams.get("aging") || "all") as AgingBucket;
  const customerId = searchParams.get("customer");
  const item = searchParams.get("item") || "";
  const method = searchParams.get("method") || "all";
  const vatOnly = searchParams.get("vat") === "1";
  const whtOnly = searchParams.get("wht") === "1";
  const sort = (searchParams.get("sort") || "newest") as DocumentSort;

  const filters = useMemo<DocumentFilters>(
    () => ({
      q,
      type: typeFilter,
      status: statusFilter,
      month: monthFilter,
      year: yearFilter,
      from: dateFrom,
      to: dateTo,
      hideVoided,
      amountMin,
      amountMax,
      aging,
      customerId,
      item,
      method,
      vatOnly,
      whtOnly,
    }),
    [
      q, typeFilter, statusFilter, monthFilter, yearFilter, dateFrom, dateTo, hideVoided,
      amountMin, amountMax, aging, customerId, item, method, vatOnly, whtOnly,
    ],
  );

  const [search, setSearch] = useState(q);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const [savedViews, setSavedViews] = useState<SavedDocumentView[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const searchRef = useRef<HTMLInputElement>(null);

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("preset");
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === "" || value === "all") next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    setRecents(readRecents());
    setSavedViews(readSavedViews(workspaceId));
  }, [workspaceId]);

  useEffect(() => {
    setSearch(q);
  }, [q]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim() !== q) updateParams({ q: search.trim() || null });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, q, updateParams]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filters, sort]);

  const preset = searchParams.get("preset");
  useEffect(() => {
    if (!preset) return;
    if (preset === "overdue") {
      updateParams({ preset: null, type: "billing_note", status: "overdue" });
    } else if (preset === "unpaid") {
      updateParams({ preset: null, type: "billing_note", status: null });
    } else if (preset === "paid" || preset === "paid_this_month") {
      updateParams({ preset: null, type: "billing_note", status: "paid" });
    } else {
      updateParams({ preset: null });
    }
  }, [preset, updateParams]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing) return;
      if (event.key === "/" || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const isOverdue = useCallback(
    (doc: Document) => isDocumentOverdue(doc, businessToday),
    [businessToday],
  );

  const summary = useMemo(
    () => ({
      draft: documents.filter((doc) => doc.status === "draft").length,
      dnReady: documents.filter((doc) => doc.doc_type === "delivery_note" && doc.status === "sent").length,
      collect: documents.filter(
        (doc) =>
          doc.doc_type === "billing_note" &&
          ["sent", "overdue", "partially_paid"].includes(doc.status),
      ).length,
      overdue: documents.filter((doc) => isOverdue(doc)).length,
      paid: documents.filter((doc) => doc.doc_type === "billing_note" && doc.status === "paid").length,
      voided: documents.filter((doc) => doc.status === "voided").length,
    }),
    [documents, isOverdue],
  );

  const stats: StatChip[] = [
    { key: "draft", label: "ร่าง", count: summary.draft, status: "draft", tone: "blue", icon: <FileText className="h-4 w-4" /> },
    { key: "dn", label: "DN รอออกบิล", count: summary.dnReady, type: "delivery_note", status: "sent", tone: "blue", icon: <FileText className="h-4 w-4" /> },
    { key: "collect", label: "BN รอรับเงิน", count: summary.collect, type: "billing_note", tone: "amber", icon: <Clock3 className="h-4 w-4" /> },
    { key: "overdue", label: "เกินกำหนด", count: summary.overdue, status: "overdue", tone: "red", icon: <AlertTriangle className="h-4 w-4" /> },
    { key: "paid", label: "รับเงินแล้ว", count: summary.paid, type: "billing_note", status: "paid", tone: "green", icon: <CheckCircle2 className="h-4 w-4" /> },
    { key: "voided", label: "ยกเลิก", count: summary.voided, status: "voided", tone: "gray", icon: <XCircle className="h-4 w-4" /> },
  ];

  const filtered = useMemo(
    () =>
      sortDocuments(
        documents.filter((doc) => matchesDocumentFilters(doc, filters, businessToday)),
        sort,
      ),
    [documents, filters, businessToday, sort],
  );

  const filteredTotal = useMemo(
    () => filtered.reduce((sum, doc) => sum + getDocumentDisplayAmount(doc), 0),
    [filtered],
  );

  const customerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const doc of documents) {
      const name = (doc as { customer?: { name?: string } }).customer?.name;
      if (doc.customer_id && name) map.set(doc.customer_id, name);
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [documents]);

  const itemNames = useMemo(() => {
    const names = new Set<string>();
    for (const doc of documents) {
      for (const line of doc.line_items || []) {
        if (line.item_name) names.add(line.item_name);
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "th")).slice(0, 500);
  }, [documents]);

  const availableYears = useMemo(() => {
    const years = new Set([CURRENT_YEAR]);
    for (const doc of documents) {
      if (doc.issue_date) years.add(new Date(doc.issue_date).getFullYear());
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [documents]);

  const visible = filtered.slice(0, visibleCount);
  const activeFilterCount = countActiveFilters(filters);
  const hasFilters = activeFilterCount > 0;
  const selectedCustomerName = customerOptions.find((customer) => customer.id === customerId)?.name;

  function clearFilters() {
    setSearch("");
    setSearchParams({}, { replace: true });
  }

  function applyFilters(next: DocumentFilters) {
    setSearch(next.q);
    updateParams({
      q: next.q || null,
      type: next.type,
      status: next.status,
      month: next.month,
      year: next.year,
      from: next.from || null,
      to: next.to || null,
      voided: next.hideVoided ? "hide" : null,
      amountMin: next.amountMin != null ? String(next.amountMin) : null,
      amountMax: next.amountMax != null ? String(next.amountMax) : null,
      aging: next.aging,
      customer: next.customerId,
      item: next.item || null,
      method: next.method,
      vat: next.vatOnly ? "1" : null,
      wht: next.whtOnly ? "1" : null,
    });
  }

  function removeFilter(patch: Partial<DocumentFilters>) {
    applyFilters({ ...filters, ...patch });
  }

  function isStatActive(stat: StatChip) {
    return (stat.type ?? "all") === typeFilter && (stat.status ?? "all") === statusFilter;
  }

  function toggleStat(stat: StatChip) {
    if (isStatActive(stat)) {
      updateParams({ type: null, status: null });
      return;
    }
    updateParams({ type: stat.type ?? null, status: stat.status ?? null });
  }

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [inlineLoading, setInlineLoading] = useState<string | null>(null);
  const [sendConfirmDoc, setSendConfirmDoc] = useState<Document | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{ docId: string; action: "void" | "delete" } | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

  const performListSend = async (doc: Document) => {
    if (!profile?.id) return;
    setInlineLoading(doc.id);
    try {
      const { warnings } = await sendDocumentWithSideEffects(doc, profile.id, { issueDate: devIssueDate });
      warnings.forEach((warning) => toast.info(`${warning.itemName} สต็อกไม่พอ`));
      toast.success(doc.doc_type === "delivery_note" ? "บันทึกว่าส่งของแล้ว" : "ทำเครื่องหมายว่าส่งแล้ว");
      warmPdfCache(doc.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setInlineLoading(null);
    }
  };

  const handleInlineAction = async (doc: Document, action: DocumentActionId) => {
    if (!profile?.id) return;
    if ((action === "send" || action === "issue_cn") && !canSendDocumentType(permissions, doc.doc_type)) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    if (action === "void" && !permissions.canVoidDocuments) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    if (action === "delete" && !permissions.canDeleteDocuments) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner");
      return;
    }
    if (action === "send" && ["invoice", "billing_note"].includes(doc.doc_type)) {
      setSendConfirmDoc(doc);
      return;
    }
    setInlineLoading(doc.id);
    try {
      if (action === "send") {
        await performListSend(doc);
      } else if (action === "void") {
        await voidDocumentWithSideEffects(doc, profile.id);
        toast.success("ยกเลิกเอกสารแล้ว");
        warmPdfCache(doc.id);
      } else if (action === "delete") {
        await deleteDraftDocument(doc);
        toast.success("ลบเอกสารแล้ว");
      } else if (action === "confirm_receipt") {
        await confirmDraftReceipt(doc.id, profile.id);
        toast.success("ยืนยันการรับเงินสำเร็จ — บันทึกยอดและออกใบเสร็จแล้ว");
        warmPdfCache(doc.id);
      } else if (action === "issue_cn") {
        await supabase
          .from("documents")
          .update({
            status: "issued" as DocStatus,
            ...(devIssueDate ? { issue_date: devIssueDate } : {}),
          })
          .eq("id", doc.id);
        toast.success("ออกใบลดหนี้แล้ว");
        warmPdfCache(doc.id);
      }
      setOpenMenuId(null);
      setPendingConfirm(null);
      await refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setInlineLoading(null);
    }
  };

  const handleMenuAction = async (doc: Document, action: DocumentActionId | "cancelConfirm") => {
    if (action === "cancelConfirm") {
      setPendingConfirm(null);
      return;
    }
    if ((action === "pay" || action === "billing" || action === "confirm_receipt") && !permissions.canRecordPayments) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    if ((action === "convert" || action === "invoice_from_dn") && !canSendDocumentType(permissions, doc.doc_type)) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    if (action === "void" || action === "delete") {
      setPendingConfirm({ docId: doc.id, action });
      return;
    }
    if (action === "edit") {
      setOpenMenuId(null);
      navigate(`/documents/${doc.id}/edit`);
      return;
    }
    if (action === "convert" || action === "pay") {
      setOpenMenuId(null);
      navigate(`/documents/${doc.id}`);
      return;
    }
    if (action === "copy") {
      setOpenMenuId(null);
      if (!profile?.id) return;
      const { data: copy, error: copyError } = await copyDocumentAsDraft(doc, profile.id);
      if (copyError || !copy) {
        toast.error(copyError?.message || "สร้างฉบับเหมือนเดิมไม่สำเร็จ");
        return;
      }
      toast.success("สร้างฉบับร่างเหมือนเดิมแล้ว");
      navigate(`/documents/${copy.id}`);
      return;
    }
    if (action === "billing") {
      if (doc.doc_type !== "invoice" || doc.status !== "sent") {
        toast.error("สามารถวางบิลได้เฉพาะใบแจ้งหนี้ที่ยังไม่ถูกวางบิล");
        return;
      }
      setOpenMenuId(null);
      navigate(`/documents/new?type=billing_note&dealId=${doc.deal_id || ""}`);
      return;
    }
    if (action === "invoice_from_dn") {
      setOpenMenuId(null);
      navigate(`/documents/new?type=invoice_from_delivery_notes&dnId=${doc.id}`);
      return;
    }
    await handleInlineAction(doc, action);
  };

  const toggleMenu = (docId: string) => {
    setOpenMenuId(openMenuId === docId ? null : docId);
    setPendingConfirm(null);
  };

  const toggleSelectDoc = (docId: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const selectAllFiltered = () => setSelectedDocIds(new Set(filtered.map((doc) => doc.id)));
  const clearSelection = () => setSelectedDocIds(new Set());

  const handleBulkDownloadPDF = async () => {
    if (selectedDocIds.size === 0 || !profile?.id) return;
    setBulkDownloading(true);
    setBulkProgress({ current: 0, total: selectedDocIds.size });
    const ids = Array.from(selectedDocIds);
    try {
      const { data: clientProfile } = await supabase
        .from("client_profiles")
        .select("*")
        .eq("user_id", profile.id)
        .single();
      if (!clientProfile) {
        toast.error("ไม่พบข้อมูลโปรไฟล์");
        return;
      }

      const JSZip = (await import("jszip")).default;
      const { getPrintableDocumentDataBase, generatePDFBlob, isHtmlPrintTemplate } = await import("../../../lib/print");
      const generateBlob = async (docId: string) => {
        const data = await getPrintableDocumentDataBase(docId);
        const template = isHtmlPrintTemplate(clientProfile.pdf_template) ? clientProfile.pdf_template : "modern";
        return generatePDFBlob({ ...data, template } as Parameters<typeof generatePDFBlob>[0]);
      };

      const zip = new JSZip();
      for (let i = 0; i < ids.length; i++) {
        setBulkProgress({ current: i + 1, total: ids.length });
        const blob = await generateBlob(ids[i]);
        if (!blob) continue;
        zip.file(`${ids[i].slice(0, 8)}.pdf`, blob, { binary: true });
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `documents_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast.success(`ดาวน์โหลด ${selectedDocIds.size} ไฟล์เรียบร้อย`);
      clearSelection();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการสร้าง PDF");
    } finally {
      setBulkDownloading(false);
      setBulkProgress({ current: 0, total: 0 });
    }
  };

  function handleExportCSV() {
    const headers = ["เลขที่เอกสาร", "ประเภท", "สถานะ", "ลูกค้า", "วันที่ออก", "วันครบกำหนด", "ยอดสุทธิ"];
    const rows = filtered.map((doc) => [
      doc.doc_number || "",
      DOC_TYPE_LABELS[doc.doc_type].th,
      STATUS_LABELS[doc.status],
      (doc as { customer?: { name?: string } }).customer?.name || "",
      doc.issue_date,
      doc.due_date || "",
      getDocumentDisplayAmount(doc).toString(),
    ]);
    downloadBlob(buildCsvBlob(headers, rows), datedFilename("documents_export", "csv"));
  }

  return (
    <AppShell title="เอกสาร">
      <div className="space-y-4">
        <section className="rounded-card border border-card-border bg-white p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-subtitle font-semibold tracking-tight text-ink-900">คลังเอกสาร</h1>
              <p className="mt-0.5 text-body text-ink-500">ค้นหา พิมพ์ และตรวจสอบเอกสารย้อนหลัง</p>
            </div>
            <span className="hidden shrink-0 rounded-full bg-paper-field px-3 py-1 text-label font-medium text-ink-400 sm:block">
              {filtered.length} / {documents.length}
            </span>
          </div>

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-ink-300" />
            <input
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onFocus={() => setRecents(readRecents())}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  writeRecent(search);
                  setRecents(readRecents());
                }
              }}
              placeholder="ค้นหาเลขที่เอกสาร ชื่อลูกค้า รายการ หมายเหตุ หรือเลขที่ใบสั่งซื้อ..."
              aria-label="ค้นหาเอกสาร"
              className="w-full rounded-card border border-card-border bg-paper-field py-3 pl-11 pr-24 text-body text-ink-900 placeholder:text-ink-300 focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
              {search && (
                <button
                  type="button"
                  aria-label="ล้างคำค้นหา"
                  onClick={() => setSearch("")}
                  className="rounded-control p-1 text-ink-300 hover:bg-ink-50 hover:text-ink-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <kbd className="hidden rounded border border-card-border bg-white px-1.5 py-0.5 text-label font-medium text-ink-300 sm:block">
                /
              </kbd>
            </div>

            {!search && recents.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-label text-ink-300">ค้นหาล่าสุด:</span>
                {recents.map((recent) => (
                  <button
                    key={recent}
                    type="button"
                    onClick={() => setSearch(recent)}
                    className="rounded-full border border-card-border bg-white px-2.5 py-0.5 text-label text-ink-600 hover:border-ink-200"
                  >
                    {recent}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {stats.map((stat) => {
              const active = isStatActive(stat);
              const tones = {
                blue: active ? "border-primary bg-primary-soft text-primary-deep" : "",
                amber: active ? "border-warning-border bg-warning-soft text-warning-text" : "",
                red: active ? "border-danger-strong bg-danger-soft text-danger-text" : "",
                green: active ? "border-success-strong bg-success-soft text-success-text" : "",
                gray: active ? "border-ink-300 bg-paper-field text-ink-700" : "",
              }[stat.tone];
              return (
                <button
                  key={stat.key}
                  type="button"
                  onClick={() => toggleStat(stat)}
                  aria-pressed={active}
                  className={`flex items-center justify-between gap-2 rounded-card border px-3 py-2 text-left transition-colors ${ active ? tones : "border-card-border bg-white text-ink-700 hover:border-ink-200" }`}
                >
                  <div>
                    <div className="text-subtitle font-semibold leading-none tabular-nums">{stat.count}</div>
                    <div className="mt-1 text-label leading-tight opacity-75">{stat.label}</div>
                  </div>
                  <span className="shrink-0 opacity-70">{stat.icon}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-card border border-card-border bg-white">
          <div className="space-y-3 border-b border-line-faint p-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <Select
                label="ประเภท"
                value={typeFilter}
                onChange={(event) => updateParams({ type: event.target.value })}
              >
                {DOC_TYPE_FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </Select>
              <Select
                label="สถานะ"
                value={statusFilter}
                onChange={(event) => updateParams({ status: event.target.value })}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Select
                label="เดือน"
                value={monthFilter}
                onChange={(event) => updateParams({ month: event.target.value })}
              >
                <option value="all">ทั้งปี</option>
                {MONTH_LABELS.map((label, index) => (
                  <option key={label} value={String(index + 1)}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select
                label="ปี"
                value={yearFilter}
                onChange={(event) => updateParams({ year: event.target.value })}
              >
                <option value="all">ทุกปี</option>
                {availableYears.map((year) => (
                  <option key={year} value={String(year)}>
                    {year}
                  </option>
                ))}
              </Select>
              <Select
                label="เรียงลำดับ"
                value={sort}
                onChange={(event) =>
                  updateParams({ sort: event.target.value === "newest" ? null : event.target.value })
                }
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setFilterSheetOpen(true)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                ตัวกรอง
                {activeFilterCount > 0 && (
                  <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-label font-semibold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </Button>

              <SavedViewsMenu
                views={savedViews}
                onApply={(view) => applyFilters({ ...EMPTY_FILTERS, ...view.filters })}
                onSave={(name) => setSavedViews(saveView(workspaceId, name, filters))}
                onDelete={(viewId) => setSavedViews(deleteView(workspaceId, viewId))}
              />

              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-label font-medium text-primary hover:underline"
                >
                  ล้างตัวกรองทั้งหมด
                </button>
              )}
            </div>

            <ActiveFilterChips
              filters={filters}
              customerName={selectedCustomerName}
              onRemove={removeFilter}
              onClearAll={clearFilters}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-faint px-4 py-2">
            <span className="text-label text-ink-400">
              แสดง {filtered.length} รายการ · รวม ฿{formatCurrency(filteredTotal)}
              {hasFilters ? ` · จาก ${documents.length}` : ""}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {selectedDocIds.size > 0 ? (
                <Button variant="secondary" size="sm" onClick={clearSelection}>
                  ยกเลิกเลือก ({selectedDocIds.size})
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={selectAllFiltered} disabled={filtered.length === 0}>
                  เลือกทั้งหมด
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={handleExportCSV}>
                <Download className="h-3.5 w-3.5" />
                CSV
              </Button>
              {selectedDocIds.size > 0 && (
                <Button variant="primary" size="sm" onClick={handleBulkDownloadPDF} loading={bulkDownloading} disabled={bulkDownloading}>
                  {bulkDownloading ? `กำลังสร้าง ${bulkProgress.current}/${bulkProgress.total}` : "ดาวน์โหลด PDF"}
                </Button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="p-4">
              <SkeletonTable />
            </div>
          ) : error ? (
            <EmptyState
              title="โหลดเอกสารไม่สำเร็จ"
              description={error}
              action={
                <Button variant="secondary" onClick={() => refetch()}>
                  ลองใหม่อีกครั้ง
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            documents.length === 0 ? (
              <EmptyState
                title="ยังไม่มีเอกสารในระบบ"
                description="เริ่มต้นด้วยการสร้างงานขาย ระบบจะช่วยสร้างเอกสารที่จำเป็นให้ทีละขั้นตอน"
                action={<Button onClick={() => navigate("/deals/new")}>สร้างงานขายแรก</Button>}
              />
            ) : (
              <EmptyState
                title="ไม่พบเอกสาร"
                description="ลองเปลี่ยนคำค้นหา หรือปรับตัวกรอง"
                action={
                  hasFilters ? (
                    <Button variant="secondary" onClick={clearFilters}>
                      ล้างตัวกรองทั้งหมด
                    </Button>
                  ) : undefined
                }
              />
            )
          ) : (
            <>
              <div>
                {visible.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    permissions={permissions}
                    overdue={isOverdue(doc)}
                    customerName={(doc as { customer?: { name?: string } }).customer?.name || "ไม่ได้ระบุลูกค้า"}
                    nextStep={getNextStepText(doc)}
                    displayAmount={getDocumentDisplayAmount(doc)}
                    displayAmountLabel={getDisplayAmountLabel(doc)}
                    menuOpen={openMenuId === doc.id}
                    menuLoading={inlineLoading === doc.id}
                    pendingConfirm={pendingConfirm}
                    onToggleMenu={() => toggleMenu(doc.id)}
                    onAction={(action) => handleMenuAction(doc, action)}
                    onOpen={() => navigate(`/documents/${doc.id}`)}
                    selectMode={selectedDocIds.size > 0}
                    isSelected={selectedDocIds.has(doc.id)}
                    onToggleSelect={() => toggleSelectDoc(doc.id)}
                    onOpenDeal={doc.deal_id ? () => navigate(`/deals/${doc.deal_id}`) : undefined}
                    searchQuery={q || undefined}
                    quickAction={getQuickAction(doc, permissions)}
                  />
                ))}
              </div>
              {visibleCount < filtered.length && (
                <div className="border-t border-line-faint p-4 text-center">
                  <Button variant="secondary" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
                    โหลดเพิ่ม ({filtered.length - visibleCount} รายการ)
                  </Button>
                </div>
              )}
            </>
          )}
        </section>

        {selectedDocIds.size > 0 && (
          <div className="sticky bottom-20 z-30 mx-auto flex w-full max-w-lg items-center justify-between gap-3 rounded-card border border-primary/30 bg-white px-5 py-3 md:hidden">
            <span className="text-body font-medium text-primary">เลือก {selectedDocIds.size} รายการ</span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={clearSelection}>
                ล้าง
              </Button>
              <Button variant="primary" size="sm" onClick={handleBulkDownloadPDF} loading={bulkDownloading} disabled={bulkDownloading}>
                {bulkDownloading ? `${bulkProgress.current}/${bulkProgress.total}` : "ดาวน์โหลด ZIP"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <DocumentFilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        filters={filters}
        customers={customerOptions}
        itemNames={itemNames}
        onApply={applyFilters}
      />

      <Modal open={!!sendConfirmDoc} onClose={() => setSendConfirmDoc(null)} title="ยืนยันการส่งเอกสาร">
        {sendConfirmDoc && (
          <div className="space-y-4">
            <div className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-label leading-5 text-amber-900">
              <span className="font-semibold">{sendConfirmDoc.doc_number || "เอกสาร"}</span> จะถูกล็อคหลังส่ง หากผิดต้องยกเลิกและออกใหม่
            </div>
            <p className="text-body text-ink-600">ยืนยันส่งเอกสารนี้ให้ลูกค้าหรือไม่?</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSendConfirmDoc(null)}>
                ยกเลิก
              </Button>
              <Button
                onClick={async () => {
                  const target = sendConfirmDoc;
                  setSendConfirmDoc(null);
                  await performListSend(target);
                }}
                loading={inlineLoading === sendConfirmDoc.id}
              >
                ส่งเอกสาร
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
