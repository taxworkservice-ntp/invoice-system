import { Plus } from "lucide-react";
import { Button } from "../ui/Button";

interface HomeTopBarProps {
  greeting: string;
  subtitle: string;
  isAllClear?: boolean;
  onNewDeal: () => void;
}

export function HomeTopBar({ greeting, subtitle, isAllClear, onNewDeal }: HomeTopBarProps) {
  return (
    <div className="rounded-card border border-card-border bg-white px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-title font-medium text-ink-900">{greeting}</div>
          <div className={`mt-1 text-label ${isAllClear ? "text-paid-text" : "text-ink-500"}`}>{subtitle}</div>
        </div>
        <div className="shrink-0">
          <Button size="sm" variant="primary" onClick={onNewDeal}>
            <Plus className="w-4 h-4 mr-1" />
            สร้างงานขายใหม่
          </Button>
        </div>
      </div>
    </div>
  );
}
