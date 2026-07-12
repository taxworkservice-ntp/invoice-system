import { List, LayoutGrid, Table2 } from "lucide-react";

export type ViewMode = "list" | "grid" | "table";

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  variants?: ViewMode[];
  className?: string;
}

const ICON: Record<ViewMode, typeof List> = {
  list: List,
  grid: LayoutGrid,
  table: Table2,
};

const LABELS: Record<ViewMode, { aria: string; title: string }> = {
  list: { aria: "มุมมองรายการ", title: "รายการ" },
  grid: { aria: "มุมมองตารางการ์ด", title: "ตารางการ์ด" },
  table: { aria: "มุมมองตาราง", title: "ตาราง" },
};

export function ViewToggle({ value, onChange, variants, className = "" }: ViewToggleProps) {
  const modes = variants ?? (["list", "grid", "table"] as ViewMode[]);

  return (
    <div className={`flex items-center bg-white border-[0.5px] border-[#E8E6DF] rounded-lg p-0.5 shrink-0 ${className}`}>
      {modes.map((mode) => {
        const Icon = ICON[mode];
        const labels = LABELS[mode];
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            aria-label={labels.aria}
            aria-pressed={value === mode}
            title={labels.title}
            className={`p-1.5 rounded-md transition-colors ${
              value === mode ? "bg-white text-[#1A1A18] shadow-sm" : "text-[#888780] hover:text-[#1A1A18]"
            }`}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </div>
  );
}
