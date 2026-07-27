import { Card } from "../ui/Card";
import { formatCurrency } from "../../lib/format";

interface SummaryItem {
  label: string;
  value: number;
  count?: number;
  alert?: boolean;
  preset: string;
  hint?: string;
}

interface SummaryRowProps {
  items: SummaryItem[];
  onCardTap: (preset: string) => void;
}

export function SummaryRow({ items, onCardTap }: SummaryRowProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {items.map((item) => (
        <Card
          key={item.label}
          className="min-h-[78px] border-[0.5px] p-3 cursor-pointer shadow-sm hover:shadow-md"
          onClick={() => onCardTap(item.preset)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className={`text-[18px] font-semibold tabular-nums leading-none ${item.alert ? "text-[#C0392B]" : "text-[#1A1A18]"}`}>
              {item.count != null ? item.count : `฿ ${formatCurrency(item.value)}`}
            </div>
            {item.count != null && item.value > 0 && (
              <div className={`text-[11px] tabular-nums ${item.alert ? "text-[#C0392B]" : "text-gray-500"}`}>
                ฿ {formatCurrency(item.value)}
              </div>
            )}
          </div>
          <div className="mt-2 text-[11px] font-medium leading-4 text-gray-700">{item.label}</div>
          {item.hint && <div className="mt-0.5 text-[10px] leading-4 text-gray-400">{item.hint}</div>}
        </Card>
      ))}
    </div>
  );
}
