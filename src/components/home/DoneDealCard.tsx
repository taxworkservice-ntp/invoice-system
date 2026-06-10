import { Card } from "../ui/Card";

interface DoneDealCardProps {
  customerName: string;
  itemSummary: string;
  itemNames?: string[];
  amountText: string;
  paidAtText?: string;
  onTap: () => void;
}

export function DoneDealCard({ customerName, itemSummary, amountText, paidAtText, onTap }: DoneDealCardProps) {
  return (
    <Card className="rounded-xl border-[0.5px] border-[#F0EEE8] bg-[#FAFAF8] p-3" onClick={onTap}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-gray-500 truncate">{customerName}</div>
          <div className="mt-0.5 text-[11px] text-gray-400 truncate">{itemSummary}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs font-medium text-gray-400">{amountText}</div>
        </div>
      </div>
      {paidAtText && <div className="mt-1.5 text-[10px] text-gray-300">ชำระเมื่อ {paidAtText}</div>}
    </Card>
  );
}
