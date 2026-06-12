import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CatalogSearch } from "./CatalogSearch";
import { CatalogTypeTabs } from "./CatalogTypeTabs";
import { ItemCard } from "./ItemCard";
import { StockReportTable } from "./StockReportTable";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { isLowStock, isOutOfStock, baseToCartons } from "../../lib/stock";
import { MOVEMENT_TYPE_LABELS } from "./constants";
import { supabase } from "../../lib/supabase";
import { Download, FileText, LayoutGrid, Table2 } from "lucide-react";
import type { Item, StockMovement } from "../../types";

type TabKey = "all" | "product" | "service";

interface Props {
  items: Item[];
  loading: boolean;
  onAdd: () => void;
  userId?: string;
}

export function CatalogList({ items, loading, onAdd, userId }: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [exportingMovements, setExportingMovements] = useState(false);
  const [viewMode, setViewMode] = useState<"card" | "table">("card");

  const filtered = useMemo(() => {
    let result = items;
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
  }, [items, search, activeTab]);

  const productItems = useMemo(
    () => filtered.filter((i) => i.item_type === "product"),
    [filtered],
  );
  const services = useMemo(
    () => filtered.filter((i) => i.item_type === "service"),
    [filtered],
  );
  const isFiltering = search.trim() !== "" || activeTab !== "all";

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
        alert("ไม่มีประวัติเคลื่อนไหวในเดือนนี้");
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
      alert(err.message || "เกิดข้อผิดพลาด");
    } finally {
      setExportingMovements(false);
    }
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
        <div className="flex-1">
          <CatalogSearch value={search} onChange={setSearch} />
        </div>
        <div className="flex items-center rounded-lg border border-[#E8E6DF] overflow-hidden shrink-0">
          <button
            className={`px-2 py-1.5 text-xs transition-colors ${viewMode === "card" ? "bg-primary/10 text-primary" : "text-gray-400 hover:text-gray-600"}`}
            onClick={() => setViewMode("card")}
            title="การ์ด"
          >
            <LayoutGrid size={14} />
          </button>
          <button
            className={`px-2 py-1.5 text-xs transition-colors border-l border-[#E8E6DF] ${viewMode === "table" ? "bg-primary/10 text-primary" : "text-gray-400 hover:text-gray-600"}`}
            onClick={() => setViewMode("table")}
            title="ตาราง"
          >
            <Table2 size={14} />
          </button>
        </div>
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
        <Button onClick={onAdd} size="sm" className="!rounded-lg shrink-0">
          + เพิ่ม
        </Button>
      </div>

      <CatalogTypeTabs activeTab={activeTab} onChange={setActiveTab} />

      {filtered.length === 0 ? (
        items.length === 0 ? (
          <EmptyState
            title="ยังไม่มีสินค้าหรือบริการ"
            description="เพิ่มรายการแรกเพื่อเริ่มต้น"
            action={
              <Button onClick={onAdd}>+ เพิ่มสินค้า / บริการ</Button>
            }
          />
        ) : (
          <EmptyState
            title={`ไม่พบ "${search}"`}
            description="ลองค้นหาด้วยคำอื่น"
          />
        )
      ) : isFiltering ? (
        viewMode === "table" ? (
          <StockReportTable items={filtered} />
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onTap={(it) => navigate(`/catalog/${it.id}`)}
              />
            ))}
          </div>
        )
      ) : (
        (viewMode === "table" ? (
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
        ) : (
          <div className="space-y-4">
            {productItems.length > 0 && (
              <div>
                <div className="text-[11px] uppercase font-semibold text-[#888780] py-2">
                  สินค้า
                </div>
                <div className="space-y-2">
                  {productItems.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      onTap={(it) => navigate(`/catalog/${it.id}`)}
                    />
                  ))}
                </div>
              </div>
            )}
            {services.length > 0 && (
              <div>
                <div className="text-[11px] uppercase font-semibold text-[#888780] py-2">
                  บริการ
                </div>
                <div className="space-y-2">
                  {services.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      onTap={(it) => navigate(`/catalog/${it.id}`)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
