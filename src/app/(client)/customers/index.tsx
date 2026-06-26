import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutGrid, List, AlertTriangle } from "lucide-react";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { EmptyState } from "../../../components/ui/EmptyState";
import { useCustomers } from "../../../hooks/useCustomers";
import { useAuth } from "../../../hooks/useAuth";
import { useToast } from "../../../hooks/useToast";
import { supabase } from "../../../lib/supabase";
import type { Customer } from "../../../types";

type ViewMode = "list" | "grid";

export default function CustomersPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const toast = useToast();
  const { customers, loading, refetch } = useCustomers(profile?.id);
  const [search, setSearch] = useState("");
  const [dealCounts, setDealCounts] = useState<Record<string, number>>({});
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "list";
    const stored = window.localStorage.getItem("customersViewMode");
    return stored === "grid" || stored === "list" ? stored : "list";
  });

  useEffect(() => {
    window.localStorage.setItem("customersViewMode", viewMode);
  }, [viewMode]);

  const getInitials = (name: string) => {
    const cleaned = name.replace(/^บริษัท\s+|^ห้างหุ้นส่วนจำกัด\s+|^ร้าน\s+/i, "").trim();
    if (!cleaned) return "?";
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  };

  const avatarColor = (name: string) => {
    const palette = [
      "bg-[#E8F1FB] text-[#378ADD]",
      "bg-[#FDE9E7] text-[#C2410C]",
      "bg-[#E6F4EA] text-[#1E7E34]",
      "bg-[#FEF3E2] text-[#B45309]",
      "bg-[#F0E7F8] text-[#7C3AED]",
      "bg-[#FCE7F3] text-[#BE185D]",
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return palette[hash % palette.length];
  };

  const [newName, setNewName] = useState("");
  const [newTaxId, setNewTaxId] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newContact, setNewContact] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!profile?.id) return;
      supabase
        .from("deals")
        .select("customer_id")
        .eq("user_id", profile.id)
        .then(({ data }) => {
          if (!data) return;
          const counts: Record<string, number> = {};
          for (const d of data) {
            counts[d.customer_id] = (counts[d.customer_id] || 0) + 1;
          }
          setDealCounts(counts);
        });
    }, 100);
    return () => clearTimeout(timer);
  }, [profile?.id, customers]);

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.tax_id && c.tax_id.includes(q)),
    );
  }, [customers, search]);

  async function handleAddCustomer() {
    if (!newName.trim() || !profile?.id) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .insert({
          user_id: profile.id,
          name: newName.trim(),
          tax_id: newTaxId || null,
          address: newAddress || null,
          phone: newPhone || null,
          email: newEmail || null,
          contact_name: newContact || null,
          is_active: true,
        })
        .select("*")
        .single();

      if (error) throw error;

      setNewName("");
      setNewTaxId("");
      setNewAddress("");
      setNewPhone("");
      setNewEmail("");
      setNewContact("");
      setShowAddSheet(false);
      toast.success("เพิ่มลูกค้าแล้ว");
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
    setSaving(false);
  }

  const isIncomplete = (c: Customer) => !c.tax_id && !c.address;

  return (
    <AppShell title="ลูกค้า">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <input
              type="text"
              className="w-full bg-[#F7F6F3] border-[0.5px] border-[#E8E6DF] rounded-lg px-[14px] py-[10px] text-[14px] placeholder-[#AAAAAA] focus:outline-none focus:border-[#378ADD] focus:ring-1 focus:ring-[#378ADD]/20 transition-colors"
              placeholder="ค้นหาชื่อลูกค้า หรือเลขผู้เสียภาษี..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center bg-[#F7F6F3] border-[0.5px] border-[#E8E6DF] rounded-lg p-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              aria-label="มุมมองรายการ"
              aria-pressed={viewMode === "list"}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === "list" ? "bg-white text-[#1A1A18] shadow-sm" : "text-[#888780] hover:text-[#1A1A18]"
              }`}
            >
              <List size={16} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-label="มุมมองตาราง"
              aria-pressed={viewMode === "grid"}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === "grid" ? "bg-white text-[#1A1A18] shadow-sm" : "text-[#888780] hover:text-[#1A1A18]"
              }`}
            >
              <LayoutGrid size={16} />
            </button>
          </div>
          <Button size="sm" onClick={() => setShowAddSheet(true)} className="!rounded-lg shrink-0">
            + เพิ่ม
          </Button>
        </div>

        {loading ? (
          <div className={viewMode === "grid"
            ? "grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
            : "space-y-2"
          }>
            {[...Array(viewMode === "grid" ? 10 : 4)].map((_, i) => (
              <div key={i} className="bg-white border border-[#E8E6DF] rounded-[10px] p-4 animate-pulse min-h-[120px]">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          customers.length === 0 ? (
            <EmptyState
              title="ยังไม่มีลูกค้า"
              description="ลูกค้าจะปรากฏที่นี่เมื่อคุณสร้าง deal แรก หรือเพิ่มลูกค้าได้เลย"
              action={<Button onClick={() => setShowAddSheet(true)}>+ เพิ่มลูกค้า</Button>}
            />
          ) : (
            <div className="text-center py-12 text-[13px] text-[#888780]">
              <p>ไม่พบ "{search}"</p>
              <p className="mt-1">ลองค้นหาด้วยชื่อหรือเลขผู้เสียภาษี</p>
            </div>
          )
        ) : viewMode === "grid" ? (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((c) => {
              const count = dealCounts[c.id] || 0;
              const incomplete = isIncomplete(c);
              return (
                <Card key={c.id} onClick={() => navigate(`/customers/${c.id}`)} className="!p-3.5 flex flex-col gap-2.5 min-h-[120px]">
                  <div className="flex items-start gap-2.5">
                    <div className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center text-[13px] font-semibold ${avatarColor(c.name)}`}>
                      {getInitials(c.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-[#1A1A18] line-clamp-2 leading-tight">
                        {c.name}
                      </div>
                      {c.tax_id ? (
                        <div className="text-[11px] text-[#888780] mt-1 font-mono truncate">
                          {c.tax_id}
                        </div>
                      ) : (
                        <div className="text-[11px] text-[#AAAAAA] mt-1 italic">
                          ไม่มีเลขผู้เสียภาษี
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 mt-auto border-t border-[#F0EFE9]">
                    {incomplete ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#FAEEDA] text-[#633806]">
                        <AlertTriangle size={10} />
                        ข้อมูลไม่ครบ
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#AAAAAA]">ข้อมูลครบ</span>
                    )}
                    {count > 0 ? (
                      <span className="text-[11px] text-[#378ADD] font-medium">
                        {count} deals →
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#AAAAAA]">ยังไม่มี deal</span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => {
              const count = dealCounts[c.id] || 0;
              return (
                <Card key={c.id} onClick={() => navigate(`/customers/${c.id}`)}>
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-[14px] font-semibold text-[#1A1A18] truncate">
                          {c.name}
                        </div>
                        {isIncomplete(c) && (
                          <span className="inline-flex shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#FAEEDA] text-[#633806]">
                            ⚠ ข้อมูลไม่ครบ
                          </span>
                        )}
                      </div>
                      {c.tax_id && (
                        <div className="text-[12px] text-[#888780] mt-0.5">
                          เลขผู้เสียภาษี: {c.tax_id}
                        </div>
                      )}
                      {c.phone && (
                        <div className="text-[12px] text-[#888780] mt-0.5">
                          {c.phone}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      {count > 0 ? (
                        <span className="text-[12px] text-[#378ADD]">{count} deals →</span>
                      ) : (
                        <span className="text-[12px] text-[#AAAAAA]">ยังไม่มี deal</span>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {showAddSheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowAddSheet(false)} />
          <div className="relative bg-white rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 shadow-xl mx-4">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
            <h2 className="text-[16px] font-semibold text-[#1A1A18] mb-4">เพิ่มลูกค้าใหม่</h2>

            <div className="space-y-3">
              <Input
                label="ชื่อบริษัท / ชื่อลูกค้า *"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="เช่น บริษัท มาลี จำกัด หรือ คุณสมชาย"
                autoFocus
              />
              <div>
                <Input
                  label="เลขผู้เสียภาษี (13 หลัก)"
                  value={newTaxId}
                  onChange={(e) => setNewTaxId(e.target.value)}
                  placeholder="13 หลัก (ถ้ามี)"
                />
                <p className="text-[11px] text-[#888780] mt-1">จำเป็นสำหรับใบกำกับภาษี</p>
              </div>
              <Input
                label="ที่อยู่"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="ที่อยู่สำหรับพิมพ์บนเอกสาร"
              />
              <Input
                label="เบอร์โทร"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
              <Input
                label="อีเมล"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                type="email"
              />
              <Input
                label="ชื่อผู้ติดต่อ"
                value={newContact}
                onChange={(e) => setNewContact(e.target.value)}
                placeholder="ชื่อคนที่ติดต่อด้วย"
              />

              <div className="flex gap-2 pt-2">
                <Button onClick={handleAddCustomer} disabled={!newName.trim() || saving} loading={saving} className="flex-1">
                  บันทึก
                </Button>
                <Button variant="secondary" onClick={() => setShowAddSheet(false)} className="flex-1">
                  ยกเลิก
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
