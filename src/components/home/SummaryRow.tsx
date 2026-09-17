import { Card } from "../ui/Card";
import { formatCurrency } from "../../lib/format";

interface SummaryItem {
  label: string;
  value: number;
  count?: number;
  alert?: boolean;
  preset: string;
  hint?: string;
  primary?: "count" | "amount";
}

interface SummaryRowProps {
  items: SummaryItem[];
  onCardTap: (preset: string) => void;
}

export function SummaryRow({ items, onCardTap }: SummaryRowProps) {
  return (
    <div className="grid max-w-row grid-cols-2 sm:grid-cols-4 gap-2">
      {items.map((item) => (
        <Card
          key={item.label}
          className="min-h-[78px] border-[0.5px] p-3 cursor-pointer"
          onClick={() => onCardTap(item.preset)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className={`text-subtitle font-semibold tabular-nums leading-none ${item.alert ? "text-danger" : "text-ink-900"}`}>
              {item.primary === "count" ? item.count : `฿ ${formatCurrency(item.value)}`}
            </div>
            {item.primary !== "count" && item.count != null && (
              <div className={`text-label tabular-nums ${item.alert ? "text-danger" : "text-ink-500"}`}>
                {item.count} รายการ
              </div>
            )}
          </div>
          <div className="mt-2 text-label font-medium leading-4 text-ink-700">{item.label}</div>
          {item.hint && <div className="mt-0.5 text-label leading-4 text-ink-400">{item.hint}</div>}
        </Card>
      ))}
    </div>
  );
}
