import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package, AlertTriangle, TrendingDown, Download, Loader2, BarChart3, DollarSign, History } from "lucide-react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Skeleton } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { SortableTh } from "../ui/SortableTh";
import { useTableSort } from "../ui/useTableSort";
import { useStockReport, fetchFullStockReport } from "../../hooks/useReports";
import { formatCurrency } from "../../lib/format";
import { formatMixedStock } from "../../lib/stock";
import type { Item, StockMovementRow } from "../../types";

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function formatDate(date: string) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear() + 543;
  return `${day}/${month}/${year}`;
}

function SummaryCard({ icon, label, value, alert = false, onClick }: { icon: React.ReactNode; label: string; value: string; alert?: boolean; onClick?: () => void }) {
  return (
    <Card
      className={`min-h-[78px] border-[0.5px] p-3 shadow-sm ${onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">
        {icon}
        {label}
      </div>
      <div className={`mt-1.5 text-xl font-semibold tabular-nums ${alert ? "text-[#C0392B]" : "text-[#1A1A18]"}`}>
        {value}
      </div>
    </Card>
  );
}

const MOVEMENT_BADGE: Record<string, string> = {
  manual_in: "bg-green-50 text-green-700",
  auto_in: "bg-green-50 text-green-700",
  return_in: "bg-green-50 text-green-700",
  auto_out: "bg-red-50 text-red-700",
  manual_out: "bg-red-50 text-red-700",
};

type StockSubTab = "overview" | "valuation" | "low" | "movements";

const SUB_TABS: { key: StockSubTab; label: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "ภาพรวม", icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { key: "valuation", label: "มูลค่าสต็อก", icon: <DollarSign className="h-3.5 w-3.5" /> },
  { key: "low", label: "แจ้งเติมสต็อก", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  { key: "movements", label: "ความเคลื่อนไหว", icon: <History className="h-3.5 w-3.5" /> },
];

interface StockReportProps {
  userId: string | undefined;
}

type ValuationSortKey = "name" | "stock_count" | "avg_cost" | "stock_value";
type MovementSortKey = "date" | "itemName" | "type" | "qty" | "unitCost" | "movementValue" | "balance" | "balanceValue" | "docNumber";

export function StockReport({ userId }: StockReportProps) {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(startOfMonth());
  const [dateTo, setDateTo] = useState(todayString());
  const { summary, lowStockItems, movements, valuation, loading, error } = useStockReport(userId, dateFrom, dateTo);
  const [subTab, setSubTab] = useState<StockSubTab>("overview");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const valuationSort = useTableSort<Item, ValuationSortKey>(valuation ?? [], { key: "stock_value", dir: "desc" });
  const movementSort = useTableSort<StockMovementRow, MovementSortKey>(movements, { key: "date", dir: "desc" });

  async function handleExportXLSX() {
    if (!userId || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const full = await fetchFullStockReport(userId, dateFrom, dateTo);
      const { buildStockReportXlsx } = await import("../../lib/stockReportXlsx");
      const bytes = await buildStockReportXlsx({
        summary: full.summary,
        valuation: full.valuation,
        lowStockItems: full.lowStockItems,
        movements: full.movements,
        dateFrom,
        dateTo,
      });
      const blob = new Blob([bytes as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `stock_report_${dateFrom}_to_${dateTo}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setExportError(err?.message || "ไม่สามารถส่งออกรายงานได้");
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>;
  }

  const hasWarnings = (summary?.lowStockCount || 0) > 0 || (summary?.outOfStockCount || 0) > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="secondary" size="sm" onClick={handleExportXLSX} disabled={exporting}>
          {exporting ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-4 w-4" />
          )}
          {exporting ? "กำลังสร้างไฟล์..." : "ส่งออก Excel"}
        </Button>
      </div>
      {exportError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {exportError}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-[#E8E6DF] bg-[#FAFAF8] p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SUB_TABS.map((tab) => {
          const active = subTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setSubTab(tab.key)}
              className={`flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                active ? "bg-white text-[#1A1A18] shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.key === "low" && hasWarnings && (
                <span className="ml-1 inline-flex h-1.5 w-1.5 rounded-full bg-[#C0392B]" />
              )}
            </button>
          );
        })}
      </div>

      {subTab === "overview" && (
        <div className="space-y-4">
          {summary && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryCard icon={<Package className="h-4 w-4" />} label="สินค้าทั้งหมด" value={`${summary.totalItems} รายการ`} />
              <SummaryCard icon={<TrendingDown className="h-4 w-4" />} label="มูลค่าสต็อก (ทุนเฉลี่ย)" value={formatCurrency(summary.totalValue)} />
              <SummaryCard icon={<AlertTriangle className="h-4 w-4" />} label="สินค้าใกล้หมด" value={summary.lowStockCount.toString()} alert={summary.lowStockCount > 0} onClick={summary.lowStockCount > 0 ? () => setSubTab("low") : undefined} />
              <SummaryCard icon={<Package className="h-4 w-4" />} label="สินค้าหมด" value={summary.outOfStockCount.toString()} alert={summary.outOfStockCount > 0} onClick={summary.outOfStockCount > 0 ? () => setSubTab("low") : undefined} />
            </div>
          )}
          {hasWarnings && (
            <Card className="border-[0.5px] border-red-200 bg-red-50 p-4 shadow-sm">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.05em] text-[#C0392B]">สินค้าที่ต้องเติมสต็อก</h3>
              <div className="space-y-2">
                {lowStockItems.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm cursor-pointer hover:bg-red-100/50 rounded px-1 py-0.5 -mx-1 transition-colors" onClick={() => navigate(`/catalog/${item.id}`)}>
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${item.stock_count <= 0 ? "bg-[#C0392B]" : "bg-amber-500"}`} />
                      <span className="text-gray-700">{item.name}</span>
                      {item.sku && <span className="text-xs text-gray-400">({item.sku})</span>}
                    </div>
                    <div className="text-right tabular-nums">
                      <span className={`font-medium ${item.stock_count <= 0 ? "text-[#C0392B]" : "text-amber-700"}`}>
                        เหลือ {formatMixedStock(item.stock_count, item.base_unit, item.carton_unit, item.qty_per_carton)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="mt-3 text-xs font-medium text-[#C0392B] hover:underline"
                onClick={() => setSubTab("low")}
              >
                ดูทั้งหมด →
              </button>
            </Card>
          )}
        </div>
      )}

      {subTab === "valuation" && (
        valuation && valuation.length > 0 ? (
          <Card className="border-[0.5px] p-4 shadow-sm">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.05em] text-gray-500">มูลค่าสต็อกตามทุนเฉลี่ย</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E8E6DF]">
                    <SortableTh
                      label="รายการ"
                      align="left"
                      active={valuationSort.sort.key === "name"}
                      dir={valuationSort.sort.dir}
                      onClick={() => valuationSort.handleSort("name")}
                      className="text-xs font-medium text-gray-500 !text-[10px]"
                    />
                    <SortableTh
                      label="คงเหลือ"
                      align="right"
                      active={valuationSort.sort.key === "stock_count"}
                      dir={valuationSort.sort.dir}
                      onClick={() => valuationSort.handleSort("stock_count")}
                      className="text-xs font-medium text-gray-500 !text-[10px]"
                    />
                    <SortableTh
                      label="ทุนเฉลี่ย/หน่วย"
                      align="right"
                      active={valuationSort.sort.key === "avg_cost"}
                      dir={valuationSort.sort.dir}
                      onClick={() => valuationSort.handleSort("avg_cost")}
                      className="text-xs font-medium text-gray-500 !text-[10px]"
                    />
                    <th className="whitespace-nowrap px-3 py-2 text-right text-xs font-medium text-gray-500">ทุนเฉลี่ย/หน่วยรอง</th>
                    <SortableTh
                      label="มูลค่า"
                      align="right"
                      active={valuationSort.sort.key === "stock_value"}
                      dir={valuationSort.sort.dir}
                      onClick={() => valuationSort.handleSort("stock_value")}
                      className="text-xs font-medium text-gray-500 !text-[10px]"
                    />
                  </tr>
                </thead>
                <tbody>
                  {valuationSort.sorted.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-[#F0EEE8] cursor-pointer last:border-0 hover:bg-[#FAFAF8] transition-colors"
                      onClick={() => navigate(`/catalog/${item.id}`)}
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-gray-700">{item.name}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">
                        {formatMixedStock(item.stock_count, item.base_unit, item.carton_unit, item.qty_per_carton)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">
                        ฿{formatCurrency(item.avg_cost || 0)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">
                        {item.carton_unit && item.qty_per_carton && item.qty_per_carton > 0
                          ? `฿${formatCurrency((item.avg_cost || 0) * item.qty_per_carton)} / ${item.carton_unit}`
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium text-[#1A1A18]">
                        ฿{formatCurrency(item.stock_value || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <EmptyState title="ยังไม่มีข้อมูลมูลค่าสต็อก" description="เพิ่มสินค้าและตัดสต็อกเพื่อดูมูลค่า" />
        )
      )}

      {subTab === "low" && (
        hasWarnings ? (
          <Card className="border-[0.5px] border-red-200 bg-red-50 p-4 shadow-sm">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.05em] text-[#C0392B]">สินค้าที่ต้องเติมสต็อก</h3>
            <div className="space-y-2">
              {lowStockItems.slice(0, 10).map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm cursor-pointer hover:bg-red-100/50 rounded px-1 py-0.5 -mx-1 transition-colors" onClick={() => navigate(`/catalog/${item.id}`)}>
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${item.stock_count <= 0 ? "bg-[#C0392B]" : "bg-amber-500"}`} />
                    <span className="text-gray-700">{item.name}</span>
                    {item.sku && <span className="text-xs text-gray-400">({item.sku})</span>}
                  </div>
                  <div className="text-right tabular-nums">
                    <span className={`font-medium ${item.stock_count <= 0 ? "text-[#C0392B]" : "text-amber-700"}`}>
                      เหลือ {formatMixedStock(item.stock_count, item.base_unit, item.carton_unit, item.qty_per_carton)}
                    </span>
                    <span className="ml-2 text-xs text-gray-400">(แจ้งที่ {item.low_stock_threshold})</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <EmptyState title="สต็อกอยู่ในเกณฑ์ปกติ" description="ไม่มีสินค้าที่ต้องเติมในขณะนี้" />
        )
      )}

      {subTab === "movements" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-gray-500">จาก</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-[#D4D0C8] bg-white px-3 py-1.5 text-sm text-[#1A1A18] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <span className="text-xs text-gray-400">ถึง</span>
            <input
              type="date"
              value={dateTo}
              max={todayString()}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-[#D4D0C8] bg-white px-3 py-1.5 text-sm text-[#1A1A18] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {movements.length > 0 ? (
            <Card className="border-[0.5px] p-4 shadow-sm">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.05em] text-gray-500">ประวัติความเคลื่อนไหวสต็อก</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E8E6DF]">
                      <SortableTh
                        label="วันที่"
                        align="left"
                        active={movementSort.sort.key === "date"}
                        dir={movementSort.sort.dir}
                        onClick={() => movementSort.handleSort("date")}
                        className="text-xs font-medium text-gray-500 !text-[10px]"
                      />
                      <SortableTh
                        label="รายการ"
                        align="left"
                        active={movementSort.sort.key === "itemName"}
                        dir={movementSort.sort.dir}
                        onClick={() => movementSort.handleSort("itemName")}
                        className="text-xs font-medium text-gray-500 !text-[10px]"
                      />
                      <SortableTh
                        label="ประเภท"
                        align="left"
                        active={movementSort.sort.key === "type"}
                        dir={movementSort.sort.dir}
                        onClick={() => movementSort.handleSort("type")}
                        className="text-xs font-medium text-gray-500 !text-[10px]"
                      />
                      <SortableTh
                        label="จำนวน"
                        align="right"
                        active={movementSort.sort.key === "qty"}
                        dir={movementSort.sort.dir}
                        onClick={() => movementSort.handleSort("qty")}
                        className="text-xs font-medium text-gray-500 !text-[10px]"
                      />
                      <SortableTh
                        label="ทุน/หน่วย"
                        align="right"
                        active={movementSort.sort.key === "unitCost"}
                        dir={movementSort.sort.dir}
                        onClick={() => movementSort.handleSort("unitCost")}
                        className="text-xs font-medium text-gray-500 !text-[10px]"
                      />
                      <SortableTh
                        label="มูลค่า"
                        align="right"
                        active={movementSort.sort.key === "movementValue"}
                        dir={movementSort.sort.dir}
                        onClick={() => movementSort.handleSort("movementValue")}
                        className="text-xs font-medium text-gray-500 !text-[10px]"
                      />
                      <SortableTh
                        label="คงเหลือ"
                        align="right"
                        active={movementSort.sort.key === "balance"}
                        dir={movementSort.sort.dir}
                        onClick={() => movementSort.handleSort("balance")}
                        className="text-xs font-medium text-gray-500 !text-[10px]"
                      />
                      <SortableTh
                        label="มูลค่าคงเหลือ"
                        align="right"
                        active={movementSort.sort.key === "balanceValue"}
                        dir={movementSort.sort.dir}
                        onClick={() => movementSort.handleSort("balanceValue")}
                        className="text-xs font-medium text-gray-500 !text-[10px]"
                      />
                      <SortableTh
                        label="เอกสาร"
                        align="left"
                        active={movementSort.sort.key === "docNumber"}
                        dir={movementSort.sort.dir}
                        onClick={() => movementSort.handleSort("docNumber")}
                        className="text-xs font-medium text-gray-500 !text-[10px]"
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const groupByDate = movementSort.sort.key === "date";
                      const items = movementSort.sorted.slice(0, 100);
                      if (!groupByDate) {
                        return items.map((m) => {
                          const badge = MOVEMENT_BADGE[m.typeKey] || "bg-gray-50 text-gray-600";
                          return (
                            <tr key={m.id} className="border-b border-[#F0EEE8] last:border-0">
                              <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-400">{formatDate(m.date)}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-gray-700">{m.itemName}</td>
                              <td className="whitespace-nowrap px-3 py-2">
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${badge}`}>{m.type}</span>
                              </td>
                              <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${m.qty < 0 ? "text-[#C0392B]" : "text-[#1E5A38]"}`}>
                                {m.qty > 0 ? "+" : ""}{m.qty} {m.baseUnit}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">฿{formatCurrency(m.unitCost || 0)}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">฿{formatCurrency(m.movementValue || 0)}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">{formatMixedStock(m.balance, m.baseUnit, m.cartonUnit, m.qtyPerCarton)}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">฿{formatCurrency(m.balanceValue || 0)}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">{m.docNumber || m.reason || "-"}</td>
                            </tr>
                          );
                        });
                      }
                      let lastDate = "";
                      const rows: React.ReactNode[] = [];
                      items.forEach((m) => {
                        const dayLabel = formatDate(m.date);
                        if (dayLabel !== lastDate) {
                          lastDate = dayLabel;
                          rows.push(
                            <tr key={`day-${m.id}-${m.date}`} className="bg-[#FAFAF8]">
                              <td colSpan={9} className="px-3 py-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-[0.05em]">{dayLabel}</td>
                            </tr>
                          );
                        }
                        const badge = MOVEMENT_BADGE[m.typeKey] || "bg-gray-50 text-gray-600";
                        rows.push(
                          <tr key={m.id} className="border-b border-[#F0EEE8] last:border-0">
                            <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-400"></td>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-700">{m.itemName}</td>
                            <td className="whitespace-nowrap px-3 py-2">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${badge}`}>{m.type}</span>
                            </td>
                            <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${m.qty < 0 ? "text-[#C0392B]" : "text-[#1E5A38]"}`}>
                              {m.qty > 0 ? "+" : ""}{m.qty} {m.baseUnit}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">฿{formatCurrency(m.unitCost || 0)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">฿{formatCurrency(m.movementValue || 0)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">{formatMixedStock(m.balance, m.baseUnit, m.cartonUnit, m.qtyPerCarton)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">฿{formatCurrency(m.balanceValue || 0)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">{m.docNumber || m.reason || "-"}</td>
                          </tr>
                        );
                      });
                      return rows;
                    })()}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <EmptyState title="ไม่มีความเคลื่อนไหว" description="ไม่พบรายการเคลื่อนไหวสต็อกในช่วงวันที่ที่เลือก" />
          )}
        </div>
      )}
    </div>
  );
}
