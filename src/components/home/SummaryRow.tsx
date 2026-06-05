import { Card } from "../ui/Card";
import { formatCurrency } from "../../lib/format";

interface SummaryItem {
  label: string;
  value: number;
  alert?: boolean;
  preset: string;
}

interface SummaryRowProps {
  items: SummaryItem[];
  onCardTap: (preset: string) => void;
}

export function SummaryRow({ items, onCardTap }: SummaryRowProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <Card
          key={item.label}
          className="min-h-[78px] border-[0.5px] p-3 cursor-pointer shadow-sm hover:shadow-md"
          onClick={() => onCardTap(item.preset)}
        >
          <div className={`text-[18px] font-medium tabular-nums ${item.alert ? "text-[#C0392B]" : "text-[#1A1A18]"}`}>
            ฿ {formatCurrency(item.value)}
          </div>
          <div className="mt-1 text-[11px] leading-4 text-gray-500">{item.label}</div>
        </Card>
      ))}
    </div>
  );
}
