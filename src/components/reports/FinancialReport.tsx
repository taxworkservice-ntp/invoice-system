import { useState } from "react";
import { CircleDollarSign, TrendingUp, Wallet, FileText, Download, BarChart3, Percent } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Skeleton } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { useFinancialReport } from "../../hooks/useReports";
import { formatCurrency } from "../../lib/format";
import { TransactionTable } from "./TransactionTable";

const MONTH_NAMES_TH = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

function monthLabel(m: string) {
  const i = parseInt(m, 10) - 1;
  return MONTH_NAMES_TH[i] || m;
}

function SummaryCard({ icon, label, value, alert = false, delta, deltaGood = true }: { icon: React.ReactNode; label: string; value: string; alert?: boolean; delta?: number | null; deltaGood?: boolean }) {
  const deltaFormatted = delta !== null && delta !== undefined ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%` : null;
  const deltaColor = delta === null || delta === undefined
    ? ""
    : delta >= 0 === deltaGood
      ? "text-[#1E5A38]"
      : "text-[#C0392B]";
  return (
    <Card className="min-h-[96px] border-[0.5px] p-3 shadow-sm">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">
        {icon}
        {label}
      </div>
      <div className={`mt-1.5 text-lg font-semibold tabular-nums truncate ${alert ? "text-[#C0392B]" : "text-[#1A1A18]"}`}>
        ฿ {value}
      </div>
      {deltaFormatted && (
        <div className={`mt-0.5 text-[11px] font-medium ${deltaColor}`}>
          {deltaFormatted} vs เดือนก่อน
        </div>
      )}
    </Card>
  );
}

const MAX_BAR_HEIGHT = 120;

function BarChart({ data, max, activeIndex, onBarClick }: { data: { label: string; value: number; month: number; year: number }[]; max: number; activeIndex?: number; onBarClick?: (month: number, year: number) => void }) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  return (
    <div className="flex items-end gap-2 pt-2" style={{ height: MAX_BAR_HEIGHT + 32 }}>
      {data.map((d, i) => {
        const h = max > 0 ? (d.value / max) * MAX_BAR_HEIGHT : 0;
        const isMax = d.value === maxVal;
        const isActive = activeIndex === i;
        const isHovered = hoveredIndex === i;
        return (
          <div
            key={i}
            className="group relative flex flex-1 flex-col items-center gap-1"
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {d.value > 0 && (isHovered || isActive) && (
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#1A1A18] px-2 py-0.5 text-[10px] font-medium text-white shadow-sm">
                ฿{formatCurrency(d.value)}
              </div>
            )}
            <div
              onClick={d.value > 0 && onBarClick ? () => onBarClick(d.month, d.year) : undefined}
              className={[
                "w-full rounded-t-sm transition-all",
                d.value > 0 ? "cursor-pointer hover:brightness-110" : "",
                isActive ? "bg-primary" : isMax ? "bg-primary" : "bg-primary/40",
              ].join(" ")}
              style={{ height: Math.max(h, 2) }}
            />
            <span className={`text-[10px] ${isActive ? "font-semibold text-primary" : "text-gray-500"}`}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

interface FinancialReportProps {
  userId: string | undefined;
}

export function FinancialReport({ userId }: FinancialReportProps) {
  const navigate = useNavigate();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { summary, monthly, arByCustomer, arAging, topCustomers, byType, cogs, collectionRate, revenueDelta, transactions, whtTransactions, lineItems, arDetails, dealNotes, loading, error } = useFinancialReport(userId, year, month);

  const today = new Date();
  const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() - i);

  const maxMonthly = Math.max(...monthly.map((m) => m.total), 1);
  const activeIndex = monthly.findIndex((m) => parseInt(m.month, 10) === month && m.year === year);

  async function handleExportExcel() {
    try {
      const { buildFinancialReportXlsx } = await import("../../lib/financialReportXlsx");
      const data = await buildFinancialReportXlsx({
        summary,
        transactions,
        whtTransactions,
        arByCustomer,
        arDetails,
        arAging,
        topCustomers,
        monthly,
        byType,
        lineItems,
        dealNotes,
        cogs,
        collectionRate,
        dateFrom: `${String(month).padStart(2, "0")}/${year}`,
      });
      const blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `financial_report_${year}-${String(month).padStart(2, "0")}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48 rounded-md" />
          <Skeleton className="h-8 w-32 rounded-md" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-lg border border-[#D4D0C8] bg-white px-3 py-1.5 text-sm text-[#1A1A18] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {MONTH_NAMES_TH.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-[#D4D0C8] bg-white px-3 py-1.5 text-sm text-[#1A1A18] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y + 543}</option>
            ))}
          </select>
        </div>
        <Button variant="secondary" size="sm" onClick={handleExportExcel}>
          <Download className="mr-1.5 h-4 w-4" />
          ส่งออก Excel
        </Button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard icon={<TrendingUp className="h-4 w-4" />} label="ยอดขายก่อน VAT" value={formatCurrency(summary.revenue - summary.vatCollected)} />
          <SummaryCard icon={<FileText className="h-4 w-4" />} label="VAT" value={formatCurrency(summary.vatCollected)} />
          <SummaryCard icon={<BarChart3 className="h-4 w-4" />} label="ยอดรวม" value={formatCurrency(summary.revenue)} delta={revenueDelta} />
          <SummaryCard icon={<CircleDollarSign className="h-4 w-4" />} label="เก็บแล้ว" value={formatCurrency(summary.collected)} />
          <SummaryCard icon={<Percent className="h-4 w-4" />} label="หัก ณ ที่จ่าย" value={formatCurrency(summary.whtWithheld)} />
          <SummaryCard icon={<Wallet className="h-4 w-4" />} label="ค้างเก็บ" value={formatCurrency(summary.outstanding)} alert={summary.outstanding > 0} />
        </div>
      )}

      {monthly.length > 0 && (
        <Card className="border-[0.5px] p-4 shadow-sm">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.05em] text-gray-500">รายได้ 6 เดือนย้อนหลัง</h3>
          <BarChart
            data={monthly.map((m) => ({
              label: `${monthLabel(m.month)}`,
              value: m.total,
              month: parseInt(m.month, 10),
              year: m.year,
            }))}
            max={maxMonthly}
            activeIndex={activeIndex >= 0 ? activeIndex : undefined}
            onBarClick={(m, y) => { setMonth(m); setYear(y); }}
          />
        </Card>
      )}

      {arByCustomer.length > 0 && (
        <Card className="border-[0.5px] p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.05em] text-gray-500">ลูกค้าค้างชำระ</h3>
          <div className="space-y-1">
            {arByCustomer.map((c) => (
              <div
                key={c.customerId}
                className="flex items-center justify-between text-sm cursor-pointer hover:bg-[#FAFAF8] rounded px-2 py-1.5 -mx-2 transition-colors"
                onClick={() => navigate(`/customers/${c.customerId}`)}
              >
                <div className="min-w-0 flex-1">
                  <span className="text-gray-700 truncate block">{c.name}</span>
                  <span className="text-[11px] text-gray-400">{c.count} บิล · ค้าง {c.daysOverdue} วัน</span>
                </div>
                <div className="text-right tabular-nums shrink-0 ml-3">
                  <span className="font-medium text-[#C0392B]">฿{formatCurrency(c.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {arByCustomer.length === 0 && summary && summary.outstanding > 0 && (
        <Card className="border-[0.5px] p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.05em] text-gray-500">ลูกค้าค้างชำระ</h3>
          <p className="text-center py-6 text-[13px] text-[#888780]">ไม่มีลูกค้าค้างชำระ</p>
        </Card>
      )}

      <div className="space-y-4">
        <TransactionTable transactions={transactions} />
      </div>

      {summary && summary.revenue === 0 && transactions.length === 0 && arByCustomer.length === 0 && (
        <EmptyState title="ไม่มีข้อมูล" description="ยังไม่มีรายการที่ชำระเงินในเดือนนี้" />
      )}
    </div>
  );
}
