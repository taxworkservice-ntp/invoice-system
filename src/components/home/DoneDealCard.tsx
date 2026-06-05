import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";

interface DoneDealCardProps {
  customerName: string;
  itemSummary: string;
  amountText: string;
  paidAtText?: string;
  onTap: () => void;
}

export function DoneDealCard({ customerName, itemSummary, amountText, paidAtText, onTap }: DoneDealCardProps) {
  return (
    <Card className="rounded-xl border-[0.5px] border-[#F0EEE8] bg-[#FAFAF8] p-4" onClick={onTap}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#1A1A18] truncate">{customerName}</div>
          <div className="mt-1 text-xs text-gray-500 truncate">{itemSummary}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-semibold text-gray-500">{amountText}</div>
          <div className="mt-1">
            <Badge status="paid" />
          </div>
        </div>
      </div>
      {paidAtText && <div className="mt-2 text-[11px] text-gray-400">ชำระเมื่อ {paidAtText}</div>}
    </Card>
  );
}
