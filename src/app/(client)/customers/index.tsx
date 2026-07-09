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
import { TABLE } from "../../../lib/tableStyles";
import type { Customer, DocumentStatus, DocumentType } from "../../../types";

type FilterMode = "all" | "favorites" | "hasDeals";
const SALES_JOB_DOCUMENT_TYPES = ["quotation", "invoice", "tax_invoice_receipt", "delivery_note"];
const RESOLVED_DEAL_STATUSES = new Set<DocumentStatus>(["paid", "converted", "generated", "issued", "voided"]);
const EMPTY_DEAL_STATS = { active: 0, done: 0, total: 0 };

type CustomerDealStats = typeof EMPTY_DEAL_STATS;
type SalesJobDocumentRow = {
  customer_id: string | null;
  deal_id: string | null;
  doc_type: DocumentType;
  status: DocumentStatus;
  created_at: string;
};
type DealDocumentAccumulator = {
  hasSalesJobDocument: boolean;
  latestDoc: SalesJobDocumentRow;
};

function isResolvedDealStatus(status: DocumentStatus) {
  return RESOLVED_DEAL_STATUSES.has(status);
}

export default function CustomersPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const toast = useToast();
  const { customers, loading, refetch, updateCustomerLocal } = useCustomers(profile?.id);
  const [search, setSearch] = useState("");
  const [dealStats, setDealStats] = useState<Record<string, CustomerDealStats>>({});
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
  const [newCode, setNewCode] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!profile?.id) return;
      supabase
        .from("documents")
        .select("customer_id, deal_id, doc_type, status, created_at")
        .eq("user_id", profile.id)
        .neq("status", "voided")
        .not("deal_id", "is", null)
        .then(({ data }) => {
          if (!data) return;
          const dealDocsByCustomer: Record<string, Record<string, DealDocumentAccumulator>> = {};
          for (const doc of data as SalesJobDocumentRow[]) {
            if (!doc.customer_id || !doc.deal_id) continue;
            if (!dealDocsByCustomer[doc.customer_id]) dealDocsByCustomer[doc.customer_id] = {};

            const current = dealDocsByCustomer[doc.customer_id][doc.deal_id];
            const isSalesJobDoc = SALES_JOB_DOCUMENT_TYPES.includes(doc.doc_type);
            if (!current) {
              dealDocsByCustomer[doc.customer_id][doc.deal_id] = {
                hasSalesJobDocument: isSalesJobDoc,
                latestDoc: doc,
              };
              continue;
            }

            current.hasSalesJobDocument = current.hasSalesJobDocument || isSalesJobDoc;
            if (new Date(doc.created_at).getTime() > new Date(current.latestDoc.created_at).getTime()) {
              current.latestDoc = doc;
            }
          }
          const nextStats: Record<string, CustomerDealStats> = {};
          for (const [customerId, dealDocs] of Object.entries(dealDocsByCustomer)) {
            const jobs = Object.values(dealDocs).filter((deal) => deal.hasSalesJobDocument);
            const done = jobs.filter((deal) => isResolvedDealStatus(deal.latestDoc.status)).length;
            nextStats[customerId] = {
              active: jobs.length - done,
              done,
              total: jobs.length,
            };
          }
          setDealStats(nextStats);
        });
    }, 100);
    return () => clearTimeout(timer);
  }, [profile?.id, customers]);

  const filtered = useMemo(() => {
    let list = customers;
    if (filterMode === "favorites") list = list.filter((c) => c.is_favorite);
    if (filterMode === "hasDeals") list = list.filter((c) => (dealStats[c.id]?.total || 0) > 0);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.tax_id && c.tax_id.includes(q)) ||
          (c.address && c.address.toLowerCase().includes(q)) ||
          (c.phone && c.phone.toLowerCase().includes(q)) ||
          (c.contact_name && c.contact_name.toLowerCase().includes(q)) ||
          (c.code && c.code.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [customers, search, filterMode, dealStats]);

  const customerRows = useMemo(
    () =>
      filtered.map((c) => {
        const stats = dealStats[c.id] || EMPTY_DEAL_STATS;
        return { ...c, dealActive: stats.active, dealDone: stats.done, dealTotal: stats.total };
      }),
    [filtered, dealStats],
  );
  type CustomerSortKey = "name" | "tax_id" | "phone" | "dealActive" | "dealDone" | "dealTotal" | "is_active";
  const customerSort = useTableSort<(typeof customerRows)[number], CustomerSortKey>(customerRows, { key: "name", dir: "asc" });

  const favoriteCount = useMemo(() => customers.filter((c) => c.is_favorite).length, [customers]);
  const hasDealsCount = useMemo(
    () => customers.filter((c) => (dealStats[c.id]?.total || 0) > 0).length,
    [customers, dealStats],
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
          code: newCode || null,
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
      setNewCode("");
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
              placeholder="ค้นหาชื่อ รหัส เลขผู้เสียภาษี..."
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
              const stats = dealStats[c.id] || EMPTY_DEAL_STATS;
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
                      {c.code && (
                        <div className="text-[11px] text-primary font-mono font-medium mt-0.5">
                          {c.code}
                        </div>
                      )}
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
                    {stats.total > 0 ? (
                      <span className="text-right text-[11px] leading-4">
                        <span className="font-semibold text-[#378ADD]">งานขาย {stats.total} →</span>
                        <span className="block text-[#888780]">กำลังทำ {stats.active} · เสร็จแล้ว {stats.done}</span>
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
              <table className={`${TABLE.table} table-fixed min-w-[920px]`}>
                <colgroup>
                  <col className="w-[42px]" />
                  <col className="w-auto" />
                  <col className="w-[132px]" />
                  <col className="w-[118px]" />
                  <col className="w-[64px]" />
                  <col className="w-[64px]" />
                  <col className="w-[64px]" />
                  <col className="w-[74px]" />
                </colgroup>
                <thead>
                  <tr className={TABLE.theadTr}>
                    <th className="px-3 py-2"></th>
                    <SortableTh
                      label="ชื่อลูกค้า"
                      align="left"
                      active={customerSort.sort.key === "name"}
                      dir={customerSort.sort.dir}
                      onClick={() => customerSort.handleSort("name")}
                      className={TABLE.thSortable}
                    />
                    <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 whitespace-nowrap">รหัส</th>
                    <SortableTh
                      label="เลขผู้เสียภาษี"
                      align="left"
                      active={customerSort.sort.key === "tax_id"}
                      dir={customerSort.sort.dir}
                      onClick={() => customerSort.handleSort("tax_id")}
                      className={`${TABLE.thSortable} whitespace-nowrap`}
                    />
                    <SortableTh
                      label="เบอร์โทร"
                      align="left"
                      active={customerSort.sort.key === "phone"}
                      dir={customerSort.sort.dir}
                      onClick={() => customerSort.handleSort("phone")}
                      className={`${TABLE.thSortable} whitespace-nowrap`}
                    />
                    <SortableTh
                      label="กำลังทำ"
                      align="right"
                      active={customerSort.sort.key === "dealActive"}
                      dir={customerSort.sort.dir}
                      onClick={() => customerSort.handleSort("dealActive")}
                      className={`${TABLE.thSortable} whitespace-nowrap`}
                    />
                    <SortableTh
                      label="เสร็จแล้ว"
                      align="right"
                      active={customerSort.sort.key === "dealDone"}
                      dir={customerSort.sort.dir}
                      onClick={() => customerSort.handleSort("dealDone")}
                      className={`${TABLE.thSortable} whitespace-nowrap`}
                    />
                    <SortableTh
                      label="ทั้งหมด"
                      align="right"
                      active={customerSort.sort.key === "dealTotal"}
                      dir={customerSort.sort.dir}
                      onClick={() => customerSort.handleSort("dealTotal")}
                      className={TABLE.thSortable}
                    />
                      <SortableTh
                        label="สถานะ"
                        align="left"
                        active={customerSort.sort.key === "is_active"}
                        dir={customerSort.sort.dir}
                        onClick={() => customerSort.handleSort("is_active")}
                        className={`${TABLE.thSortable} whitespace-nowrap`}
                      />
                  </tr>
                </thead>
                <tbody>
                  {customerSort.sorted.map((c) => {
                    const incomplete = isIncomplete(c);
                    return (
                      <tr
                        key={c.id}
                        onClick={() => navigate(`/customers/${c.id}`)}
                        className={TABLE.tbodyTr}
                      >
                        <td className="px-3 py-2 w-[44px]">
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
                        <td className="px-3 py-2 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <CustomerAvatar customer={c} size="sm" />
                            <span className="font-semibold text-[#111827] truncate">{c.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-[12px] text-primary font-medium truncate">
                          {c.code || <span className="text-[#AAAAAA] italic font-sans">—</span>}
                        </td>
                        <td className="px-3 py-2 font-mono text-[12px] text-[#475467] truncate">
                          {c.tax_id || <span className="text-[#AAAAAA] italic font-sans">—</span>}
                        </td>
                        <td className="px-3 py-2 text-[#475467] truncate">
                          {c.phone || <span className="text-[#AAAAAA] italic">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {c.dealActive > 0 ? (
                            <span className="font-semibold text-[#C2410C]">{c.dealActive}</span>
                          ) : (
                            <span className="text-[#AAAAAA]">0</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {c.dealDone > 0 ? (
                            <span className="font-semibold text-[#15803D]">{c.dealDone}</span>
                          ) : (
                            <span className="text-[#AAAAAA]">0</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {c.dealTotal > 0 ? (
                            <span className="font-semibold text-[#378ADD]">{c.dealTotal}</span>
                          ) : (
                            <span className="text-[#AAAAAA]">0</span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap align-middle">
                          {incomplete ? (
                            <span className={`${TABLE.statusPill} inline-flex items-center gap-1 whitespace-nowrap bg-[#FAEEDA] text-[#633806]`}>
                              <AlertTriangle size={10} className="shrink-0" />
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
              const stats = dealStats[c.id] || EMPTY_DEAL_STATS;
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
                    <CustomerAvatar customer={c} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-[14px] font-semibold text-[#1A1A18] truncate">
                          {c.name}
                        </div>
                        {c.code && (
                          <div className="text-[12px] text-primary font-mono font-medium mt-0.5">
                            {c.code}
                          </div>
                        )}
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
                      {stats.total > 0 ? (
                        <div className="leading-4">
                          <div className="text-[12px] font-medium text-[#378ADD]">{stats.total} งานขาย →</div>
                          <div className="text-[10px] text-[#888780]">กำลังทำ {stats.active} · เสร็จแล้ว {stats.done}</div>
                        </div>
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
                label="รหัสลูกค้า"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder="เช่น JMK-001"
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
