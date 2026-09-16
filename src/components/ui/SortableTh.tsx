import { ChevronUp, ChevronDown } from "lucide-react";
import type { SortDir } from "./useTableSort";

interface SortableThProps {
  label: string;
  align?: "left" | "right";
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
  activeColor?: string;
  inactiveColor?: string;
}

export function SortableTh({
  label,
  align = "left",
  active,
  dir,
  onClick,
  className = "",
  activeColor = "text-primary",
  inactiveColor = "text-line-strong",
}: SortableThProps) {
  return (
    <th
      onClick={onClick}
      className={`px-3 py-2 text-${align} text-label font-semibold text-ink-600 cursor-pointer select-none whitespace-nowrap hover:text-ink-900 transition-colors ${className}`}
    >
      {label}
      {active ? (
        dir === "asc" ? (
          <ChevronUp className={`ml-1 h-3 w-3 inline ${activeColor}`} />
        ) : (
          <ChevronDown className={`ml-1 h-3 w-3 inline ${activeColor}`} />
        )
      ) : (
        <span className={inactiveColor}>
          <ChevronUp className="ml-1 h-3 w-3 inline" />
        </span>
      )}
    </th>
  );
}
