import { useState } from "react";
import { Package, AlertTriangle, TrendingDown, Download } from "lucide-react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Skeleton } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { useStockReport } from "../../hooks/useReports";
import { formatCurrency } from "../../lib/format";

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

function SummaryCard({ icon, label, value, alert = false }: { icon: React.ReactNode; label: string; value: string; alert?: boolean }) {
  return (
    <Card className="min-h-[78px] border-[0.5px] p-3 shadow-sm">
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

interface StockReportProps {
  userId: string | undefined;
}

export function StockReport({ userId }: StockReportProps) {
  const [dateFrom, setDateFrom] = useState(startOfMonth());
  const [dateTo, setDateTo] = useState(todayString());
  const { summary, lowStockItems, movements, loading, error, refetch } = useStockReport(userId, dateFrom, dateTo);

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
    rows.push(["วันที่", "รายการ", "SKU", "ประเภท", "จำนวน", "คงเหลือ", "เอกสารอ้างอิง", "หมายเหตุ"]);
    for (const m of movements) {
      rows.push([
        formatDate(m.date),
        m.itemName,
        m.itemSku || "",
        m.type,
        m.qty.toString(),
        m.balance.toString(),
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
          <SummaryCard icon={<TrendingDown className="h-4 w-4" />} label="มูลค่าสต็อก" value={formatCurrency(summary.totalValue)} />
          <SummaryCard icon={<AlertTriangle className="h-4 w-4" />} label="สินค้าใกล้หมด" value={summary.lowStockCount.toString()} alert={summary.lowStockCount > 0} />
          <SummaryCard icon={<Package className="h-4 w-4" />} label="สินค้าหมด" value={summary.outOfStockCount.toString()} alert={summary.outOfStockCount > 0} />
        </div>
      )}

      {hasWarnings && (
        <Card className="border-[0.5px] border-red-200 bg-red-50 p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.05em] text-[#C0392B]">สินค้าที่ต้องเติมสต็อก</h3>
          <div className="space-y-2">
            {lowStockItems.slice(0, 10).map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${item.stock_count <= 0 ? "bg-[#C0392B]" : "bg-amber-500"}`} />
                  <span className="text-gray-700">{item.name}</span>
                  {item.sku && <span className="text-xs text-gray-400">({item.sku})</span>}
                </div>
                <div className="text-right tabular-nums">
                  <span className={`font-medium ${item.stock_count <= 0 ? "text-[#C0392B]" : "text-amber-700"}`}>
                    เหลือ {item.stock_count} {item.base_unit}
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
                  <th className="whitespace-nowrap px-3 py-2 text-right text-xs font-medium text-gray-500">คงเหลือ</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-gray-500">เอกสาร</th>
                </tr>
              </thead>
              <tbody>
                {movements.slice(0, 100).map((m) => (
                  <tr key={m.id} className="border-b border-[#F0EEE8] last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">{formatDate(m.date)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-700">{m.itemName}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600">{m.type}</td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${m.qty < 0 ? "text-[#C0392B]" : "text-[#1E5A38]"}`}>
                      {m.qty > 0 ? "+" : ""}{m.qty}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">{m.balance}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">{m.docNumber || m.reason || "-"}</td>
                  </tr>
                ))}
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
