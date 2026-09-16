import { useMemo, useState } from "react";
import { CircleDollarSign, TrendingUp, Wallet, FileText, Download, BarChart3, Percent, CalendarDays } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Skeleton } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { getMonthRange, deltaCaptionForRange, useFinancialReport } from "../../hooks/useReports";
import { useWorkspaceRole } from "../../hooks/useAuth";
import { getWorkspacePermissions } from "../../lib/permissions";
import { formatCurrency } from "../../lib/format";
import { TransactionTable } from "./TransactionTable";

const MONTH_NAMES_TH = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

type ChartRange = "6m" | "ytd" | "12m";

const CHART_RANGES: { key: ChartRange; label: string }[] = [
  { key: "6m", label: "6 เดือน" },
  { key: "ytd", label: "YTD" },
  { key: "12m", label: "12 เดือน" },
];

function monthLabel(m: string) {
  const i = parseInt(m, 10) - 1;
  return MONTH_NAMES_TH[i] || m;
}

function SummaryCard({ icon, label, scope, value, alert = false, delta, deltaGood = true, deltaCaption = "vs เดือนก่อน" }: { icon: React.ReactNode; label: string; scope?: string; value: string; alert?: boolean; delta?: number | null; deltaGood?: boolean; deltaCaption?: string }) {
  const deltaFormatted = delta !== null && delta !== undefined ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%` : null;
  const deltaColor = delta === null || delta === undefined
    ? ""
    : delta >= 0 === deltaGood
      ? "text-success-text"
      : "text-danger";
  return (
    <Card className="min-h-[96px] border-card-border p-3">
      <div className="flex items-center gap-2 text-label font-medium text-ink-300">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary">
          {icon}
        </span>
        <span className="min-w-0">
          {label}
          {scope && <span className="block text-label font-normal normal-case text-ink-200">{scope}</span>}
        </span>
      </div>
      <div className={`mt-2 text-subtitle font-semibold leading-tight tabular-nums truncate ${alert ? "text-danger" : "text-ink-900"}`} title={`฿${value}`}>
        ฿{value}
      </div>
      {deltaFormatted && (
        <div className={`mt-0.5 text-label font-medium ${deltaColor}`}>
          {deltaFormatted} {deltaCaption}
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
        const isMax = d.value === maxVal && maxVal > 0;
        const isActive = activeIndex === i;
        const isHovered = hoveredIndex === i;
        const showValue = d.value > 0 && (isActive || isMax || isHovered);
        return (
          <div
            key={i}
            className="group relative flex flex-1 flex-col items-center gap-1"
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {showValue && (
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-control bg-ink-900 px-2 py-0.5 text-label font-medium tabular-nums text-white">
                ฿{formatCurrency(d.value)}
              </div>
            )}
            <div
              onClick={d.value > 0 && onBarClick ? () => onBarClick(d.month, d.year) : undefined}
              title={d.value > 0 ? `฿${formatCurrency(d.value)} — แตะเพื่อดูรอบนี้` : "ไม่มีรายได้"}
              className={[
                "w-full rounded-t-sm transition-all",
                d.value > 0 ? "cursor-pointer hover:brightness-110" : "",
                isActive ? "bg-primary" : isMax ? "bg-success-text" : "bg-primary/40",
              ].join(" ")}
              style={{ height: h }}
            />
            <span className={`text-label ${isActive ? "font-semibold text-primary" : "text-ink-500"}`}>{d.label}</span>
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
  const { workspaceRole, workspacePermissions } = useWorkspaceRole();
  // Viewers (canViewReports without canExportReports) can read the report
  // on screen but must not exfiltrate the full financial XLSX.
  const canExportReports = getWorkspacePermissions(workspaceRole, workspacePermissions).canExportReports;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [chartRange, setChartRange] = useState<ChartRange>("6m");
  const finRange = getMonthRange(year, month);
  const { summary, monthly, monthlyTrend, arByCustomer, arAging, topCustomers, byType, cogs, collectionRate, revenueDelta, transactions, whtTransactions, lineItems, arDetails, dealNotes, loading, error } = useFinancialReport(userId, finRange.start, finRange.end);

  const today = new Date();
  const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() - i);

  const chartMonths = useMemo(() => {
    if (chartRange === "12m") return monthlyTrend;
    if (chartRange === "ytd") {
      return monthlyTrend.filter((m) => m.year === currentYear && parseInt(m.month, 10) <= currentMonth);
    }
    return monthlyTrend.slice(-6);
  }, [chartRange, monthlyTrend, currentYear, currentMonth]);
  const maxMonthly = Math.max(...chartMonths.map((m) => m.total), 1);
  const activeIndex = chartMonths.findIndex((m) => parseInt(m.month, 10) === month && m.year === year);
  const chartTitle = chartRange === "ytd"
    ? `รายได้สะสมปี ${currentYear + 543}`
    : chartRange === "12m"
      ? "รายได้ 12 เดือนย้อนหลัง"
      : "รายได้ 6 เดือนย้อนหลัง";

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
        periodLabel: `${MONTH_NAMES_TH[month - 1] || month} ${year + 543}`,
        generatedAt: new Date(),
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
          <Skeleton className="h-8 w-48 rounded-control" />
          <Skeleton className="h-8 w-32 rounded-control" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-card" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-card" />
        <Skeleton className="h-40 rounded-card" />
        <Skeleton className="h-40 rounded-card" />
        <Skeleton className="h-32 rounded-card" />
      </div>
    );
  }

  if (error) {
    return <div className="rounded-card border border-red-200 bg-red-50 p-4 text-body text-red-600">{error}</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-card border border-card-border bg-paper-field p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-label font-semibold text-ink-300">
            <CalendarDays className="h-4 w-4 text-primary" />
            <span>ช่วงเวลา</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <select
              aria-label="เดือนของรายงาน"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="min-w-0 rounded-control border border-card-border bg-white px-3 py-1.5 text-body text-ink-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {MONTH_NAMES_TH.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
            <select
              aria-label="ปีของรายงาน"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="min-w-0 rounded-control border border-card-border bg-white px-3 py-1.5 text-body text-ink-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y + 543}</option>
              ))}
            </select>
          </div>
        </div>
        {canExportReports && (
          <Button variant="secondary" size="sm" onClick={handleExportExcel} className="w-full sm:w-auto">
            <Download className="mr-1.5 h-4 w-4" />
            ส่งออก Excel
          </Button>
        )}
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard icon={<TrendingUp className="h-4 w-4" />} label="ยอดขายก่อน VAT" scope="รอบนี้" value={formatCurrency(summary.revenue - summary.vatCollected)} />
          <SummaryCard icon={<FileText className="h-4 w-4" />} label="VAT" scope="รอบนี้" value={formatCurrency(summary.vatCollected)} />
          <SummaryCard icon={<BarChart3 className="h-4 w-4" />} label="ยอดรวม" scope="รอบนี้" value={formatCurrency(summary.revenue)} delta={revenueDelta} deltaCaption={deltaCaptionForRange(finRange.start, finRange.end)} />
          <SummaryCard icon={<CircleDollarSign className="h-4 w-4" />} label="เก็บแล้ว" scope="รอบนี้" value={formatCurrency(summary.collected)} />
          <SummaryCard icon={<Percent className="h-4 w-4" />} label="หัก ณ ที่จ่าย" scope="รอบนี้" value={formatCurrency(summary.whtWithheld)} />
          <SummaryCard icon={<Wallet className="h-4 w-4" />} label="ค้างเก็บ" scope="สะสม · ณ วันนี้" value={formatCurrency(summary.outstanding)} alert={summary.outstanding > 0} />
        </div>
      )}

      {chartMonths.length > 0 && (
        <Card className="border-[0.5px] p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-label font-semibold text-ink-500">
              {chartTitle}
              {chartMonths.length === 1 && <span className="ml-2 font-normal normal-case text-ink-200">ข้อมูลเดือนเดียว</span>}
            </h3>
            <div className="flex items-center gap-0.5 rounded-control border border-card-border bg-paper-field p-0.5" role="tablist" aria-label="ช่วงเวลาของกราฟรายได้">
              {CHART_RANGES.map((range) => (
                <button
                  key={range.key}
                  type="button"
                  role="tab"
                  aria-selected={chartRange === range.key}
                  onClick={() => setChartRange(range.key)}
                  className={`rounded-control px-2 py-1 text-label font-medium transition-colors ${chartRange === range.key ? "bg-white text-ink-900 " : "text-ink-300 hover:text-ink-500"}`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>
          <BarChart
            data={chartMonths.map((m) => ({
              label: `${monthLabel(m.month)}${chartRange === "12m" ? ` ${String(m.year + 543).slice(-2)}` : ""}`,
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
        <Card className="border-[0.5px] p-4">
          <h3 className="mb-3 text-label font-semibold text-ink-500">ลูกค้าค้างชำระ <span className="font-normal normal-case text-ink-200">สะสม</span></h3>
          <div className="space-y-1">
            {arByCustomer.map((c) => (
              <div
                key={c.customerId}
                className="flex items-center justify-between text-body cursor-pointer hover:bg-paper-field rounded px-2 py-1.5 -mx-2 transition-colors"
                onClick={() => navigate(`/customers/${c.customerId}`)}
              >
                <div className="min-w-0 flex-1">
                  <span className="text-ink-700 truncate block">{c.name}</span>
                  <span className="text-label text-ink-400">{c.count} บิล · ค้าง {c.daysOverdue} วัน</span>
                </div>
                <div className="text-right tabular-nums shrink-0 ml-3">
                  <span className="font-medium text-danger">฿{formatCurrency(c.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {arByCustomer.length === 0 && summary && summary.outstanding > 0 && (
        <Card className="border-[0.5px] p-4">
          <h3 className="mb-3 text-label font-semibold text-ink-500">ลูกค้าค้างชำระ <span className="font-normal normal-case text-ink-200">สะสม</span></h3>
          <p className="text-center py-6 text-body text-ink-300">ไม่มีลูกค้าค้างชำระ</p>
        </Card>
      )}

      <div className="space-y-4">
        <TransactionTable transactions={transactions} />
      </div>

      {summary && summary.revenue === 0 && transactions.length === 0 && arByCustomer.length === 0 && (
        <EmptyState title="ไม่มีข้อมูล" description="ยังไม่มีรายการในช่วงนี้" />
      )}
    </div>
  );
}
