import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package, AlertTriangle, TrendingDown, Download } from "lucide-react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Skeleton } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { useStockReport } from "../../hooks/useReports";
import { formatCurrency } from "../../lib/format";
import { formatMixedStock } from "../../lib/stock";

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

interface StockReportProps {
  userId: string | undefined;
}

export function StockReport({ userId }: StockReportProps) {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(startOfMonth());
  const [dateTo, setDateTo] = useState(todayString());
  const { summary, lowStockItems, movements, valuation, loading, error, refetch } = useStockReport(userId, dateFrom, dateTo);

  function handleExportCSV() {
    const rows: string[][] = [];
    rows.push(["รายงานสต็อก"]);
    rows.push([]);
    if (summary) {
      rows.push(["สินค้าทั้งหมด", summary.totalItems.toString()]);
      rows.push(["มูลค่าสต็อก", summary.totalValue.toString()]);
      rows.push(["สินค้าใกล้หมด", summary.lowStockCount.toString()]);
      rows.push(["สินค้าหมด", summary.outOfStockCount.toString()]);
    }
    rows.push([]);
    rows.push(["ประวัติความเคลื่อนไหว"]);
    rows.push(["วันที่", "รายการ", "SKU", "ประเภท", "จำนวน", "ต้นทุน/หน่วย", "มูลค่ารายการ", "คงเหลือ", "มูลค่าคงเหลือ", "เอกสารอ้างอิง", "หมายเหตุ"]);
    for (const m of movements) {
      rows.push([
        formatDate(m.date),
        m.itemName,
        m.itemSku || "",
        m.type,
        m.qty.toString(),
        (m.unitCost ?? 0).toString(),
        (m.movementValue ?? 0).toString(),
        m.balance.toString(),
        (m.balanceValue ?? 0).toString(),
        m.docNumber || "",
        m.reason || "",
      ]);
    }
    const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stock_report_${dateFrom}_to_${dateTo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
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
        <Button variant="secondary" size="sm" onClick={handleExportCSV}>
          <Download className="mr-1.5 h-4 w-4" />
          ส่งออก CSV
        </Button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard icon={<Package className="h-4 w-4" />} label="สินค้าทั้งหมด" value={`${summary.totalItems} รายการ`} />
          <SummaryCard icon={<TrendingDown className="h-4 w-4" />} label="มูลค่าสต็อก (ทุนเฉลี่ย)" value={formatCurrency(summary.totalValue)} />
          <SummaryCard icon={<AlertTriangle className="h-4 w-4" />} label="สินค้าใกล้หมด" value={summary.lowStockCount.toString()} alert={summary.lowStockCount > 0} onClick={summary.lowStockCount > 0 ? () => navigate("/catalog?filter=low") : undefined} />
          <SummaryCard icon={<Package className="h-4 w-4" />} label="สินค้าหมด" value={summary.outOfStockCount.toString()} alert={summary.outOfStockCount > 0} onClick={summary.outOfStockCount > 0 ? () => navigate("/catalog?filter=out") : undefined} />
        </div>
      )}

      {valuation && valuation.length > 0 && (
        <Card className="border-[0.5px] p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.05em] text-gray-500">มูลค่าสต็อกตามทุนเฉลี่ย</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E8E6DF]">
                  <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-gray-500">รายการ</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right text-xs font-medium text-gray-500">คงเหลือ</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right text-xs font-medium text-gray-500">ทุนเฉลี่ย/หน่วย</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right text-xs font-medium text-gray-500">มูลค่า</th>
                </tr>
              </thead>
              <tbody>
                {valuation.map((item: import("../../types").Item) => (
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
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium text-[#1A1A18]">
                      ฿{formatCurrency(item.stock_value || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {hasWarnings && (
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
      )}

      {movements.length > 0 ? (
        <Card className="border-[0.5px] p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.05em] text-gray-500">ประวัติความเคลื่อนไหวสต็อก</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E8E6DF]">
                  <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-gray-500">วันที่</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-gray-500">รายการ</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-gray-500">ประเภท</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right text-xs font-medium text-gray-500">จำนวน</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right text-xs font-medium text-gray-500">ทุน/หน่วย</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right text-xs font-medium text-gray-500">มูลค่า</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right text-xs font-medium text-gray-500">คงเหลือ</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right text-xs font-medium text-gray-500">มูลค่าคงเหลือ</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-gray-500">เอกสาร</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let lastDate = "";
                  const rows: React.ReactNode[] = [];
                  movements.slice(0, 100).forEach((m) => {
                    const dayLabel = formatDate(m.date);
                    if (dayLabel !== lastDate) {
                      lastDate = dayLabel;
                      rows.push(
                        <tr key={`day-${m.date}`} className="bg-[#FAFAF8]">
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
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">
                          ฿{formatCurrency(m.unitCost || 0)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">
                          ฿{formatCurrency(m.movementValue || 0)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">{formatMixedStock(m.balance, m.baseUnit, m.cartonUnit, m.qtyPerCarton)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">
                          ฿{formatCurrency(m.balanceValue || 0)}
                        </td>
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
  );
}
