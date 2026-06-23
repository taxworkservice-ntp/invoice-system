import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MoreVertical } from "lucide-react";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { Spinner } from "../../../components/ui/Spinner";
import { Badge } from "../../../components/ui/Badge";
import { NewDealSheet } from "../../../components/home/NewDealSheet";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../hooks/useAuth";
import { useToast } from "../../../hooks/useToast";
import { formatBuddhistDate } from "../../../lib/dates";
import { formatCurrency } from "../../../lib/format";
import type { Customer, Deal, Document } from "../../../types";

interface DealWithDocs extends Deal {
  documents: Document[];
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
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
  const [saving, setSaving] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [newSheetOpen, setNewSheetOpen] = useState(false);

  const [dealFilter, setDealFilter] = useState<"all" | "active" | "done">("all");

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
    const { error: err } = await supabase
      .from("customers")
      .update({
        name: editName.trim(),
        tax_id: editTaxId || null,
        address: editAddress || null,
        phone: editPhone || null,
        email: editEmail || null,
        contact_name: editContact || null,
      })
      .eq("id", customer.id);
    if (err) {
      toast.error(err.message);
    } else {
      setCustomer({ ...customer, name: editName.trim(), tax_id: editTaxId || null, address: editAddress || null, phone: editPhone || null, email: editEmail || null, contact_name: editContact || null });
      toast.success("บันทึกแล้ว");
      setEditing(false);
    }
    setSaving(false);
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

  const filteredDeals = deals.filter((d) => {
    if (dealFilter === "all") return true;
    const latestDoc = d.documents?.[d.documents.length - 1];
    if (dealFilter === "active") return latestDoc && latestDoc.status !== "paid" && latestDoc.status !== "voided";
    return latestDoc && (latestDoc.status === "paid" || latestDoc.status === "voided");
  });

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
            + สร้าง deal
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
            <div className="flex items-start justify-between mb-3">
              <h2 className="text-[16px] font-bold text-[#1A1A18]">{customer.name}</h2>
              <button
                onClick={() => setEditing(true)}
                className="text-[12px] text-[#378ADD] hover:underline shrink-0"
              >
                แก้ไข
              </button>
            </div>
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
            </div>
            {showIncomplete && (
              <div className="mt-3 bg-[#FAEEDA] text-[#633806] text-[11px] rounded-md px-2.5 py-2">
                ⚠ ข้อมูลไม่ครบ — กรอกให้ครบเพื่อให้เอกสาร PDF แสดงถูกต้อง
              </div>
            )}
          </Card>
        )}

        <Card>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-[20px] font-bold text-[#1A1A18]">{deals.length}</div>
              <div className="text-[11px] text-[#888780]">deal ทั้งหมด</div>
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
          <div className="text-[11px] uppercase font-semibold text-[#888780] mb-2">
            ประวัติ deal
          </div>
          <div className="flex gap-2 mb-3">
            {(["all", "active", "done"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setDealFilter(tab)}
                className={`px-3 py-1.5 text-[12px] rounded-md font-medium transition-colors ${
                  dealFilter === tab
                    ? "bg-[#378ADD] text-white"
                    : "bg-[#F7F6F3] text-[#888780] hover:bg-[#E8E6DF]"
                }`}
              >
                {tab === "all" ? "ทั้งหมด" : tab === "active" ? "กำลังดำเนินการ" : "เสร็จสิ้น"}
              </button>
            ))}
          </div>

          {filteredDeals.length === 0 ? (
            <div className="text-center py-8 text-[13px] text-[#888780]">
              ยังไม่มี deal — กด + สร้าง deal ด้านบนเพื่อเริ่ม
            </div>
          ) : (
            <div className="space-y-2">
              {filteredDeals.map((deal) => {
                const sortedDocs = [...(deal.documents || [])].sort(
                  (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                );
                const latestDoc = sortedDocs.find((d) => d.status !== "voided") || sortedDocs[0];
                const billingDoc = sortedDocs.find((d) => d.doc_type === "billing_note" && d.status !== "voided");
                const amount = latestDoc?.total_amount || billingDoc?.net_payable || 0;

                return (
                  <Card key={deal.id} onClick={() => navigate(`/deals/${deal.id}`)}>
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-[#1A1A18] truncate">
                          {deal.title || "Deal"}
                        </div>
                        {latestDoc && (
                          <div className="text-[11px] text-[#888780] mt-0.5">
                            {latestDoc.doc_number || "ยังไม่มีเลขเอกสาร"}
                            {latestDoc.issue_date && ` · ${formatBuddhistDate(latestDoc.issue_date)}`}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <div className="text-[13px] font-semibold text-[#1A1A18]">
                          ฿ {formatCurrency(amount)}
                        </div>
                        {latestDoc && (
                          <div className="mt-1">
                            <Badge status={latestDoc.status} />
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDeleteConfirm(false)} />
          <div className="relative bg-white rounded-t-xl md:rounded-xl w-full max-w-sm p-5 shadow-xl">
            <h3 className="text-base font-semibold mb-1">ลบ {customer.name}?</h3>
            <p className="text-sm text-[#888780] mb-4">ข้อมูล deal และเอกสารทั้งหมดจะยังคงอยู่</p>
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
        onSelect={(type) => {
          setNewSheetOpen(false);
          navigate(`/deals/new?type=${type}&customer_id=${customer.id}`);
        }}
      />
    </AppShell>
  );
}
