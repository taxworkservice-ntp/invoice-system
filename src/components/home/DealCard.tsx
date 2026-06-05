import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import type { DocumentStatus } from "../../types";

interface DealCardProps {
  customerName: string;
  itemSummary: string;
  amountText: string;
  status: DocumentStatus;
  nextActionLabel: string;
  isOverdue?: boolean;
  onTap: () => void;
}

export function DealCard({
  customerName,
  itemSummary,
  amountText,
  status,
  nextActionLabel,
  isOverdue,
  onTap,
}: DealCardProps) {
  return (
    <Card
      className={`rounded-xl border-[0.5px] p-4 shadow-sm hover:shadow-md ${isOverdue ? "border-l-4 border-l-[#C0392B]" : ""}`}
      onClick={onTap}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#1A1A18] truncate">{customerName}</div>
          <div className="mt-1 text-xs text-gray-500 truncate">{itemSummary}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-semibold text-[#1A1A18]">{amountText}</div>
          <div className="mt-1">
            <Badge status={status} />
          </div>
        </div>
      </div>
      <div className={`mt-3 text-xs font-medium leading-4 ${isOverdue ? "text-[#C0392B]" : "text-primary"}`}>
        {nextActionLabel}
      </div>
    </Card>
  );
}
