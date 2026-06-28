import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { CHIP_COLORS } from "../../constants";
import { formatBuddhistDate } from "../../lib/dates";
import type { DocumentStatus } from "../../types";

interface DealCardProps {
  customerName: string;
  itemSummary: string;
  itemNames?: string[];
  amountText: string;
  status: DocumentStatus;
  stageLabel: string;
  workflowHint?: string;
  nextActionLabel: string;
  isOverdue?: boolean;
  createdAt: string;
  queue: string;
  onTap: () => void;
}

const STAGE_COLORS: Record<string, { bg: string; text: string; banner: string }> = {
  wait_send: { bg: "bg-[#FFF8EB]", text: "text-[#8B6914]", banner: "bg-amber-50 text-[#8B6914]" },
  wait_invoice: { bg: "bg-[#F5F0FF]", text: "text-[#5B21B6]", banner: "bg-violet-50 text-[#5B21B6]" },
  wait_collect: { bg: "bg-[#ECFDF5]", text: "text-[#065F46]", banner: "bg-emerald-50 text-[#065F46]" },
  overdue: { bg: "bg-[#FEF2F2]", text: "text-[#C0392B]", banner: "bg-red-50 text-[#C0392B]" },
  progress: { bg: "bg-[#EEF6FF]", text: "text-[#0C447C]", banner: "bg-blue-50 text-primary" },
  done: { bg: "bg-gray-100", text: "text-gray-500", banner: "bg-gray-50 text-gray-500" },
};

export function DealCard({
  customerName,
  itemSummary,
  itemNames = [],
  amountText,
  status,
  stageLabel,
  workflowHint,
  nextActionLabel,
  isOverdue,
  createdAt,
  queue,
  onTap,
}: DealCardProps) {
  const previewItems = itemNames.slice(0, 3);
  const remainingItems = itemNames.length - previewItems.length;
  const colors = STAGE_COLORS[queue] || STAGE_COLORS.progress;

  return (
    <Card
      className={`rounded-xl border-[0.5px] p-4 shadow-sm hover:shadow-md ${isOverdue ? "border-l-4 border-l-[#C0392B]" : ""}`}
      onClick={onTap}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[#1A1A18] truncate">{customerName}</div>
          <div className="mt-0.5 text-[10px] text-[#888780]">{formatBuddhistDate(createdAt)}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${colors.bg} ${colors.text}`}>
              {stageLabel}
            </span>
            <Badge status={status} />
          </div>
          {previewItems.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {previewItems.map((itemName, index) => (
                <span
                  key={`${customerName}-item-${index}-${itemName}`}
                  className={`inline-flex max-w-full rounded-full px-2.5 py-1 text-xs ${CHIP_COLORS[index % CHIP_COLORS.length]}`}
                >
                  <span className="truncate">{itemName}</span>
                </span>
              ))}
              {remainingItems > 0 && (
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${CHIP_COLORS[previewItems.length % CHIP_COLORS.length]} opacity-80`}>
                  +{remainingItems} more
                </span>
              )}
            </div>
          ) : (
            <div className="mt-1 text-xs text-gray-500 truncate">{itemSummary}</div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-semibold text-[#1A1A18]">{amountText}</div>
          {workflowHint && <div className="mt-1 max-w-[120px] text-[10px] leading-4 text-gray-400">{workflowHint}</div>}
        </div>
      </div>
      <div className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold leading-4 ${colors.banner}`}>
        {nextActionLabel}
      </div>
    </Card>
  );
}
