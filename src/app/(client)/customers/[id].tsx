import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  MoreVertical,
  RotateCcw,
  Search,
} from "lucide-react";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { Spinner } from "../../../components/ui/Spinner";
import { Badge } from "../../../components/ui/Badge";
import { SortableTh } from "../../../components/ui/SortableTh";
import { useTableSort } from "../../../components/ui/useTableSort";
import { NewDealSheet } from "../../../components/home/NewDealSheet";
import { CustomerAvatar } from "../../../components/customer/CustomerAvatar";
import { supabase } from "../../../lib/supabase";
import { useAuth, useClientProfile, useWorkspaceRole } from "../../../hooks/useAuth";
import { useToast } from "../../../hooks/useToast";
import { formatBuddhistDate } from "../../../lib/dates";
import { formatCurrency } from "../../../lib/format";
import { businessTodayString, addDaysString, monthStartString } from "../../../lib/devDate";
import { dealOutstanding } from "../../../lib/receivable";
import { TABLE } from "../../../lib/tableStyles";
import type { Customer, Deal, Document, DocumentLineItem } from "../../../types";
import { getWorkspacePermissions } from "../../../lib/permissions";

const AVATAR_PRESET_COLORS = [
  "#378ADD",
  "#C2410C",
  "#1E7E34",
  "#B45309",
  "#7C3AED",
  "#BE185D",
  "#0F766E",
  "#1565C0",
  "#DC2626",
  "#EA580C",
  "#CA8A04",
  "#16A34A",
  "#0891B2",
  "#9333EA",
  "#DB2777",
  "#475569",
  "#FFFFFF",
];

interface DealWithDocs extends Deal {
  documents: Document[];
}

type DealFilter = "all" | "active" | "done" | "partial";

type RangePreset = "all" | "thisMonth" | "last90" | "ytd" | "1year" | "custom";

const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "thisMonth", label: "เดือนนี้" },
  { key: "last90", label: "90 วัน" },
  { key: "ytd", label: "ปีนี้" },
  { key: "1year", label: "1 ปี" },
  { key: "custom", label: "กำหนดเอง" },
];

function getRangeBounds(preset: RangePreset, today: string): { from: string; to: string } {
  const to = today;
  if (preset === "all") return { from: "", to: "" };
  if (preset === "thisMonth") return { from: monthStartString(today), to };
  if (preset === "last90") return { from: addDaysString(today, -90), to };
  if (preset === "ytd") return { from: `${today.slice(0, 4)}-01-01`, to };
  return { from: addDaysString(today, -365), to };
}

type DealStage =
  "draft" | "waiting" | "pending_payment" | "partial" | "overdue" | "paid" | "voided";

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
  draft: "bg-ink-50 text-ink-500",
  waiting: "bg-blue-50 text-blue-600",
  pending_payment: "bg-green-50 text-green-600",
  partial: "bg-amber-100 text-amber-700",
  overdue: "bg-red-50 text-red-700",
  paid: "bg-green-100 text-green-700",
  voided: "bg-ink-50 text-ink-400",
};

type DealHistoryItem = {
  deal: DealWithDocs;
  representativeDoc: Document | null;
  stage: DealStage;
  amount: number;
  /** Excess credit when adjustment notes exceed the deal's balance. */
  credit: number;
  isDone: boolean;
  latestDate: string;
};

const SALES_JOB_DOCUMENT_TYPES = new Set(["quotation", "invoice", "delivery_note"]);

const REP_DOC_PRIORITY: Record<string, number> = {
  billing_note: 5,
  invoice: 4,
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
  if (nonVoided.every((d) => ["paid", "converted", "generated", "issued"].includes(d.status)))
    return "paid";

  const billingNotes = nonVoided.filter((d) => d.doc_type === "billing_note");
  const hasBillingNote = billingNotes.length > 0;

  // Once invoices are bundled into a billing note, the billing note is the
  // collection source of truth rather than the original invoice status.
  if (hasBillingNote) {
    if (billingNotes.every((d) => ["paid", "converted", "generated", "issued"].includes(d.status)))
      return "paid";
    if (billingNotes.some((d) => d.status === "sent")) return "pending_payment";
  }

  const hasSentInvoice =
    !hasBillingNote && nonVoided.some((d) => d.doc_type === "invoice" && d.status === "sent");

  if (hasSentInvoice) return "waiting";

  return "waiting";
}

function pickRepresentativeDoc(deal: DealWithDocs): Document | null {
  const docs = (deal.documents || []).filter((d) => d.status !== "voided");
  if (docs.length === 0) return null;
  return [...docs].sort(
    (a, b) => (REP_DOC_PRIORITY[b.doc_type] || 0) - (REP_DOC_PRIORITY[a.doc_type] || 0),
  )[0];
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
    (doc) =>
      SALES_JOB_DOCUMENT_TYPES.has(doc.doc_type) &&
      !["voided", "draft", "converted"].includes(doc.status),
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

  return 0;
}

function getDealOutstanding(docs: Document[]) {
  return dealOutstanding(docs);
}

function getDealHistoryItem(deal: DealWithDocs): DealHistoryItem {
  const rep = pickRepresentativeDoc(deal);
  const docs = deal.documents || [];
  const stage = getDealStage(docs);

  const billingDoc =
    docs.find((d) => d.doc_type === "billing_note" && d.status !== "voided") || null;
  const amountDoc = billingDoc || rep;
  const baseAmount = amountDoc?.net_payable || amountDoc?.total_amount || 0;

  // Active adjustment notes change the deal's displayed value:
  // credit notes (ใบลดหนี้) reduce it, debit notes (ใบเพิ่มหนี้) increase it.
  const netAdjustment = docs.reduce((sum, d) => {
    if (["draft", "voided"].includes(d.status)) return sum;
    if (d.doc_type === "credit_note") return sum - (d.total_amount || 0);
    if (d.doc_type === "debit_note") return sum + (d.total_amount || 0);
    return sum;
  }, 0);

  let amount = baseAmount + netAdjustment;
  const credit = Math.max(0, -amount);
  if (credit > 0) amount = 0;

  const dates = docs
    .map((d) => d.issue_date || d.updated_at)
    .filter(Boolean)
    .sort();
  const latestDate = dates.length > 0 ? dates[dates.length - 1] : deal.updated_at;

  return {
    deal,
    representativeDoc: rep,
    stage,
    amount,
    credit,
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
  const businessToday = businessTodayString(clientProfile);
  const [rangePreset, setRangePreset] = useState<RangePreset>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  function applyRangePreset(preset: RangePreset) {
    setRangePreset(preset);
    if (preset === "custom") return;
    const { from, to } = getRangeBounds(preset, businessToday);
    setDateFrom(from);
    setDateTo(to);
  }
  const [dealSearchQuery, setDealSearchQuery] = useState("");
  const [dealLineItems, setDealLineItems] = useState<Record<string, DocumentLineItem[]>>({});

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
        setEditCreditTerm(
          custRes.data.credit_term_days != null ? String(custRes.data.credit_term_days) : "",
        );
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
    const avatarInitials =
      useCustomAvatar && editAvatarInitials.trim()
        ? editAvatarInitials.trim().toUpperCase().slice(0, 3)
        : null;
    const avatarColor =
      useCustomAvatar && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(editAvatarColor)
        ? editAvatarColor
        : null;
    const creditTermTrimmed = editCreditTerm.trim();
    const creditTermValue = creditTermTrimmed === "" ? null : parseInt(creditTermTrimmed, 10);
    if (
      creditTermValue != null &&
      (!Number.isFinite(creditTermValue) || creditTermValue < 0 || creditTermValue > 365)
    ) {
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
    const avatarInitials =
      useCustomAvatar && editAvatarInitials.trim()
        ? editAvatarInitials.trim().toUpperCase().slice(0, 3)
        : null;
    const avatarColor =
      useCustomAvatar && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(editAvatarColor)
        ? editAvatarColor
        : null;
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

  const periodFilteredDealItems = useMemo(() => {
    if (!dateFrom && !dateTo) return dealHistoryItems;
    const from = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : -Infinity;
    const to = dateTo ? new Date(dateTo + "T23:59:59").getTime() : Infinity;
    return dealHistoryItems.filter((item) => {
      const d = item.latestDate ? new Date(item.latestDate).getTime() : 0;
      return d >= from && d <= to;
    });
  }, [dealHistoryItems, dateFrom, dateTo]);

  const searchedDealItems = useMemo(() => {
    if (!dealSearchQuery.trim()) return periodFilteredDealItems;
    const q = dealSearchQuery.toLowerCase();
    return periodFilteredDealItems.filter((item) => {
      if (item.deal.title?.toLowerCase().includes(q)) return true;
      if (item.deal.deal_number?.toLowerCase().includes(q)) return true;
      if (item.deal.documents?.some((doc) => doc.doc_number?.toLowerCase().includes(q)))
        return true;
      if (
        item.deal.documents?.some((doc) => {
          const items = dealLineItems[doc.id] || [];
          return items.some(
            (li) =>
              li.item_name?.toLowerCase().includes(q) ||
              (li.line_note || "").toLowerCase().includes(q),
          );
        })
      )
        return true;
      return false;
    });
  }, [periodFilteredDealItems, dealSearchQuery, dealLineItems]);

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
  const dealSort = useTableSort<(typeof dealRows)[number], DealSortKey>(dealRows, {
    key: "latestDate",
    dir: "desc",
  });

  const totalReceived = periodFilteredDealItems.reduce(
    (sum, item) => sum + getDealReceived(item.deal.documents || []),
    0,
  );

  const unpaid = periodFilteredDealItems.reduce(
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
        <p className="text-body text-ink-500">ไม่พบข้อมูลลูกค้า</p>
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
          <Button size="sm" onClick={() => setNewSheetOpen(true)} className="!text-label">
            + สร้างงานขาย
          </Button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex h-11 w-11 items-center justify-center rounded-control hover:bg-page-bg transition-colors md:h-8 md:w-8"
            >
              <MoreVertical className="w-4 h-4 text-ink-300" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 bg-white border border-card-border rounded-control z-50 min-w-[130px]">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setDeleteConfirm(true);
                    }}
                    className="w-full text-left px-3 py-2.5 text-body text-danger hover:bg-red-50 rounded-control transition-colors"
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
              <h2 className="text-title font-semibold text-ink-900 truncate">{customer.name}</h2>
              <div className="text-label text-ink-300 mt-0.5">
                avatar:{" "}
                {customer.avatar_initials || customer.avatar_color ? (
                  <span className="text-primary">กำหนดเอง</span>
                ) : (
                  "อัตโนมัติ"
                )}
              </div>
            </div>
            {permissions.canManageCustomers && (
              <button
                onClick={() => setEditing(true)}
                className="text-label text-primary hover:underline shrink-0"
              >
                แก้ไข
              </button>
            )}
          </div>

          <div className="border-t border-line-faint pt-3 mt-1">
            <button
              type="button"
              onClick={() => setAvatarSectionOpen((prev) => !prev)}
              className="flex w-full items-center justify-between gap-2 text-left"
              aria-expanded={avatarSectionOpen}
            >
              <div className="text-label font-semibold text-ink-300">รูป avatar</div>
              <ChevronDown
                size={14}
                className={`text-ink-300 transition-transform ${avatarSectionOpen ? "" : "-rotate-90"}`}
              />
            </button>
            {avatarSectionOpen && (
              <div className="mt-2 space-y-3">
                <label className="flex items-center gap-2 text-body text-ink-700">
                  <input
                    type="checkbox"
                    checked={useCustomAvatar}
                    onChange={(e) => setUseCustomAvatar(e.target.checked)}
                    className="w-4 h-4 rounded border-line-strong text-primary focus:ring-primary"
                  />
                  กำหนด avatar เอง
                </label>

                {useCustomAvatar && (
                  <>
                    <div>
                      <div className="text-label text-ink-300 mb-1.5">ตัวอักษร (สูงสุด 3 ตัว)</div>
                      <Input
                        value={editAvatarInitials}
                        onChange={(e) =>
                          setEditAvatarInitials(e.target.value.toUpperCase().slice(0, 3))
                        }
                        placeholder="เช่น BP"
                        maxLength={3}
                        className="!w-24 !text-center font-semibold"
                      />
                    </div>
                    <div>
                      <div className="text-label text-ink-300 mb-1.5">สีพื้น</div>
                      <div className="flex flex-wrap gap-2">
                        {AVATAR_PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setEditAvatarColor(c)}
                            aria-label={`เลือกสี ${c}`}
                            className={`h-10 w-10 rounded-full border-2 transition-transform md:h-7 md:w-7 ${editAvatarColor.toLowerCase() === c.toLowerCase() ? "border-ink-900 scale-110" : c === "#FFFFFF" ? "border-ink-100 hover:scale-105" : "border-white hover:scale-105"}`}
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
                        className="!text-label"
                      >
                        บันทึก avatar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={resetAvatar}
                        disabled={
                          savingAvatar || (!customer.avatar_initials && !customer.avatar_color)
                        }
                        className="!text-label"
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
                <label className="block text-body text-ink-900 mb-1">ระยะเวลาเครดิต (วัน)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={editCreditTerm}
                    onChange={(e) => setEditCreditTerm(e.target.value)}
                    placeholder={`ใช้ค่าเริ่มต้น (${clientProfile?.credit_term_days ?? 7} วัน)`}
                    className="w-24 px-2 py-1.5 text-body text-right border border-card-border rounded-control bg-white focus:outline-none focus:border-primary"
                  />
                  <span className="text-body text-ink-300">วัน</span>
                  {editCreditTerm.trim() === "" && (
                    <span className="text-label text-ink-300">
                      เว้นว่างไว้เพื่อใช้ค่าเริ่มต้นของบริษัท
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  loading={saving}
                  className="!text-label"
                >
                  บันทึก
                </Button>
                <Button variant="ghost" onClick={() => setEditing(false)} className="!text-label">
                  ยกเลิก
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="space-y-2">
              <div>
                <span className="text-label text-ink-300">รหัสลูกค้า: </span>
                <span className="text-body text-primary font-mono font-medium">
                  {customer.code || "—"}
                </span>
              </div>
              {customer.tax_id && (
                <div>
                  <span className="text-label text-ink-300">เลขผู้เสียภาษี: </span>
                  <span className="text-body text-ink-700">{customer.tax_id}</span>
                </div>
              )}
              {customer.address && (
                <div>
                  <span className="text-label text-ink-300">ที่อยู่: </span>
                  <span className="text-body text-ink-700">{customer.address}</span>
                </div>
              )}
              {customer.phone && (
                <div>
                  <span className="text-label text-ink-300">เบอร์โทร: </span>
                  <span className="text-body text-ink-700">{customer.phone}</span>
                </div>
              )}
              {customer.email && (
                <div>
                  <span className="text-label text-ink-300">อีเมล: </span>
                  <span className="text-body text-ink-700">{customer.email}</span>
                </div>
              )}
              {customer.contact_name && (
                <div>
                  <span className="text-label text-ink-300">ชื่อผู้ติดต่อ: </span>
                  <span className="text-body text-ink-700">{customer.contact_name}</span>
                </div>
              )}
              <div>
                <span className="text-label text-ink-300">ระยะเวลาเครดิต: </span>
                {customer.credit_term_days != null ? (
                  <span className="text-body text-ink-700">{customer.credit_term_days} วัน</span>
                ) : (
                  <span className="text-body text-ink-300 italic">
                    ใช้ค่าเริ่มต้นของบริษัท ({clientProfile?.credit_term_days ?? 7} วัน)
                  </span>
                )}
              </div>
              {!customer.tax_id &&
                !customer.address &&
                !customer.phone &&
                !customer.email &&
                !customer.contact_name && (
                  <div className="text-label text-ink-200 italic">
                    ยังไม่มีข้อมูลติดต่อ — กด แก้ไข เพื่อเพิ่ม
                  </div>
                )}
            </div>
            {showIncomplete && (
              <div className="mt-3 flex items-start gap-2 bg-pending-bg text-pending-text text-label rounded-control px-2.5 py-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>ข้อมูลไม่ครบ — กรอกให้ครบเพื่อให้เอกสาร PDF แสดงถูกต้อง</span>
              </div>
            )}
          </Card>
        )}

        <Card>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <span className="text-label font-semibold text-ink-900">ช่วงเวลา</span>
              <span className="text-label text-ink-300">งานขายตามรอบเวลา</span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex flex-wrap gap-1.5">
                {RANGE_PRESETS.map((range) => (
                  <button
                    key={range.key}
                    type="button"
                    onClick={() => applyRangePreset(range.key)}
                    className={`inline-flex min-h-11 shrink-0 items-center rounded-control border px-3 py-1.5 text-label font-medium transition-colors md:min-h-0 ${rangePreset === range.key ? "border-primary bg-primary text-white " : "border-line bg-white text-ink-600 hover:border-primary/40 hover:bg-blue-50/40"}`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
              {rangePreset === "custom" && (
                <div className="flex flex-wrap items-center gap-2 rounded-control border border-line bg-paper-field px-2 py-1">
                  <input
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={(e) => {
                      setDateFrom(e.target.value);
                      setRangePreset("custom");
                    }}
                    className="rounded-control border border-card-border bg-white px-2 py-1 text-label focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <span className="text-label text-ink-400">ถึง</span>
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(e) => {
                      setDateTo(e.target.value);
                      setRangePreset("custom");
                    }}
                    className="rounded-control border border-card-border bg-white px-2 py-1 text-label focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="grid grid-cols-1 gap-3 text-center sm:grid-cols-3 sm:gap-3">
            <div>
              <div className="text-subtitle font-semibold leading-none tabular-nums text-ink-900 sm:text-display">
                {periodFilteredDealItems.length}
              </div>
              <div className="mt-1 text-label text-ink-300">งานขายทั้งหมด</div>
              <div className="mt-0.5 text-label text-ink-200">
                กำลังทำ {activeDealItems.length} · เสร็จแล้ว {doneDealItems.length}
              </div>
            </div>
            <div>
              <div className="text-subtitle font-semibold leading-none tabular-nums text-ink-900 sm:text-display">
                ฿ {formatCurrency(totalReceived)}
              </div>
              <div className="mt-1 text-label text-ink-300">รับแล้วทั้งหมด</div>
            </div>
            <div>
              <div
                className={`text-subtitle font-semibold leading-none tabular-nums sm:text-display ${unpaid > 0 ? "text-danger" : "text-ink-900"}`}
              >
                ฿ {formatCurrency(unpaid)}
              </div>
              <div className="mt-1 text-label text-ink-300">ค้างชำระ</div>
            </div>
          </div>
        </Card>

        <div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
            <input
              type="text"
              placeholder="ค้นหาจากชื่อโครงการ เลขที่เอกสาร หรือรายการ..."
              value={dealSearchQuery}
              onChange={(e) => setDealSearchQuery(e.target.value)}
              className="w-full rounded-control border border-card-border bg-white pl-9 pr-3 py-2 text-body focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-label font-semibold text-ink-300">ประวัติงานขาย</div>
              <div className="mt-0.5 text-label text-ink-200">
                กำลังดำเนินการ {activeDealItems.length} · เสร็จสิ้น {doneDealItems.length}
              </div>
            </div>
          </div>

          <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(["all", "active", "partial", "done"] as const).map((tab) => {
              const count =
                tab === "all"
                  ? dealHistoryItems.length
                  : tab === "active"
                    ? activeDealItems.length
                    : tab === "partial"
                      ? partialDealItems.length
                      : doneDealItems.length;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setDealFilter(tab)}
                  className={`inline-flex min-h-11 shrink-0 items-center px-3 py-1.5 text-label rounded-control font-medium transition-colors md:min-h-0 ${dealFilter === tab ? "bg-primary text-white" : "bg-page-bg text-ink-300 hover:bg-line"}`}
                >
                  {tab === "all"
                    ? "ทั้งหมด"
                    : tab === "active"
                      ? "กำลังดำเนินการ"
                      : tab === "partial"
                        ? "ชำระบางส่วน"
                        : "เสร็จสิ้น"}{" "}
                  {count}
                </button>
              );
            })}
          </div>

          {filteredDealItems.length === 0 ? (
            <div className="text-center py-8 text-body text-ink-300">
              ยังไม่มีงานขาย — กด + สร้างงานขาย ด้านบนเพื่อเริ่ม
            </div>
          ) : (
            <div className={TABLE.cardWrapper}>
              <div className={TABLE.scrollBody}>
                <table className={`${TABLE.table} min-w-[520px]`}>
                  <thead>
                    <tr className={TABLE.theadTr}>
                      <SortableTh
                        label="งานขาย / เอกสาร"
                        align="left"
                        active={dealSort.sort.key === "title"}
                        dir={dealSort.sort.dir}
                        onClick={() => dealSort.handleSort("title")}
                        className={`${TABLE.thSortable} ${TABLE.thSticky} min-w-[200px]`}
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
                      const partialReceived = isPartial && rep ? rep.amount_received || 0 : 0;
                      return (
                        <tr
                          key={item.deal.id}
                          onClick={() => navigate(`/deals/${item.deal.id}`)}
                          className={`${TABLE.tbodyTr} group ${item.isDone ? "!bg-paper-field text-ink-400" : ""}`}
                        >
                          <td
                            className={`${TABLE.tdSticky} px-3 py-3 md:py-2 ${item.isDone ? "!bg-paper-field" : ""}`}
                          >
                            <div
                              className={`max-w-[280px] truncate font-medium ${item.isDone ? "text-ink-400" : "text-ink-900"}`}
                            >
                              {item.deal.title || item.deal.deal_number || "งานขาย"}
                            </div>
                            <div className="mt-0.5 truncate text-label text-ink-400">
                              {rep?.doc_number || "ยังไม่มีเลขเอกสาร"}
                              {item.latestDate && ` · ${formatBuddhistDate(item.latestDate)}`}
                            </div>
                          </td>
                          <td className="px-3 py-3 md:py-2">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-control text-label font-medium ${STAGE_COLORS[item.stage]}`}
                            >
                              {STAGE_LABELS[item.stage]}
                            </span>
                          </td>
                          <td
                            className={`px-3 py-3 md:py-2 text-right tabular-nums ${item.isDone ? "text-label text-ink-400" : "text-ink-900"}`}
                          >
                            <div className="font-semibold">฿ {formatCurrency(item.amount)}</div>
                            {item.credit > 0 && (
                              <div className="text-label font-medium text-blue-600">
                                เครดิต ฿{formatCurrency(item.credit)}
                              </div>
                            )}
                            {isPartial && partialReceived > 0 && (
                              <div className="text-label text-ink-400">
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
            </div>
          )}
        </div>
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDeleteConfirm(false)} />
          <div className="relative bg-white rounded-t-card md:rounded-card w-full max-w-sm p-5">
            <h3 className="text-title font-semibold mb-1">ลบ {customer.name}?</h3>
            <p className="text-body text-ink-300 mb-4">ข้อมูลงานขายและเอกสารทั้งหมดจะยังคงอยู่</p>
            <div className="flex gap-2">
              <Button
                variant="danger"
                onClick={handleDeactivate}
                disabled={deleting}
                loading={deleting}
                className="flex-1"
              >
                ลบลูกค้า
              </Button>
              <Button
                variant="secondary"
                onClick={() => setDeleteConfirm(false)}
                className="flex-1"
              >
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
