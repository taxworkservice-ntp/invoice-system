import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, ChevronDown, MoreVertical, RotateCcw } from "lucide-react";
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
import { useAuth, useClientProfile } from "../../../hooks/useAuth";
import { useToast } from "../../../hooks/useToast";
import { formatBuddhistDate } from "../../../lib/dates";
import { formatCurrency } from "../../../lib/format";
import type { Customer, Deal, Document } from "../../../types";

const AVATAR_PRESET_COLORS = [
  "#378ADD", "#C2410C", "#1E7E34", "#B45309",
  "#7C3AED", "#BE185D", "#0F766E", "#1565C0",
  "#DC2626", "#EA580C", "#CA8A04", "#16A34A",
  "#0891B2", "#9333EA", "#DB2777", "#475569",
];

interface DealWithDocs extends Deal {
  documents: Document[];
}

type DealFilter = "all" | "active" | "done";

type DealHistoryItem = {
  deal: DealWithDocs;
  latestDoc: Document | null;
  amount: number;
  isDone: boolean;
  latestDate: string;
};

const DEAL_HISTORY_VIEW_STORAGE_KEY = "customer_deal_history_view";

function isResolvedDealDocument(doc: Document | null) {
  if (!doc) return false;
  return ["paid", "voided", "generated", "issued"].includes(doc.status);
}

function getSortedDocs(deal: DealWithDocs) {
  return [...(deal.documents || [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function getDealHistoryItem(deal: DealWithDocs): DealHistoryItem {
  const sortedDocs = getSortedDocs(deal);
  const latestDoc = sortedDocs.find((doc) => doc.status !== "voided") || sortedDocs[0] || null;
  const billingDoc = sortedDocs.find((doc) => doc.doc_type === "billing_note" && doc.status !== "voided") || null;
  const amountDoc = billingDoc || latestDoc;
  const amount = amountDoc?.net_payable || amountDoc?.total_amount || 0;
  const latestDate = latestDoc?.issue_date || latestDoc?.updated_at || deal.updated_at;

  return {
    deal,
    latestDoc,
    amount,
    isDone: isResolvedDealDocument(latestDoc),
    latestDate,
  };
}

export default function CustomerDetailPage() {
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
        .order("updated_at", { ascending: false }),
    ]).then(([custRes, dealsRes]) => {
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
        setEditCreditTerm(custRes.data.credit_term_days != null ? String(custRes.data.credit_term_days) : "");
        setEditAvatarInitials(custRes.data.avatar_initials || "");
        setEditAvatarColor(custRes.data.avatar_color || "");
        setUseCustomAvatar(Boolean(custRes.data.avatar_initials || custRes.data.avatar_color));
      }
      if (dealsRes.data) {
        setDeals(dealsRes.data as unknown as DealWithDocs[]);
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
    setSaving(true);
    const avatarInitials = useCustomAvatar && editAvatarInitials.trim() ? editAvatarInitials.trim().toUpperCase().slice(0, 2) : null;
    const avatarColor = useCustomAvatar && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(editAvatarColor) ? editAvatarColor : null;
    const { error: err } = await supabase
      .from("customers")
      .update({
        name: editName.trim(),
        tax_id: editTaxId || null,
        address: editAddress || null,
        phone: editPhone || null,
        email: editEmail || null,
        contact_name: editContact || null,
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
    const avatarInitials = useCustomAvatar && editAvatarInitials.trim() ? editAvatarInitials.trim().toUpperCase().slice(0, 2) : null;
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
    () => deals.map(getDealHistoryItem),
    [deals],
  );

  const activeDealItems = useMemo(
    () => dealHistoryItems.filter((item) => !item.isDone),
    [dealHistoryItems],
  );

  const doneDealItems = useMemo(
    () => dealHistoryItems.filter((item) => item.isDone),
    [dealHistoryItems],
  );

  const filteredDealItems = useMemo(() => {
    if (dealFilter === "active") return activeDealItems;
    if (dealFilter === "done") return doneDealItems;
    return [...activeDealItems, ...doneDealItems];
  }, [activeDealItems, dealFilter, doneDealItems]);

  const dealRows = useMemo(
    () =>
      filteredDealItems.map((item) => ({
        ...item,
        title: item.deal.title || "งานขาย",
        status: item.latestDoc?.status || "",
      })),
    [filteredDealItems],
  );
  type DealSortKey = "title" | "latestDate" | "status" | "amount";
  const dealSort = useTableSort<(typeof dealRows)[number], DealSortKey>(dealRows, { key: "latestDate", dir: "desc" });

  const totalReceived = deals.reduce((sum, d) => {
    const paidDoc = d.documents?.find((doc) => doc.status === "paid" && doc.doc_type === "billing_note");
    return sum + (paidDoc?.amount_received || 0);
  }, 0);

  const unpaid = deals.reduce((sum, d) => {
    const sentDoc = d.documents?.find((doc) => doc.status === "sent" || doc.status === "overdue");
    return sum + (sentDoc?.net_payable || 0);
  }, 0);

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
                        ตัวอักษร (สูงสุด 2 ตัว)
                      </div>
                      <Input
                        value={editAvatarInitials}
                        onChange={(e) => setEditAvatarInitials(e.target.value.toUpperCase().slice(0, 2))}
                        placeholder="เช่น BP"
                        maxLength={2}
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
              <div className="text-[20px] font-bold text-[#1A1A18]">{deals.length}</div>
              <div className="text-[11px] text-[#888780]">งานขายทั้งหมด</div>
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
            {(["all", "active", "done"] as const).map((tab) => {
              const count = tab === "all" ? dealHistoryItems.length : tab === "active" ? activeDealItems.length : doneDealItems.length;
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
                  {tab === "all" ? "ทั้งหมด" : tab === "active" ? "กำลังดำเนินการ" : "เสร็จสิ้น"} {count}
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
                          {item.deal.title || "งานขาย"}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#888780]">
                          {item.latestDoc?.doc_number || "ยังไม่มีเลขเอกสาร"}
                          {item.latestDate && ` · ${formatBuddhistDate(item.latestDate)}`}
                        </div>
                      </div>
                      <div className="ml-3 shrink-0 text-right">
                        <div className={`font-semibold ${item.isDone ? "text-[12px] text-[#8A8478]" : "text-[13px] text-[#1A1A18]"}`}>
                          ฿ {formatCurrency(item.amount)}
                        </div>
                        {item.latestDoc && (
                          <div className="mt-1">
                            <Badge status={item.latestDoc.status} />
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
              <div className="hidden overflow-hidden rounded-card border border-card-border bg-white sm:block">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-card-border bg-[#F7F6F3] text-left text-[11px] uppercase tracking-wide text-[#888780]">
                      <SortableTh
                        label="งานขาย / เอกสารล่าสุด"
                        align="left"
                        active={dealSort.sort.key === "title"}
                        dir={dealSort.sort.dir}
                        onClick={() => dealSort.handleSort("title")}
                        className="!text-[#888780] !text-[11px] !font-semibold !tracking-wide !uppercase"
                      />
                      <SortableTh
                        label="วันที่"
                        align="left"
                        active={dealSort.sort.key === "latestDate"}
                        dir={dealSort.sort.dir}
                        onClick={() => dealSort.handleSort("latestDate")}
                        className="!text-[#888780] !text-[11px] !font-semibold !tracking-wide !uppercase"
                      />
                      <SortableTh
                        label="สถานะ"
                        align="left"
                        active={dealSort.sort.key === "status"}
                        dir={dealSort.sort.dir}
                        onClick={() => dealSort.handleSort("status")}
                        className="!text-[#888780] !text-[11px] !font-semibold !tracking-wide !uppercase"
                      />
                      <SortableTh
                        label="ยอด"
                        align="right"
                        active={dealSort.sort.key === "amount"}
                        dir={dealSort.sort.dir}
                        onClick={() => dealSort.handleSort("amount")}
                        className="!text-[#888780] !text-[11px] !font-semibold !tracking-wide !uppercase"
                      />
                      <th className="px-3 py-2 text-right font-semibold">เปิด</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-card-border">
                    {dealSort.sorted.map((item) => (
                      <tr
                        key={item.deal.id}
                        onClick={() => navigate(`/deals/${item.deal.id}`)}
                        className={`cursor-pointer transition-colors hover:bg-[#FAF8F3] ${
                          item.isDone ? "bg-[#FAFAF8] text-[#8A8478]" : "bg-white text-[#1A1A18]"
                        }`}
                      >
                        <td className="px-3 py-2">
                          <div className={`max-w-[280px] truncate font-medium ${item.isDone ? "text-[#777166]" : "text-[#1A1A18]"}`}>
                            {item.deal.title || "งานขาย"}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-[#888780]">
                            {item.latestDoc?.doc_number || "ยังไม่มีเลขเอกสาร"}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-[12px] text-[#888780]">
                          {item.latestDate ? formatBuddhistDate(item.latestDate) : "-"}
                        </td>
                        <td className="px-3 py-2">
                          {item.latestDoc ? <Badge status={item.latestDoc.status} /> : <span className="text-[12px] text-[#AAA49A]">-</span>}
                        </td>
                        <td className={`px-3 py-2 text-right font-semibold ${item.isDone ? "text-[12px] text-[#8A8478]" : "text-[#1A1A18]"}`}>
                          ฿ {formatCurrency(item.amount)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end">
                            <ArrowRight className="h-4 w-4 text-[#AAA49A]" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {(dealFilter === "all" ? [
                { key: "active", title: "กำลังดำเนินการ", items: activeDealItems },
                { key: "done", title: "เสร็จสิ้นแล้ว", items: doneDealItems },
              ] : [{ key: dealFilter, title: dealFilter === "active" ? "กำลังดำเนินการ" : "เสร็จสิ้นแล้ว", items: filteredDealItems }])
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
                              {item.deal.title || "งานขาย"}
                            </div>
                            {item.latestDoc && (
                              <div className="text-[11px] text-[#888780] mt-0.5">
                                {item.latestDoc.doc_number || "ยังไม่มีเลขเอกสาร"}
                                {item.latestDoc.issue_date && ` · ${formatBuddhistDate(item.latestDoc.issue_date)}`}
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <div className={`font-semibold ${item.isDone ? "text-[12px] text-[#8A8478]" : "text-[13px] text-[#1A1A18]"}`}>
                              ฿ {formatCurrency(item.amount)}
                            </div>
                            {item.latestDoc && (
                              <div className="mt-1">
                                <Badge status={item.latestDoc.status} />
                              </div>
                            )}
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
        onSelect={(type) => {
          setNewSheetOpen(false);
          navigate(`/deals/new?type=${type}&customer_id=${customer.id}`);
        }}
      />
    </AppShell>
  );
}
