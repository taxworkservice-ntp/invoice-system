import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import type { DocumentStatus } from "../../types";

interface DealCardProps {
  customerName: string;
  itemSummary: string;
  itemNames?: string[];
  amountText: string;
  status: DocumentStatus;
  nextActionLabel: string;
  isOverdue?: boolean;
  onTap: () => void;
}

export function DealCard({
  customerName,
  itemSummary,
  itemNames = [],
  amountText,
  status,
  nextActionLabel,
  isOverdue,
  onTap,
}: DealCardProps) {
  const previewItems = itemNames.slice(0, 3);
  const remainingItems = itemNames.length - previewItems.length;

  return (
    <Card
      className={`rounded-xl border-[0.5px] p-4 shadow-sm hover:shadow-md ${isOverdue ? "border-l-4 border-l-[#C0392B]" : ""}`}
      onClick={onTap}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[#1A1A18] truncate">{customerName}</div>
          {previewItems.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {previewItems.map((itemName, index) => (
                <span
                  key={`${customerName}-item-${index}-${itemName}`}
                  className="inline-flex max-w-full rounded-full bg-[#F3F0E8] px-2.5 py-1 text-xs text-[#5B564D]"
                >
                  <span className="truncate">{itemName}</span>
                </span>
              ))}
              {remainingItems > 0 && (
                <span className="inline-flex rounded-full bg-[#ECE8DE] px-2.5 py-1 text-xs font-medium text-[#6E685E]">
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
