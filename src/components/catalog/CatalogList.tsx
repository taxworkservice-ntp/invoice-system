import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SearchInput } from "../ui/SearchInput";
import { CatalogTypeTabs } from "./CatalogTypeTabs";
import { ItemCard } from "./ItemCard";
import { StockReportTable } from "./StockReportTable";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { ViewToggle } from "../ui/ViewToggle";
import type { ViewMode } from "../ui/ViewToggle";
import { isLowStock, isOutOfStock, baseToCartons } from "../../lib/stock";
import { MOVEMENT_TYPE_LABELS } from "./constants";
import { supabase } from "../../lib/supabase";
import { Download, FileText, Star } from "lucide-react";
import { useToast } from "../../hooks/useToast";
import type { Item } from "../../types";

type TabKey = "all" | "product" | "service";
type FilterMode = "all" | "favorites";

interface Props {
  items: Item[];
  loading: boolean;
  onAdd: () => void;
  userId?: string;
  onToggleFavorite: (item: Item, e: React.MouseEvent) => void;
  canManage?: boolean;
}

export function CatalogList({ items, loading, onAdd, userId, onToggleFavorite, canManage = true }: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [filterMode, setFilterMode] = useState<FilterMode>(() => {
    if (typeof window === "undefined") return "all";
    const stored = window.localStorage.getItem("catalogFilterMode");
    return stored === "all" || stored === "favorites" ? stored : "all";
  });
  const [exportingMovements, setExportingMovements] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "list";
    const stored = window.localStorage.getItem("catalogViewMode");
    return stored === "list" || stored === "grid" || stored === "table" ? stored : "list";
  });

  useEffect(() => {
    window.localStorage.setItem("catalogViewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    window.localStorage.setItem("catalogFilterMode", filterMode);
  }, [filterMode]);

  useEffect(() => {
    if (search.trim() && filterMode === "favorites") {
      setFilterMode("all");
    }
  }, [search, filterMode]);

  const filtered = useMemo(() => {
    let result = items;
    if (filterMode === "favorites") result = result.filter((i) => i.is_favorite);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.sku?.toLowerCase().includes(q),
      );
    }
    if (activeTab !== "all") {
      result = result.filter((i) => i.item_type === activeTab);
    }
    return result;
  }, [items, search, activeTab, filterMode]);

  const favoriteCount = useMemo(() => items.filter((i) => i.is_favorite).length, [items]);
  const isFiltering = search.trim() !== "" || activeTab !== "all" || filterMode !== "all";
  const showCount = isFiltering && items.length > 0;

  const productItems = useMemo(
    () => filtered.filter((i) => i.item_type === "product"),
    [filtered],
  );
  const services = useMemo(
    () => filtered.filter((i) => i.item_type === "service"),
    [filtered],
  );

  function handleExportCSV() {
    if (productItems.length === 0) return;

    const hasCartonItems = productItems.some((i) => i.carton_unit && i.qty_per_carton);
    const headers = ["ชื่อสินค้า", "SKU", "สต็อกรวม", "หน่วยนับ"];
    if (hasCartonItems) headers.push("จำนวนลัง", "หน่วยลัง");
    headers.push("จุดแจ้งเตือน", "สถานะ", "ต้นทุนเฉลี่ยต่อหน่วย", "มูลค่าสต็อกตามทุน");

    const rows = productItems.map((item) => {
      let status = "ปกติ";
      if (isOutOfStock(item.stock_count)) status = "หมด";
      else if (isLowStock(item.stock_count, item.low_stock_threshold)) status = "ใกล้หมด";

      const cartonCount = item.carton_unit && item.qty_per_carton
        ? baseToCartons(item.stock_count, item.qty_per_carton)
        : null;

      const row: string[] = [
        item.name,
        item.sku || "",
        item.stock_count.toString(),
        item.base_unit,
      ];
      if (hasCartonItems) {
        row.push(cartonCount != null ? cartonCount.toString() : "");
        row.push(item.carton_unit || "");
      }
        row.push(
        item.low_stock_threshold.toString(),
        status,
        item.avg_cost.toFixed(2),
        item.stock_value.toFixed(2),
      );
      return row;
    });

    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock_report_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleExportMovementsCSV() {
    if (!userId) return;
    setExportingMovements(true);

    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data: movements, error } = await supabase
        .from("stock_movements")
        .select("*")
        .eq("user_id", userId)
        .gte("created_at", startOfMonth)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!movements || movements.length === 0) {
        toast.error("ไม่มีประวัติเคลื่อนไหวในเดือนนี้");
        return;
      }

      const docIds = [...new Set(movements.map((m: any) => m.document_id).filter(Boolean))];
      let docMap: Map<string, string> = new Map();
      if (docIds.length > 0) {
        const { data: docs } = await supabase
          .from("documents")
          .select("id, doc_number")
          .in("id", docIds);
        if (docs) {
          docMap = new Map(docs.map((d: any) => [d.id, d.doc_number]));
        }
      }

      const itemMap = new Map(items.map((i) => [i.id, i]));

      const headers = ["วันที่", "รายการ", "ประเภท", "ปริมาณ", "หน่วย", "ต้นทุน/หน่วย", "มูลค่ารายการ", "คงเหลือ", "มูลค่าคงเหลือ", "หมายเหตุ", "เอกสาร"];
      const rows = movements.map((m: any) => {
        const item = itemMap.get(m.item_id);
        const itemName = item?.name || m.item_id;
        const unit = item?.base_unit || "ชิ้น";

        return [
          new Date(m.created_at).toLocaleDateString("th-TH"),
          itemName,
          MOVEMENT_TYPE_LABELS[m.movement_type] || m.movement_type,
          m.qty_base.toString(),
          unit,
          (m.unit_cost ?? "").toString(),
          (m.movement_value ?? "").toString(),
          m.balance_after.toString(),
          (m.balance_value_after ?? "").toString(),
          m.reason || "",
          docMap.get(m.document_id) || "",
        ];
      });

      const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      a.download = `stock_movements_${monthStr}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.message || "เกิดข้อผิดพลาด");
    } finally {
      setExportingMovements(false);
    }
  }

  function renderItemCard(item: Item, variant: "list" | "grid") {
    return (
      <ItemCard
        key={item.id}
        item={item}
        variant={variant}
        onTap={(it) => navigate(`/catalog/${it.id}`)}
        onToggleFavorite={onToggleFavorite}
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-10 bg-gray-200 rounded-lg animate-pulse" />
        <div className="flex gap-4">
          <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
          <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
          <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white border border-[#E8E6DF] rounded-[10px] p-4 animate-pulse"
          >
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
            <div className="h-3 bg-gray-200 rounded w-1/2 mb-2" />
            <div className="h-3 bg-gray-200 rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <SearchInput value={search} onChange={setSearch} debounceMs={200} placeholder="ค้นหาชื่อสินค้า, SKU..." className="flex-1" />
        <ViewToggle value={viewMode} onChange={setViewMode} />
        <Button
          variant="secondary"
          size="sm"
          onClick={handleExportCSV}
          disabled={productItems.length === 0}
          className="!rounded-lg shrink-0"
        >
          <Download size={14} className="mr-1" />
          CSV
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleExportMovementsCSV}
          loading={exportingMovements}
          disabled={exportingMovements || !userId}
          className="!rounded-lg shrink-0"
        >
          <FileText size={14} className="mr-1" />
          ประวัติ
        </Button>
        {canManage && (
          <Button onClick={onAdd} size="sm" className="!rounded-lg shrink-0">
            + เพิ่ม
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <CatalogTypeTabs activeTab={activeTab} onChange={setActiveTab} />
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
      </div>

      {showCount && (
        <div className="text-[11px] text-[#888780]">
          แสดง {filtered.length} จาก {items.length} รายการ
        </div>
      )}

      {filtered.length === 0 ? (
        items.length === 0 ? (
          <EmptyState
            title="ยังไม่มีสินค้าหรือบริการ"
            description="เพิ่มรายการแรกเพื่อเริ่มต้น"
            action={canManage ? <Button onClick={onAdd}>+ เพิ่มสินค้า / บริการ</Button> : undefined}
          />
        ) : filterMode === "favorites" && favoriteCount === 0 ? (
          <div className="text-center py-12 text-[13px] text-[#888780]">
            <Star size={28} className="mx-auto mb-2 text-[#AAAAAA]" />
            <p>ยังไม่มีรายการโปรด</p>
            <p className="mt-1">กด ★ ที่การ์ดสินค้าเพื่อเพิ่มเป็นรายการโปรด</p>
          </div>
        ) : (
          <div className="text-center py-12 text-[13px] text-[#888780]">
            <p>ไม่พบ "{search}"</p>
            <p className="mt-1">ลองค้นหาด้วยคำอื่น</p>
          </div>
        )
      ) : viewMode === "table" ? (
        isFiltering ? (
          <StockReportTable items={filtered} />
        ) : (
          <div className="space-y-4">
            {productItems.length > 0 && (
              <div>
                <div className="text-[11px] uppercase font-semibold text-[#888780] py-2">
                  สินค้า
                </div>
                <StockReportTable items={productItems} />
              </div>
            )}
            {services.length > 0 && (
              <div>
                <div className="text-[11px] uppercase font-semibold text-[#888780] py-2 mt-4">
                  บริการ
                </div>
                <StockReportTable items={services} startIndex={productItems.length} />
              </div>
            )}
          </div>
        )
      ) : viewMode === "grid" ? (
        isFiltering ? (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item) => renderItemCard(item, "grid"))}
          </div>
        ) : (
          <div className="space-y-4">
            {productItems.length > 0 && (
              <div>
                <div className="text-[11px] uppercase font-semibold text-[#888780] py-2">
                  สินค้า
                </div>
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {productItems.map((item) => renderItemCard(item, "grid"))}
                </div>
              </div>
            )}
            {services.length > 0 && (
              <div>
                <div className="text-[11px] uppercase font-semibold text-[#888780] py-2">
                  บริการ
                </div>
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {services.map((item) => renderItemCard(item, "grid"))}
                </div>
              </div>
            )}
          </div>
        )
      ) : isFiltering ? (
        <div className="space-y-2">
          {filtered.map((item) => renderItemCard(item, "list"))}
        </div>
      ) : (
        <div className="space-y-4">
          {productItems.length > 0 && (
            <div>
              <div className="text-[11px] uppercase font-semibold text-[#888780] py-2">
                สินค้า
              </div>
              <div className="space-y-2">
                {productItems.map((item) => renderItemCard(item, "list"))}
              </div>
            </div>
          )}
          {services.length > 0 && (
            <div>
              <div className="text-[11px] uppercase font-semibold text-[#888780] py-2">
                บริการ
              </div>
              <div className="space-y-2">
                {services.map((item) => renderItemCard(item, "list"))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
