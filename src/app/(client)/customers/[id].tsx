import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, ChevronDown, MoreVertical, RotateCcw, Search } from "lucide-react";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { Spinner } from "../../../components/ui/Spinner";
import { Badge } from "../../../components/ui/Badge";
import { ViewToggle } from "../../../components/ui/ViewToggle";
import type { ViewMode } from "../../../components/ui/ViewToggle";
import { SortableTh } from "../../../components/ui/SortableTh";
import { useTableSort } from "../../../components/ui/useTableSort";
import { NewDealSheet } from "../../../components/home/NewDealSheet";
import { CustomerAvatar } from "../../../components/customer/CustomerAvatar";
import { supabase } from "../../../lib/supabase";
import { useAuth, useClientProfile, useWorkspaceRole } from "../../../hooks/useAuth";
import { useToast } from "../../../hooks/useToast";
import { formatBuddhistDate } from "../../../lib/dates";
import { formatCurrency } from "../../../lib/format";
import { TABLE } from "../../../lib/tableStyles";
import type { Customer, Deal, Document, DocumentLineItem } from "../../../types";
import { getWorkspacePermissions } from "../../../lib/permissions";

const AVATAR_PRESET_COLORS = [
  "#378ADD", "#C2410C", "#1E7E34", "#B45309",
  "#7C3AED", "#BE185D", "#0F766E", "#1565C0",
  "#DC2626", "#EA580C", "#CA8A04", "#16A34A",
  "#0891B2", "#9333EA", "#DB2777", "#475569",
  "#FFFFFF",
];

interface DealWithDocs extends Deal {
  documents: Document[];
}

type DealFilter = "all" | "active" | "done" | "partial";

type DealStage = "draft" | "waiting" | "pending_payment" | "partial" | "overdue" | "paid" | "voided";

const STAGE_LABELS: Record<DealStage, string> = {
  draft: "ร่าง",
  waiting: "รอดำเนินการ",
  pending_payment: "รอเก็บเงิน",
  partial: "ชำระบางส่วน",
  overdue: "เกินกำหนด",
  paid: "ชำระแล้ว",
  voided: "ยกเลิก",
};

const STAGE_COLORS: Record<DealStage, string> = {
  draft: "bg-stone-100 text-stone-500",
  waiting: "bg-blue-50 text-blue-600",
  pending_payment: "bg-green-50 text-green-600",
  partial: "bg-amber-100 text-amber-700",
  overdue: "bg-red-50 text-red-700",
  paid: "bg-green-100 text-green-700",
  voided: "bg-stone-100 text-stone-400",
};

type DealHistoryItem = {
  deal: DealWithDocs;
  representativeDoc: Document | null;
  stage: DealStage;
  amount: number;
  isDone: boolean;
  latestDate: string;
};

const DEAL_HISTORY_VIEW_STORAGE_KEY = "customer_deal_history_view";
const SALES_JOB_DOCUMENT_TYPES = new Set(["quotation", "invoice", "tax_invoice_receipt", "delivery_note"]);

const REP_DOC_PRIORITY: Record<string, number> = {
  billing_note: 5,
  invoice: 4,
  tax_invoice_receipt: 3,
  quotation: 2,
  delivery_note: 1,
  receipt: 0,
};

function getDealStage(docs: Document[]): DealStage {
  const nonVoided = docs.filter((d) => d.status !== "voided");
  if (nonVoided.length === 0 && docs.length > 0) return "voided";
  if (nonVoided.every((d) => d.status === "draft")) return "draft";
  if (nonVoided.some((d) => d.status === "overdue")) return "overdue";
  if (nonVoided.some((d) => d.status === "partially_paid")) return "partial";

  // Converted source documents are resolved and must not keep a paid deal active.
  if (nonVoided.every((d) => ["paid", "converted", "generated", "issued"].includes(d.status))) return "paid";

  const billingNotes = nonVoided.filter((d) => d.doc_type === "billing_note");
  const hasBillingNote = billingNotes.length > 0;

  // Once invoices are bundled into a billing note, the billing note is the
  // collection source of truth rather than the original invoice status.
  if (hasBillingNote) {
    if (billingNotes.every((d) => ["paid", "converted", "generated", "issued"].includes(d.status))) return "paid";
    if (billingNotes.some((d) => d.status === "sent")) return "pending_payment";
  }

  const hasSentInvoice = !hasBillingNote && nonVoided.some((d) => d.doc_type === "invoice" && d.status === "sent");

  if (hasSentInvoice) return "waiting";

  return "waiting";
}

function pickRepresentativeDoc(deal: DealWithDocs): Document | null {
  const docs = (deal.documents || []).filter((d) => d.status !== "voided");
  if (docs.length === 0) return null;
  return [...docs].sort((a, b) => (REP_DOC_PRIORITY[b.doc_type] || 0) - (REP_DOC_PRIORITY[a.doc_type] || 0))[0];
}

function isDealConsideredDone(docs: Document[]): boolean {
  const stage = getDealStage(docs);
  return stage === "paid";
}

function getSortedDocs(deal: DealWithDocs) {
  return [...(deal.documents || [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function hasSalesJobDocument(deal: DealWithDocs) {
  return (deal.documents || []).some(
    (doc) => SALES_JOB_DOCUMENT_TYPES.has(doc.doc_type) && !["voided", "draft", "converted"].includes(doc.status),
  );
}

function getDealReceived(docs: Document[]) {
  const nonVoided = docs.filter((doc) => doc.status !== "voided");
  const billingNotes = nonVoided.filter(
    (doc) => doc.doc_type === "billing_note" && ["paid", "partially_paid"].includes(doc.status),
  );
  if (billingNotes.length > 0) {
    return billingNotes.reduce((sum, doc) => sum + (doc.amount_received || 0), 0);
  }

  const invoices = nonVoided.filter(
    (doc) => doc.doc_type === "invoice" && ["paid", "partially_paid"].includes(doc.status),
  );
  if (invoices.length > 0) {
    return invoices.reduce((sum, doc) => sum + (doc.amount_received || 0), 0);
  }

  return nonVoided
    .filter((doc) => doc.doc_type === "tax_invoice_receipt" && ["paid", "issued"].includes(doc.status))
    .reduce((sum, doc) => sum + (doc.amount_received || doc.net_payable || 0), 0);
}

function getDealOutstanding(docs: Document[]) {
  const nonVoided = docs.filter((doc) => doc.status !== "voided");
  const billingNotes = nonVoided.filter((doc) => doc.doc_type === "billing_note");
  const collectionDocs = billingNotes.length > 0
    ? billingNotes
    : nonVoided.filter((doc) => doc.doc_type === "invoice");

  return collectionDocs.reduce((sum, doc) => {
    if (!["sent", "overdue", "partially_paid"].includes(doc.status)) return sum;
    return sum + Math.max(0, (doc.net_payable || 0) - (doc.amount_received || 0));
  }, 0);
}

function getDealHistoryItem(deal: DealWithDocs): DealHistoryItem {
  const rep = pickRepresentativeDoc(deal);
  const docs = deal.documents || [];
  const stage = getDealStage(docs);

  const billingDoc = docs.find((d) => d.doc_type === "billing_note" && d.status !== "voided") || null;
  const amountDoc = billingDoc || rep;
  const amount = amountDoc?.net_payable || amountDoc?.total_amount || 0;
  const dates = docs.map((d) => d.issue_date || d.updated_at).filter(Boolean).sort();
  const latestDate = dates.length > 0 ? dates[dates.length - 1] : deal.updated_at;

  return {
    deal,
    representativeDoc: rep,
    stage,
    amount,
    isDone: stage === "paid",
    latestDate,
  };
}

export default function CustomerDetailPage() {
  const { workspaceRole, workspacePermissions } = useWorkspaceRole();
  const permissions = getWorkspacePermissions(workspaceRole, workspacePermissions);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { clientProfile } = useClientProfile(profile?.id);
  const toast = useToast();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [deals, setDeals] = useState<DealWithDocs[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editTaxId, setEditTaxId] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editContact, setEditContact] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editCreditTerm, setEditCreditTerm] = useState<string>("");
  const [editAvatarInitials, setEditAvatarInitials] = useState("");
  const [editAvatarColor, setEditAvatarColor] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [useCustomAvatar, setUseCustomAvatar] = useState(false);
  const [avatarSectionOpen, setAvatarSectionOpen] = useState(true);

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [newSheetOpen, setNewSheetOpen] = useState(false);

  const [dealFilter, setDealFilter] = useState<DealFilter>("all");
  const [dealSearchQuery, setDealSearchQuery] = useState("");
  const [dealLineItems, setDealLineItems] = useState<Record<string, DocumentLineItem[]>>({});
  const [dealHistoryView, setDealHistoryView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "list";
    const stored = localStorage.getItem(DEAL_HISTORY_VIEW_STORAGE_KEY);
    return stored === "table" ? "table" : "list";
  });
  const [hasStoredDealHistoryView] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem(DEAL_HISTORY_VIEW_STORAGE_KEY);
    return stored === "list" || stored === "table";
  });

  useEffect(() => {
    localStorage.setItem(DEAL_HISTORY_VIEW_STORAGE_KEY, dealHistoryView);
  }, [dealHistoryView]);

  useEffect(() => {
    if (hasStoredDealHistoryView || deals.length < 8) return;
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches) {
      setDealHistoryView("table");
    }
  }, [deals.length, hasStoredDealHistoryView]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      supabase.from("customers").select("*").eq("id", id).single(),
      supabase
        .from("deals")
        .select("*, documents(*)")
        .eq("customer_id", id)
        .eq("is_active", true)
        .order("updated_at", { ascending: false }),
    ]).then(async ([custRes, dealsRes]) => {
      if (custRes.error) {
        setError(custRes.error.message);
      } else {
        setCustomer(custRes.data as Customer);
        setEditName(custRes.data.name);
        setEditTaxId(custRes.data.tax_id || "");
        setEditAddress(custRes.data.address || "");
        setEditPhone(custRes.data.phone || "");
        setEditEmail(custRes.data.email || "");
        setEditContact(custRes.data.contact_name || "");
        setEditCode(custRes.data.code || "");
        setEditCreditTerm(custRes.data.credit_term_days != null ? String(custRes.data.credit_term_days) : "");
        setEditAvatarInitials(custRes.data.avatar_initials || "");
        setEditAvatarColor(custRes.data.avatar_color || "");
        setUseCustomAvatar(Boolean(custRes.data.avatar_initials || custRes.data.avatar_color));
      }
      if (dealsRes.data) {
        const dealsData = dealsRes.data as unknown as DealWithDocs[];
        setDeals(dealsData);

        const allDocIds = dealsData.flatMap((d) => (d.documents || []).map((doc) => doc.id));
        if (allDocIds.length > 0) {
          const { data: lineItemsData } = await supabase
            .from("document_line_items")
            .select("*")
            .in("document_id", allDocIds)
            .order("sort_order", { ascending: true });
          const byDoc: Record<string, DocumentLineItem[]> = {};
          for (const item of (lineItemsData || []) as DocumentLineItem[]) {
            if (!byDoc[item.document_id]) byDoc[item.document_id] = [];
            byDoc[item.document_id].push(item);
          }
          setDealLineItems(byDoc);
        }
      }
      setLoading(false);
    });
  }, [id]);

  async function handleSave() {
    if (!customer || !profile) return;
    if (!editName.trim()) {
      toast.error("กรุณากรอกชื่อลูกค้า");
      return;
    }
    if (!editCode.trim()) {
      toast.error("กรุณากรอกรหัสลูกค้า");
      return;
    }
    setSaving(true);
    const avatarInitials = useCustomAvatar && editAvatarInitials.trim() ? editAvatarInitials.trim().toUpperCase().slice(0, 3) : null;
    const avatarColor = useCustomAvatar && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(editAvatarColor) ? editAvatarColor : null;
    const creditTermTrimmed = editCreditTerm.trim();
    const creditTermValue = creditTermTrimmed === "" ? null : parseInt(creditTermTrimmed, 10);
    if (creditTermValue != null && (!Number.isFinite(creditTermValue) || creditTermValue < 0 || creditTermValue > 365)) {
      toast.error("ระยะเวลาเครดิตต้องอยู่ระหว่าง 0 ถึง 365 วัน");
      setSaving(false);
      return;
    }
    const { error: err } = await supabase
      .from("customers")
      .update({
        name: editName.trim(),
        tax_id: editTaxId || null,
        address: editAddress || null,
        phone: editPhone || null,
        email: editEmail || null,
        contact_name: editContact || null,
        code: editCode.trim() || null,
        credit_term_days: creditTermValue,
        avatar_initials: avatarInitials,
        avatar_color: avatarColor,
      })
      .eq("id", customer.id);
    if (err) {
      toast.error(err.message);
    } else {
      setCustomer({
        ...customer,
        name: editName.trim(),
        tax_id: editTaxId || null,
        address: editAddress || null,
        phone: editPhone || null,
        email: editEmail || null,
        contact_name: editContact || null,
        code: editCode.trim() || null,
        credit_term_days: creditTermValue,
        avatar_initials: avatarInitials,
        avatar_color: avatarColor,
      });
      toast.success("บันทึกแล้ว");
      setEditing(false);
    }
    setSaving(false);
  }

  async function saveAvatar() {
    if (!customer) return;
    setSavingAvatar(true);
    const avatarInitials = useCustomAvatar && editAvatarInitials.trim() ? editAvatarInitials.trim().toUpperCase().slice(0, 3) : null;
    const avatarColor = useCustomAvatar && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(editAvatarColor) ? editAvatarColor : null;
    const { error: err } = await supabase
      .from("customers")
      .update({ avatar_initials: avatarInitials, avatar_color: avatarColor })
      .eq("id", customer.id);
    if (err) {
      toast.error(err.message);
    } else {
      setCustomer({ ...customer, avatar_initials: avatarInitials, avatar_color: avatarColor });
      toast.success("บันทึก avatar แล้ว");
    }
    setSavingAvatar(false);
  }

  async function resetAvatar() {
    if (!customer) return;
    setSavingAvatar(true);
    const { error: err } = await supabase
      .from("customers")
      .update({ avatar_initials: null, avatar_color: null })
      .eq("id", customer.id);
    if (err) {
      toast.error(err.message);
    } else {
      setCustomer({ ...customer, avatar_initials: null, avatar_color: null });
      setEditAvatarInitials("");
      setEditAvatarColor("");
      setUseCustomAvatar(false);
      toast.success("คืนค่า avatar เป็นอัตโนมัติ");
    }
    setSavingAvatar(false);
  }

  async function handleDeactivate() {
    if (!customer) return;
    setDeleting(true);
    const { error: err } = await supabase
      .from("customers")
      .update({ is_active: false })
      .eq("id", customer.id);
    if (err) {
      toast.error(err.message);
    } else {
      toast.success("ลบลูกค้าแล้ว");
      navigate("/customers", { replace: true });
    }
    setDeleting(false);
  }

  const dealHistoryItems = useMemo(
    () => deals.filter(hasSalesJobDocument).map(getDealHistoryItem),
    [deals],
  );

  const searchedDealItems = useMemo(() => {
    if (!dealSearchQuery.trim()) return dealHistoryItems;
    const q = dealSearchQuery.toLowerCase();
    return dealHistoryItems.filter((item) => {
      if (item.deal.title?.toLowerCase().includes(q)) return true;
      if (item.deal.deal_number?.toLowerCase().includes(q)) return true;
      if (item.deal.documents?.some((doc) => doc.doc_number?.toLowerCase().includes(q))) return true;
      if (item.deal.documents?.some((doc) => {
        const items = dealLineItems[doc.id] || [];
        return items.some((li) =>
          li.item_name?.toLowerCase().includes(q) ||
          (li.line_note || "").toLowerCase().includes(q),
        );
      })) return true;
      return false;
    });
  }, [dealHistoryItems, dealSearchQuery, dealLineItems]);

  const activeDealItems = useMemo(
    () => searchedDealItems.filter((item) => !item.isDone),
    [searchedDealItems],
  );

  const doneDealItems = useMemo(
    () => searchedDealItems.filter((item) => item.isDone),
    [searchedDealItems],
  );

  const partialDealItems = useMemo(
    () => searchedDealItems.filter((item) => item.stage === "partial"),
    [searchedDealItems],
  );

  const filteredDealItems = useMemo(() => {
    if (dealFilter === "active") return activeDealItems;
    if (dealFilter === "done") return doneDealItems;
    if (dealFilter === "partial") return partialDealItems;
    return [...activeDealItems, ...doneDealItems];
  }, [activeDealItems, dealFilter, doneDealItems, partialDealItems]);

  const dealRows = useMemo(
    () =>
      filteredDealItems.map((item) => ({
        ...item,
        title: item.deal.title || item.deal.deal_number || "งานขาย",
        status: item.stage,
      })),
    [filteredDealItems],
  );
  type DealSortKey = "title" | "latestDate" | "status" | "amount";
  const dealSort = useTableSort<(typeof dealRows)[number], DealSortKey>(dealRows, { key: "latestDate", dir: "desc" });

  const totalReceived = dealHistoryItems.reduce(
    (sum, item) => sum + getDealReceived(item.deal.documents || []),
    0,
  );

  const unpaid = dealHistoryItems.reduce(
    (sum, item) => sum + getDealOutstanding(item.deal.documents || []),
    0,
  );

  if (loading) {
    return (
      <AppShell title="" showBack>
        <Spinner />
      </AppShell>
    );
  }

  if (error || !customer) {
    return (
      <AppShell title="ไม่พบลูกค้า" showBack>
        <p className="text-sm text-gray-500">ไม่พบข้อมูลลูกค้า</p>
      </AppShell>
    );
  }

  const showIncomplete = !customer.tax_id && !customer.address;

  return (
    <AppShell
      title={customer.name}
      showBack
      action={
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={() => setNewSheetOpen(true)} className="!text-[12px]">
            + สร้างงานขาย
          </Button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F7F6F3] transition-colors"
            >
              <MoreVertical className="w-4 h-4 text-[#888780]" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 bg-white border border-[#E8E6DF] rounded-lg shadow-lg z-50 min-w-[130px]">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setDeleteConfirm(true);
                    }}
                    className="w-full text-left px-3 py-2.5 text-[13px] text-[#C0392B] hover:bg-red-50 rounded-lg transition-colors"
                  >
                    ลบลูกค้า
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <Card>
          <div className="flex items-start gap-3 mb-3">
            <CustomerAvatar customer={customer} size="lg" />
            <div className="flex-1 min-w-0">
              <h2 className="text-[16px] font-bold text-[#1A1A18] truncate">
                {customer.name}
              </h2>
              <div className="text-[11px] text-[#888780] mt-0.5">
                avatar: {customer.avatar_initials || customer.avatar_color
                  ? <span className="text-[#378ADD]">กำหนดเอง</span>
                  : "อัตโนมัติ"}
              </div>
            </div>
            <button
              onClick={() => setEditing(true)}
              className="text-[12px] text-[#378ADD] hover:underline shrink-0"
            >
              แก้ไข
            </button>
          </div>

          <div className="border-t border-[#F0EFE9] pt-3 mt-1">
            <button
              type="button"
              onClick={() => setAvatarSectionOpen((prev) => !prev)}
              className="flex w-full items-center justify-between gap-2 text-left"
              aria-expanded={avatarSectionOpen}
            >
              <div className="text-[11px] uppercase font-semibold text-[#888780]">
                รูป avatar
              </div>
              <ChevronDown
                size={14}
                className={`text-[#888780] transition-transform ${avatarSectionOpen ? "" : "-rotate-90"}`}
              />
            </button>
            {avatarSectionOpen && (
              <div className="mt-2 space-y-3">
                <label className="flex items-center gap-2 text-[13px] text-[#444441]">
                  <input
                    type="checkbox"
                    checked={useCustomAvatar}
                    onChange={(e) => setUseCustomAvatar(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-[#378ADD] focus:ring-[#378ADD]"
                  />
                  กำหนด avatar เอง
                </label>

                {useCustomAvatar && (
                  <>
                    <div>
                      <div className="text-[11px] text-[#888780] mb-1.5">
                        ตัวอักษร (สูงสุด 3 ตัว)
                      </div>
                      <Input
                        value={editAvatarInitials}
                        onChange={(e) => setEditAvatarInitials(e.target.value.toUpperCase().slice(0, 3))}
                        placeholder="เช่น BP"
                        maxLength={3}
                        className="!w-24 !text-center font-semibold"
                      />
                    </div>
                    <div>
                      <div className="text-[11px] text-[#888780] mb-1.5">
                        สีพื้น
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {AVATAR_PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setEditAvatarColor(c)}
                            aria-label={`เลือกสี ${c}`}
                            className={`w-7 h-7 rounded-full border-2 transition-transform ${
                              editAvatarColor.toLowerCase() === c.toLowerCase()
                                ? "border-[#1A1A18] scale-110"
                                : c === "#FFFFFF"
                                  ? "border-[#D4D0C8] shadow-sm hover:scale-105"
                                  : "border-white shadow-sm hover:scale-105"
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={saveAvatar}
                        loading={savingAvatar}
                        disabled={savingAvatar}
                        className="!text-[12px]"
                      >
                        บันทึก avatar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={resetAvatar}
                        disabled={savingAvatar || (!customer.avatar_initials && !customer.avatar_color)}
                        className="!text-[12px]"
                      >
                        <RotateCcw size={12} className="mr-1" />
                        คืนค่าอัตโนมัติ
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </Card>

        {editing ? (
          <Card>
            <div className="space-y-3">
              <Input
                label="รหัสลูกค้า *"
                value={editCode}
                onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                placeholder="เช่น JMK-001"
              />
              <Input
                label="ชื่อบริษัท / ชื่อลูกค้า *"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
              <Input
                label="เลขผู้เสียภาษี"
                value={editTaxId}
                onChange={(e) => setEditTaxId(e.target.value)}
              />
              <Input
                label="ที่อยู่"
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
              />
              <Input
                label="เบอร์โทร"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
              />
              <Input
                label="อีเมล"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                type="email"
              />
              <Input
                label="ชื่อผู้ติดต่อ"
                value={editContact}
                onChange={(e) => setEditContact(e.target.value)}
                placeholder="ชื่อคนที่ติดต่อด้วย"
              />
              <div>
                <label className="block text-[13px] text-[#1A1A18] mb-1">
                  ระยะเวลาเครดิต (วัน)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={editCreditTerm}
                    onChange={(e) => setEditCreditTerm(e.target.value)}
                    placeholder={`ใช้ค่าเริ่มต้น (${clientProfile?.credit_term_days ?? 7} วัน)`}
                    className="w-24 px-2 py-1.5 text-sm text-right border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:border-[#378ADD]"
                  />
                  <span className="text-sm text-[#888780]">วัน</span>
                  {editCreditTerm.trim() === "" && (
                    <span className="text-[11px] text-[#888780]">
                      เว้นว่างไว้เพื่อใช้ค่าเริ่มต้นของบริษัท
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving} loading={saving} className="!text-[12px]">
                  บันทึก
                </Button>
                <Button variant="ghost" onClick={() => setEditing(false)} className="!text-[12px]">
                  ยกเลิก
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="space-y-2">
              <div>
                <span className="text-[11px] text-[#888780]">รหัสลูกค้า: </span>
                <span className="text-[13px] text-primary font-mono font-medium">{customer.code || "—"}</span>
              </div>
              {customer.tax_id && (
                <div>
                  <span className="text-[11px] text-[#888780]">เลขผู้เสียภาษี: </span>
                  <span className="text-[13px] text-[#444441]">{customer.tax_id}</span>
                </div>
              )}
              {customer.address && (
                <div>
                  <span className="text-[11px] text-[#888780]">ที่อยู่: </span>
                  <span className="text-[13px] text-[#444441]">{customer.address}</span>
                </div>
              )}
              {customer.phone && (
                <div>
                  <span className="text-[11px] text-[#888780]">เบอร์โทร: </span>
                  <span className="text-[13px] text-[#444441]">{customer.phone}</span>
                </div>
              )}
              {customer.email && (
                <div>
                  <span className="text-[11px] text-[#888780]">อีเมล: </span>
                  <span className="text-[13px] text-[#444441]">{customer.email}</span>
                </div>
              )}
              {customer.contact_name && (
                <div>
                  <span className="text-[11px] text-[#888780]">ชื่อผู้ติดต่อ: </span>
                  <span className="text-[13px] text-[#444441]">{customer.contact_name}</span>
                </div>
              )}
              <div>
                <span className="text-[11px] text-[#888780]">ระยะเวลาเครดิต: </span>
                {customer.credit_term_days != null ? (
                  <span className="text-[13px] text-[#444441]">{customer.credit_term_days} วัน</span>
                ) : (
                  <span className="text-[13px] text-[#888780] italic">
                    ใช้ค่าเริ่มต้นของบริษัท ({clientProfile?.credit_term_days ?? 7} วัน)
                  </span>
                )}
              </div>
              {!customer.tax_id && !customer.address && !customer.phone && !customer.email && !customer.contact_name && (
                <div className="text-[12px] text-[#AAAAAA] italic">
                  ยังไม่มีข้อมูลติดต่อ — กด แก้ไข เพื่อเพิ่ม
                </div>
              )}
            </div>
            {showIncomplete && (
              <div className="mt-3 flex items-start gap-2 bg-[#FAEEDA] text-[#633806] text-[11px] rounded-md px-2.5 py-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>ข้อมูลไม่ครบ — กรอกให้ครบเพื่อให้เอกสาร PDF แสดงถูกต้อง</span>
              </div>
            )}
          </Card>
        )}

        <Card>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-[20px] font-bold text-[#1A1A18]">{dealHistoryItems.length}</div>
              <div className="text-[11px] text-[#888780]">งานขายทั้งหมด</div>
              <div className="mt-0.5 text-[10px] text-[#AAA49A]">กำลังทำ {activeDealItems.length} · เสร็จแล้ว {doneDealItems.length}</div>
            </div>
            <div>
              <div className="text-[20px] font-bold text-[#1A1A18]">฿ {formatCurrency(totalReceived)}</div>
              <div className="text-[11px] text-[#888780]">รับแล้วทั้งหมด</div>
            </div>
            <div>
              <div className={`text-[20px] font-bold ${unpaid > 0 ? "text-[#C0392B]" : "text-[#1A1A18]"}`}>
                ฿ {formatCurrency(unpaid)}
              </div>
              <div className="text-[11px] text-[#888780]">ค้างชำระ</div>
            </div>
          </div>
        </Card>

        <div>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="ค้นหาจากชื่องาน เลขที่เอกสาร หรือรายการ..."
              value={dealSearchQuery}
              onChange={(e) => setDealSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-[#E8E6DF] bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase font-semibold text-[#888780]">
                ประวัติงานขาย
              </div>
              <div className="mt-0.5 text-[11px] text-[#AAA49A]">
                กำลังดำเนินการ {activeDealItems.length} · เสร็จสิ้น {doneDealItems.length}
              </div>
            </div>
            <ViewToggle
              value={dealHistoryView}
              onChange={setDealHistoryView}
              variants={["list", "table"]}
              className="hidden sm:flex"
            />
          </div>

          <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(["all", "active", "partial", "done"] as const).map((tab) => {
              const count = tab === "all" ? dealHistoryItems.length : tab === "active" ? activeDealItems.length : tab === "partial" ? partialDealItems.length : doneDealItems.length;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setDealFilter(tab)}
                  className={`shrink-0 px-3 py-1.5 text-[12px] rounded-md font-medium transition-colors ${
                    dealFilter === tab
                      ? "bg-[#378ADD] text-white"
                      : "bg-[#F7F6F3] text-[#888780] hover:bg-[#E8E6DF]"
                  }`}
                >
                  {tab === "all" ? "ทั้งหมด" : tab === "active" ? "กำลังดำเนินการ" : tab === "partial" ? "ชำระบางส่วน" : "เสร็จสิ้น"} {count}
                </button>
              );
            })}
          </div>

          {filteredDealItems.length === 0 ? (
            <div className="text-center py-8 text-[13px] text-[#888780]">
              ยังไม่มีงานขาย — กด + สร้างงานขาย ด้านบนเพื่อเริ่ม
            </div>
          ) : dealHistoryView === "table" ? (
            <>
              <div className="space-y-2 sm:hidden">
                {filteredDealItems.map((item) => (
                  <Card
                    key={item.deal.id}
                    onClick={() => navigate(`/deals/${item.deal.id}`)}
                    className={item.isDone ? "!bg-[#FAFAF8] !border-[#F0EEE8] !shadow-none" : ""}
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                          <div className={`truncate text-[13px] font-semibold ${item.isDone ? "text-[#777166]" : "text-[#1A1A18]"}`}>
                            {item.deal.title || item.deal.deal_number || "งานขาย"}
                          </div>
                          <div className="mt-0.5 text-[11px] text-[#888780]">
                            {item.representativeDoc?.doc_number || "ยังไม่มีเลขเอกสาร"}
                            {item.latestDate && ` · ${formatBuddhistDate(item.latestDate)}`}
                          </div>
                        </div>
                      <div className="ml-3 shrink-0 text-right">
                        <div className={`font-semibold ${item.isDone ? "text-[12px] text-[#8A8478]" : "text-[13px] text-[#1A1A18]"}`}>
                          ฿ {formatCurrency(item.amount)}
                        </div>
                        <div className="mt-1">
                          <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium ${STAGE_COLORS[item.stage]}`}>
                            {STAGE_LABELS[item.stage]}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
              <div className="hidden overflow-hidden rounded-card border border-card-border bg-white sm:block">
                <table className={TABLE.table}>
                  <thead>
                    <tr className={TABLE.theadTr}>
                      <SortableTh
                        label="งานขาย / เอกสาร"
                        align="left"
                        active={dealSort.sort.key === "title"}
                        dir={dealSort.sort.dir}
                        onClick={() => dealSort.handleSort("title")}
                        className={TABLE.thSortable}
                      />
                      <SortableTh
                        label="สถานะ"
                        align="left"
                        active={dealSort.sort.key === "status"}
                        dir={dealSort.sort.dir}
                        onClick={() => dealSort.handleSort("status")}
                        className={TABLE.thSortable}
                      />
                      <SortableTh
                        label="ยอด"
                        align="right"
                        active={dealSort.sort.key === "amount"}
                        dir={dealSort.sort.dir}
                        onClick={() => dealSort.handleSort("amount")}
                        className={TABLE.thSortable}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {dealSort.sorted.map((item) => {
                      const rep = item.representativeDoc;
                      const isPartial = item.stage === "partial";
                      const partialReceived = isPartial && rep
                        ? rep.amount_received || 0
                        : 0;
                      return (
                      <tr
                        key={item.deal.id}
                        onClick={() => navigate(`/deals/${item.deal.id}`)}
                        className={`cursor-pointer transition-colors hover:bg-[#F8FAFC] ${
                          item.isDone ? "bg-[#FAFAF8] text-[#8A8478]" : "bg-white"
                        }`}
                      >
                        <td className="px-3 py-2">
                          <div className={`max-w-[280px] truncate font-medium ${item.isDone ? "text-[#8A8478]" : "text-[#111827]"}`}>
                            {item.deal.title || item.deal.deal_number || "งานขาย"}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-[#667085]">
                            {rep?.doc_number || "ยังไม่มีเลขเอกสาร"}
                            {item.latestDate && ` · ${formatBuddhistDate(item.latestDate)}`}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium ${STAGE_COLORS[item.stage]}`}>
                            {STAGE_LABELS[item.stage]}
                          </span>
                        </td>
                        <td className={`px-3 py-2 text-right ${item.isDone ? "text-[12px] text-[#8A8478]" : "text-[#111827]"}`}>
                          <div className="font-semibold">฿ {formatCurrency(item.amount)}</div>
                          {isPartial && partialReceived > 0 && (
                            <div className="text-[10px] text-[#667085]">
                              รับแล้ว ฿{formatCurrency(partialReceived)}
                            </div>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {(dealFilter === "all" ? [
                { key: "active", title: "กำลังดำเนินการ", items: activeDealItems },
                { key: "done", title: "เสร็จสิ้นแล้ว", items: doneDealItems },
              ] : [{ key: dealFilter, title: dealFilter === "active" ? "กำลังดำเนินการ" : dealFilter === "partial" ? "ชำระบางส่วน" : "เสร็จสิ้นแล้ว", items: filteredDealItems }])
                .filter((section) => section.items.length > 0)
                .map((section) => (
                  <div key={section.key} className="space-y-2">
                    {dealFilter === "all" && (
                      <div className={`text-[11px] font-semibold ${section.key === "done" ? "text-[#AAA49A]" : "text-[#888780]"}`}>
                        {section.title} ({section.items.length})
                      </div>
                    )}
                    {section.items.map((item) => (
                      <Card
                        key={item.deal.id}
                        onClick={() => navigate(`/deals/${item.deal.id}`)}
                        className={item.isDone ? "!bg-[#FAFAF8] !border-[#F0EEE8] !shadow-none" : ""}
                      >
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className={`truncate text-[13px] font-semibold ${item.isDone ? "text-[#777166]" : "text-[#1A1A18]"}`}>
                              {item.deal.title || item.deal.deal_number || "งานขาย"}
                            </div>
                            {item.representativeDoc && (
                              <div className="text-[11px] text-[#888780] mt-0.5">
                                {item.representativeDoc.doc_number || "ยังไม่มีเลขเอกสาร"}
                                {item.latestDate && ` · ${formatBuddhistDate(item.latestDate)}`}
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <div className={`font-semibold ${item.isDone ? "text-[12px] text-[#8A8478]" : "text-[13px] text-[#1A1A18]"}`}>
                              ฿ {formatCurrency(item.amount)}
                            </div>
                            <div className="mt-1">
                              <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium ${STAGE_COLORS[item.stage]}`}>
                                {STAGE_LABELS[item.stage]}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDeleteConfirm(false)} />
          <div className="relative bg-white rounded-t-xl md:rounded-xl w-full max-w-sm p-5 shadow-xl">
            <h3 className="text-base font-semibold mb-1">ลบ {customer.name}?</h3>
            <p className="text-sm text-[#888780] mb-4">ข้อมูลงานขายและเอกสารทั้งหมดจะยังคงอยู่</p>
            <div className="flex gap-2">
              <Button variant="danger" onClick={handleDeactivate} disabled={deleting} loading={deleting} className="flex-1">
                ลบลูกค้า
              </Button>
              <Button variant="secondary" onClick={() => setDeleteConfirm(false)} className="flex-1">
                ยกเลิก
              </Button>
            </div>
          </div>
        </div>
      )}

      <NewDealSheet
        open={newSheetOpen}
        onClose={() => setNewSheetOpen(false)}
        vatRegistered={clientProfile?.vat_registered}
        workspaceRole={workspaceRole}
        workspacePermissions={permissions}
        onSelect={(type) => {
          setNewSheetOpen(false);
          navigate(`/deals/new?type=${type}&customer_id=${customer.id}`);
        }}
      />
    </AppShell>
  );
}
