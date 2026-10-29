import { useMemo } from "react";
import { ChevronRight, Clock } from "lucide-react";
import { useDocDate } from "../YearEraProvider";
import { formatCurrency } from "../../lib/format";
import {
  batchTypeOf,
  describeHistoryRun,
  formatHistoryMonthLabel,
  historyMonthKey,
} from "../../lib/payroll/schedule";
import type { PayrollRun } from "../../types";
import { BatchBadge } from "./BatchBadge";
import { StatusBadge } from "../ui/StatusBadge";

interface PayrollHistoryPanelProps {
  runs: PayrollRun[];
  selectedRunId: string | null;
  onOpenRun: (run: PayrollRun) => void;
  /** Drawer mode: the surrounding Modal owns the card chrome. */
  embedded?: boolean;
}

export function PayrollHistoryPanel({
  runs,
  selectedRunId,
  onOpenRun,
  embedded = false,
}: PayrollHistoryPanelProps) {
  const docDate = useDocDate();
  const groups = useMemo(() => {
    const byMonth = new Map<string, PayrollRun[]>();
    for (const r of runs) {
      const key = historyMonthKey(r.period_end);
      const list = byMonth.get(key) ?? [];
      list.push(r);
      byMonth.set(key, list);
    }
    return [...byMonth.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, list]) => {
        const [y, m] = key.split("-").map(Number);
        return {
          key,
          monthLabel: formatHistoryMonthLabel(y, m, docDate.era),
          items: [...list].sort((a, b) => (a.period_start < b.period_start ? 1 : -1)),
        };
      });
  }, [runs, docDate]);

  // Only the selected month shows — older months hide behind one expander so
  // the panel stays compact and follows month jumps automatically.
  const selected = runs.find((r) => r.id === selectedRunId) ?? null;
  const visibleKey = selected ? historyMonthKey(selected.period_end) : (groups[0]?.key ?? null);
  const currentGroup = groups.find((g) => g.key === visibleKey) ?? groups[0] ?? null;
  const olderGroups = currentGroup ? groups.filter((g) => g.key !== currentGroup.key) : [];
  const olderCount = olderGroups.reduce((sum, g) => sum + g.items.length, 0);

  function renderRunRow(historyRun: PayrollRun) {
    const isCurrent = historyRun.id === selectedRunId;
    const { title, detail } = describeHistoryRun(historyRun);
    const finalized = historyRun.status === "finalized";
    const emptyDraft = !finalized && !(Number(historyRun.total_net) > 0);
    return (
      <button
        key={historyRun.id}
        type="button"
        disabled={isCurrent}
        onClick={() => onOpenRun(historyRun)}
        title={`${title} · ${detail} · ${finalized ? "ปิดรอบแล้ว" : "ร่าง"} — แตะเพื่อเปิด`}
        aria-label={
          isCurrent
            ? `${title} (รอบปัจจุบัน)`
            : `เปิด${title} (${finalized ? "ปิดรอบแล้ว" : "ร่าง"})`
        }
        aria-current={isCurrent ? "true" : undefined}
        className={`flex w-full items-center gap-2 rounded-control border px-2 py-1.5 text-left transition-colors ${isCurrent ? "cursor-default border-primary/30 bg-primary-soft" : "border-card-border bg-white hover:border-primary/30"}`}
      >
        <BatchBadge type={batchTypeOf(historyRun)} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-body text-ink-900">
          <span className="font-medium">{title}</span>
          <span className="tabular-nums text-ink-400"> · {detail}</span>
        </span>
        <StatusBadge tone={finalized ? "green" : "amber"} label={finalized ? "ปิดรอบ" : "ร่าง"} />
        {emptyDraft ? (
          <span className="shrink-0 text-label text-ink-400">ยังไม่มีตัวเลข</span>
        ) : (
          <span className="shrink-0 text-body font-semibold tabular-nums text-ink-900">
            ฿{formatCurrency(historyRun.total_net)}
          </span>
        )}
      </button>
    );
  }

  function renderGroup(group: { key: string; monthLabel: string; items: PayrollRun[] }) {
    return (
      <div key={group.key}>
        <div className="mb-1 text-label font-semibold text-ink-500">{group.monthLabel}</div>
        <div className="space-y-1">{group.items.map(renderRunRow)}</div>
      </div>
    );
  }

  return (
    <div className={embedded ? "" : "rounded-card border border-card-border bg-white p-3"}>
      <div className="mb-2 flex items-center gap-2">
        <Clock className="h-4 w-4 shrink-0 text-ink-400" />
        <span className="shrink-0 text-label font-medium text-ink-600">ประวัติรอบที่ผ่านมา</span>
        <span className="shrink-0 rounded-full border border-card-border bg-paper-field px-2 py-px text-label font-medium tabular-nums text-ink-500">
          {currentGroup ? `${currentGroup.items.length} รอบในเดือนนี้ · ` : ""}ทั้งหมด {runs.length}{" "}
          รอบ
        </span>
      </div>
      {currentGroup && renderGroup(currentGroup)}
      {olderGroups.length > 0 && (
        <details className="group mt-2 border-t border-card-border pt-1.5">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-ink-700 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-4 w-4 text-ink-400 transition-transform group-open:rotate-90" />
            <span className="text-body font-medium">รอบเดือนก่อนหน้า</span>
            <span className="ml-auto text-label tabular-nums text-ink-400">{olderCount} รอบ</span>
          </summary>
          <div className="space-y-2 pt-2">{olderGroups.map(renderGroup)}</div>
        </details>
      )}
    </div>
  );
}
