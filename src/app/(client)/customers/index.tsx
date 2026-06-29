import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Star, X, Briefcase } from "lucide-react";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ViewToggle } from "../../../components/ui/ViewToggle";
import type { ViewMode } from "../../../components/ui/ViewToggle";
import { SortableTh } from "../../../components/ui/SortableTh";
import { useTableSort } from "../../../components/ui/useTableSort";
import { CustomerAvatar } from "../../../components/customer/CustomerAvatar";
import { useCustomers } from "../../../hooks/useCustomers";
import { useAuth } from "../../../hooks/useAuth";
import { useToast } from "../../../hooks/useToast";
import { supabase } from "../../../lib/supabase";
import type { Customer } from "../../../types";

type FilterMode = "all" | "favorites" | "hasDeals";

export default function CustomersPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const toast = useToast();
  const { customers, loading, refetch, updateCustomerLocal } = useCustomers(profile?.id);
  const [search, setSearch] = useState("");
  const [dealCounts, setDealCounts] = useState<Record<string, number>>({});
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "list";
    const stored = window.localStorage.getItem("customersViewMode");
    return stored === "grid" || stored === "list" || stored === "table" ? stored : "list";
  });
  const [filterMode, setFilterMode] = useState<FilterMode>(() => {
    if (typeof window === "undefined") return "all";
    const stored = window.localStorage.getItem("customersFilterMode");
    return stored === "all" || stored === "favorites" || stored === "hasDeals" ? stored : "all";
  });
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.localStorage.setItem("customersViewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    window.localStorage.setItem("customersFilterMode", filterMode);
  }, [filterMode]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (search.trim() && filterMode !== "all") {
      setFilterMode("all");
    }
  }, [search, filterMode]);

  async function toggleFavorite(c: Customer, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const next = !c.is_favorite;
    updateCustomerLocal(c.id, { is_favorite: next });
    const { error } = await supabase
      .from("customers")
      .update({ is_favorite: next })
      .eq("id", c.id);
    if (error) {
      updateCustomerLocal(c.id, { is_favorite: !next });
      toast.error(error.message);
    }
  }

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
    let list = customers;
    if (filterMode === "favorites") list = list.filter((c) => c.is_favorite);
    if (filterMode === "hasDeals") list = list.filter((c) => (dealCounts[c.id] || 0) > 0);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.tax_id && c.tax_id.includes(q)) ||
          (c.address && c.address.toLowerCase().includes(q)) ||
          (c.phone && c.phone.toLowerCase().includes(q)) ||
          (c.contact_name && c.contact_name.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [customers, search, filterMode, dealCounts]);

  const customerRows = useMemo(
    () => filtered.map((c) => ({ ...c, dealCount: dealCounts[c.id] || 0 })),
    [filtered, dealCounts],
  );
  type CustomerSortKey = "name" | "tax_id" | "phone" | "dealCount" | "is_active";
  const customerSort = useTableSort<(typeof customerRows)[number], CustomerSortKey>(customerRows, { key: "name", dir: "asc" });

  const favoriteCount = useMemo(() => customers.filter((c) => c.is_favorite).length, [customers]);
  const hasDealsCount = useMemo(
    () => customers.filter((c) => (dealCounts[c.id] || 0) > 0).length,
    [customers, dealCounts],
  );

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
          <div className="flex-1 relative">
            <input
              ref={searchRef}
              type="text"
              className="w-full bg-[#F7F6F3] border-[0.5px] border-[#E8E6DF] rounded-lg px-[14px] py-[10px] text-[14px] placeholder-[#AAAAAA] focus:outline-none focus:border-[#378ADD] focus:ring-1 focus:ring-[#378ADD]/20 transition-colors"
              placeholder="ค้นหาชื่อลูกค้า หรือเลขผู้เสียภาษี..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  searchRef.current?.focus();
                }}
                aria-label="ล้างการค้นหา"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-[#888780] hover:text-[#1A1A18] hover:bg-[#E8E6DF] transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <Button size="sm" onClick={() => setShowAddSheet(true)} className="!rounded-lg shrink-0">
            + เพิ่ม
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterMode("all")}
            className={`px-3 py-1.5 text-[12px] rounded-md font-medium transition-colors ${
              filterMode === "all"
                ? "bg-[#1A1A18] text-white"
                : "bg-[#F7F6F3] text-[#888780] hover:bg-[#E8E6DF]"
            }`}
          >
            ทั้งหมด {customers.length > 0 && <span className="ml-1 opacity-70">{customers.length}</span>}
          </button>
          <button
            type="button"
            onClick={() => setFilterMode((prev) => (prev === "favorites" ? "all" : "favorites"))}
            className={`px-3 py-1.5 text-[12px] rounded-md font-medium transition-colors inline-flex items-center gap-1 ${
              filterMode === "favorites"
                ? "bg-[#F59E0B] text-white"
                : "bg-[#FEF3E2] text-[#B45309] hover:bg-[#FDE9C4]"
            }`}
          >
            <Star size={12} className={filterMode === "favorites" ? "fill-current" : ""} />
            รายการโปรด {favoriteCount > 0 && <span className="ml-1 opacity-70">{favoriteCount}</span>}
          </button>
          <button
            type="button"
            onClick={() => setFilterMode((prev) => (prev === "hasDeals" ? "all" : "hasDeals"))}
            className={`px-3 py-1.5 text-[12px] rounded-md font-medium transition-colors inline-flex items-center gap-1 ${
              filterMode === "hasDeals"
                ? "bg-[#22C55E] text-white"
                : "bg-[#DCFCE7] text-[#15803D] hover:bg-[#BBF7D0]"
            }`}
          >
            <Briefcase size={12} />
            มีงานขาย {hasDealsCount > 0 && <span className="ml-1 opacity-70">{hasDealsCount}</span>}
          </button>
        </div>

        {(search.trim() || filterMode !== "all") && customers.length > 0 && (
          <div className="text-[11px] text-[#888780]">
            แสดง {filtered.length} จาก {customers.length} รายการ
          </div>
        )}

        {loading ? (
          <div className={viewMode === "grid"
            ? "grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            : viewMode === "table"
            ? "bg-white border border-card-border rounded-card overflow-hidden"
            : "space-y-2"
          }>
            {viewMode === "table" ? (
              <div className="p-4 space-y-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-8 bg-gray-200 rounded animate-pulse" />
                ))}
              </div>
            ) : (
              [...Array(viewMode === "grid" ? 6 : 4)].map((_, i) => (
                <div key={i} className="bg-white border border-[#E8E6DF] rounded-[10px] p-4 animate-pulse min-h-[120px]">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              ))
            )}
          </div>
        ) : filtered.length === 0 ? (
          customers.length === 0 ? (
            <EmptyState
              title="ยังไม่มีลูกค้า"
              description="ลูกค้าจะปรากฏที่นี่เมื่อคุณเริ่มงานขายแรก หรือเพิ่มลูกค้าได้เลย"
              action={<Button onClick={() => setShowAddSheet(true)}>+ เพิ่มลูกค้า</Button>}
            />
          ) : (
            <div className="text-center py-12 text-[13px] text-[#888780]">
              {filterMode === "favorites" && favoriteCount === 0 ? (
                <>
                  <Star size={28} className="mx-auto mb-2 text-[#AAAAAA]" />
                  <p>ยังไม่มีรายการโปรด</p>
                  <p className="mt-1">กด ★ ที่การ์ดลูกค้าเพื่อเพิ่มเป็นรายการโปรด</p>
                </>
              ) : filterMode === "hasDeals" && hasDealsCount === 0 ? (
                <>
                  <Briefcase size={28} className="mx-auto mb-2 text-[#AAAAAA]" />
                  <p>ยังไม่มีลูกค้าที่มีงานขาย</p>
                  <p className="mt-1">สร้างงานขายกับลูกค้าก่อน แล้วจะปรากฏที่นี่</p>
                </>
              ) : filterMode === "favorites" ? (
                <>
                  <p>ไม่พบ "{search}" ในรายการโปรด</p>
                  <p className="mt-1">ลองค้นหาด้วยชื่อหรือเลขผู้เสียภาษี</p>
                </>
              ) : filterMode === "hasDeals" ? (
                <>
                  <p>ไม่พบ "{search}" ในลูกค้าที่มีงานขาย</p>
                  <p className="mt-1">ลองค้นหาด้วยชื่อหรือเลขผู้เสียภาษี</p>
                </>
              ) : (
                <>
                  <p>ไม่พบ "{search}"</p>
                  <p className="mt-1">ลองค้นหาด้วยชื่อหรือเลขผู้เสียภาษี</p>
                </>
              )}
            </div>
          )
        ) : viewMode === "grid" ? (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((c) => {
              const count = dealCounts[c.id] || 0;
              const incomplete = isIncomplete(c);
              return (
                <Card key={c.id} onClick={() => navigate(`/customers/${c.id}`)} className="!p-3.5 flex flex-col gap-2.5 min-h-[120px] relative">
                  <button
                    type="button"
                    onClick={(e) => toggleFavorite(c, e)}
                    aria-label={c.is_favorite ? "เลิกรายการโปรด" : "เพิ่มเป็นรายการโปรด"}
                    aria-pressed={c.is_favorite}
                    className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#F7F6F3] transition-colors"
                  >
                    <Star
                      size={16}
                      className={c.is_favorite ? "fill-[#F59E0B] text-[#F59E0B]" : "text-[#AAAAAA] hover:text-[#F59E0B]"}
                    />
                  </button>
                  <div className="flex items-start gap-2.5 pr-7">
                    <CustomerAvatar customer={c} size="md" />
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
                        {count} งานขาย →
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#AAAAAA]">ยังไม่มีงานขาย</span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : viewMode === "table" ? (
          <div className="bg-white border border-card-border rounded-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-[#F7F6F3] border-b border-card-border text-left text-[11px] uppercase tracking-wide text-[#888780]">
                    <th className="px-3 py-2 w-10"></th>
                    <SortableTh
                      label="ชื่อลูกค้า"
                      align="left"
                      active={customerSort.sort.key === "name"}
                      dir={customerSort.sort.dir}
                      onClick={() => customerSort.handleSort("name")}
                      className="!text-[#888780] !text-[11px] !font-semibold !tracking-wide !uppercase"
                    />
                    <SortableTh
                      label="เลขผู้เสียภาษี"
                      align="left"
                      active={customerSort.sort.key === "tax_id"}
                      dir={customerSort.sort.dir}
                      onClick={() => customerSort.handleSort("tax_id")}
                      className="!text-[#888780] !text-[11px] !font-semibold !tracking-wide !uppercase hidden sm:table-cell"
                    />
                    <SortableTh
                      label="เบอร์โทร"
                      align="left"
                      active={customerSort.sort.key === "phone"}
                      dir={customerSort.sort.dir}
                      onClick={() => customerSort.handleSort("phone")}
                      className="!text-[#888780] !text-[11px] !font-semibold !tracking-wide !uppercase hidden md:table-cell"
                    />
                    <SortableTh
                      label="งานขาย"
                      align="right"
                      active={customerSort.sort.key === "dealCount"}
                      dir={customerSort.sort.dir}
                      onClick={() => customerSort.handleSort("dealCount")}
                      className="!text-[#888780] !text-[11px] !font-semibold !tracking-wide !uppercase"
                    />
                    <SortableTh
                      label="สถานะ"
                      align="left"
                      active={customerSort.sort.key === "is_active"}
                      dir={customerSort.sort.dir}
                      onClick={() => customerSort.handleSort("is_active")}
                      className="!text-[#888780] !text-[11px] !font-semibold !tracking-wide !uppercase hidden sm:table-cell"
                    />
                  </tr>
                </thead>
                <tbody>
                  {customerSort.sorted.map((c) => {
                    const count = c.dealCount;
                    const incomplete = isIncomplete(c);
                    return (
                      <tr
                        key={c.id}
                        onClick={() => navigate(`/customers/${c.id}`)}
                        className="border-b border-[#F0EFE9] last:border-0 hover:bg-[#FAFAF7] cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={(e) => toggleFavorite(c, e)}
                            aria-label={c.is_favorite ? "เลิกรายการโปรด" : "เพิ่มเป็นรายการโปรด"}
                            aria-pressed={c.is_favorite}
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#F0EFE9] transition-colors"
                          >
                            <Star
                              size={14}
                              className={c.is_favorite ? "fill-[#F59E0B] text-[#F59E0B]" : "text-[#AAAAAA] hover:text-[#F59E0B]"}
                            />
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <CustomerAvatar customer={c} size="sm" />
                            <span className="font-semibold text-[#1A1A18] truncate">{c.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-[12px] text-[#444441] hidden sm:table-cell">
                          {c.tax_id || <span className="text-[#AAAAAA] italic font-sans">—</span>}
                        </td>
                        <td className="px-3 py-2 text-[#444441] hidden md:table-cell">
                          {c.phone || <span className="text-[#AAAAAA] italic">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {count > 0 ? (
                            <span className="text-[#378ADD] font-medium">{count}</span>
                          ) : (
                            <span className="text-[#AAAAAA]">0</span>
                          )}
                        </td>
                        <td className="px-3 py-2 hidden sm:table-cell">
                          {incomplete ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#FAEEDA] text-[#633806]">
                              <AlertTriangle size={10} />
                              ไม่ครบ
                            </span>
                          ) : (
                            <span className="text-[10px] text-[#AAAAAA]">ครบ</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => {
              const count = dealCounts[c.id] || 0;
              return (
                <Card key={c.id} onClick={() => navigate(`/customers/${c.id}`)}>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={(e) => toggleFavorite(c, e)}
                      aria-label={c.is_favorite ? "เลิกรายการโปรด" : "เพิ่มเป็นรายการโปรด"}
                      aria-pressed={c.is_favorite}
                      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#F7F6F3] transition-colors"
                    >
                      <Star
                        size={16}
                        className={c.is_favorite ? "fill-[#F59E0B] text-[#F59E0B]" : "text-[#AAAAAA] hover:text-[#F59E0B]"}
                      />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-[14px] font-semibold text-[#1A1A18] truncate">
                          {c.name}
                        </div>
                        {isIncomplete(c) && (
                          <span className="inline-flex shrink-0 items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#FAEEDA] text-[#633806]">
                            <AlertTriangle size={10} />
                            ข้อมูลไม่ครบ
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
                    <div className="text-right shrink-0">
                      {count > 0 ? (
                        <span className="text-[12px] text-[#378ADD]">{count} งานขาย →</span>
                      ) : (
                        <span className="text-[12px] text-[#AAAAAA]">ยังไม่มีงานขาย</span>
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
