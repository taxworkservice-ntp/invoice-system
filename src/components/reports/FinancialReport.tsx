import { useState } from "react";
import { CircleDollarSign, TrendingUp, Wallet, FileText, Download } from "lucide-react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Skeleton } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { useFinancialReport } from "../../hooks/useReports";
import { formatCurrency } from "../../lib/format";
import { DOC_TYPE_LABELS } from "../../constants";

const MONTH_NAMES_TH = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

function monthLabel(m: string) {
  const i = parseInt(m, 10) - 1;
  return MONTH_NAMES_TH[i] || m;
}

function SummaryCard({ icon, label, value, alert = false }: { icon: React.ReactNode; label: string; value: string; alert?: boolean }) {
  return (
    <Card className="min-h-[78px] border-[0.5px] p-3 shadow-sm">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">
        {icon}
        {label}
      </div>
      <div className={`mt-1.5 text-xl font-semibold tabular-nums ${alert ? "text-[#C0392B]" : "text-[#1A1A18]"}`}>
        ฿ {value}
      </div>
    </Card>
  );
}

const MAX_BAR_HEIGHT = 120;

function BarChart({ data, max }: { data: { label: string; value: number }[]; max: number }) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-2 pt-2" style={{ height: MAX_BAR_HEIGHT + 24 }}>
      {data.map((d, i) => {
        const h = max > 0 ? (d.value / max) * MAX_BAR_HEIGHT : 0;
        const isMax = d.value === maxVal;
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[10px] font-medium tabular-nums text-gray-500">฿{(d.value / 1000).toFixed(0)}k</span>
            <div
              className={`w-full rounded-t-sm transition-all ${isMax ? "bg-primary" : "bg-primary/40"}`}
              style={{ height: Math.max(h, 2) }}
            />
            <span className="text-[10px] text-gray-500">{d.label}</span>
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
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { summary, byType, monthly, topCustomers, arAging, loading, error } = useFinancialReport(userId, year, month);

  const goPrev = () => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  };
  const goNext = () => {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  };
  const canGoNext = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);

  const maxMonthly = Math.max(...monthly.map((m) => m.total), 1);

  function handleExportCSV() {
    const rows: string[][] = [];
    rows.push(["รายงานการเงิน", `${month}/${year}`]);
    rows.push([]);
    if (summary) {
      rows.push(["รายได้รวม", summary.revenue.toString()]);
      rows.push(["เก็บแล้ว", summary.collected.toString()]);
      rows.push(["ค้างชำระ", summary.outstanding.toString()]);
      rows.push(["VAT ที่เก็บ", summary.vatCollected.toString()]);
      rows.push(["จำนวนเอกสาร", summary.docCount.toString()]);
    }
    rows.push([]);
    rows.push(["รายได้แยกตามประเภทเอกสาร"]);
    rows.push(["ประเภท", "จำนวน", "ยอดรวม"]);
    for (const t of byType) {
      const label = DOC_TYPE_LABELS[t.docType as keyof typeof DOC_TYPE_LABELS]?.th || t.docType;
      rows.push([label, t.count.toString(), t.total.toString()]);
    }
    rows.push([]);
    rows.push(["ลูกค้าสูงสุด"]);
    rows.push(["ชื่อ", "จำนวน", "ยอดรวม"]);
    for (const c of topCustomers) {
      rows.push([c.name, c.count.toString(), c.total.toString()]);
    }
    rows.push([]);
    rows.push(["AR Aging"]);
    rows.push(["ช่วงเวลา", "จำนวน", "ยอดรวม"]);
    for (const a of arAging) {
      rows.push([a.label, a.count.toString(), a.total.toString()]);
    }
    const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `financial_report_${year}-${String(month).padStart(2, "0")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48 rounded-md" />
          <Skeleton className="h-8 w-32 rounded-md" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
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
          <Button variant="ghost" size="sm" onClick={goPrev}>◀</Button>
          <span className="min-w-[120px] text-center text-sm font-semibold text-[#1A1A18]">
            {MONTH_NAMES_TH[month - 1]} {year + 543}
          </span>
          <Button variant="ghost" size="sm" onClick={goNext} disabled={canGoNext}>▶</Button>
        </div>
        <Button variant="secondary" size="sm" onClick={handleExportCSV}>
          <Download className="mr-1.5 h-4 w-4" />
          ส่งออก CSV
        </Button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard icon={<TrendingUp className="h-4 w-4" />} label="รายได้รวม" value={formatCurrency(summary.revenue)} />
          <SummaryCard icon={<Wallet className="h-4 w-4" />} label="เก็บแล้ว" value={formatCurrency(summary.collected)} />
          <SummaryCard icon={<CircleDollarSign className="h-4 w-4" />} label="ค้างชำระ" value={formatCurrency(summary.outstanding)} alert={summary.outstanding > 0} />
          <SummaryCard icon={<FileText className="h-4 w-4" />} label="VAT ที่เก็บ" value={formatCurrency(summary.vatCollected)} />
        </div>
      )}

      {monthly.length > 0 && (
        <Card className="border-[0.5px] p-4 shadow-sm">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.05em] text-gray-500">รายได้ 6 เดือนย้อนหลัง</h3>
          <BarChart
            data={monthly.map((m) => ({
              label: `${monthLabel(m.month)}`,
              value: m.total,
            }))}
            max={maxMonthly}
          />
        </Card>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {byType.length > 0 && (
          <Card className="border-[0.5px] p-4 shadow-sm">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.05em] text-gray-500">รายได้แยกตามประเภทเอกสาร</h3>
            <div className="space-y-2">
              {byType.map((t) => {
                const label = DOC_TYPE_LABELS[t.docType as keyof typeof DOC_TYPE_LABELS]?.th || t.docType;
                const pct = summary && summary.revenue > 0 ? ((t.total / summary.revenue) * 100).toFixed(1) : "0";
                return (
                  <div key={t.docType} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-primary/60" />
                      <span className="text-gray-700">{label}</span>
                    </div>
                    <div className="text-right tabular-nums">
                      <span className="font-medium text-[#1A1A18]">฿{formatCurrency(t.total)}</span>
                      <span className="ml-2 text-xs text-gray-400">({pct}%)</span>
                      <span className="ml-2 text-xs text-gray-400">· {t.count} รายการ</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {arAging.length > 0 && (
          <Card className="border-[0.5px] p-4 shadow-sm">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.05em] text-gray-500">AR Aging (ค้างชำระ)</h3>
            <div className="space-y-2">
              {arAging.map((a) => {
                const pct = summary && summary.outstanding > 0 ? ((a.total / summary.outstanding) * 100).toFixed(1) : "0";
                const isHigh = a.label === "61-90 วัน" || a.label === "90+ วัน";
                return (
                  <div key={a.label} className={`flex items-center justify-between text-sm ${isHigh && a.total > 0 ? "text-[#C0392B]" : "text-gray-700"}`}>
                    <span>{a.label}</span>
                    <div className="text-right tabular-nums">
                      <span className="font-medium">฿{formatCurrency(a.total)}</span>
                      <span className="ml-2 text-xs text-gray-400">({pct}%)</span>
                      <span className="ml-2 text-xs text-gray-400">· {a.count} ใบ</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      {topCustomers.length > 0 && (
        <Card className="border-[0.5px] p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.05em] text-gray-500">ลูกค้าสูงสุด</h3>
          <div className="space-y-2">
            {topCustomers.map((c, i) => (
              <div key={c.customerId} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">
                  <span className="mr-2 font-medium text-gray-400">#{i + 1}</span>
                  {c.name}
                </span>
                <div className="text-right tabular-nums">
                  <span className="font-medium text-[#1A1A18]">฿{formatCurrency(c.total)}</span>
                  <span className="ml-2 text-xs text-gray-400">({c.count} ครั้ง)</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {summary && summary.revenue === 0 && byType.length === 0 && (
        <EmptyState title="ไม่มีข้อมูล" description="ยังไม่มีรายการที่ชำระเงินในเดือนนี้" />
      )}
    </div>
  );
}
