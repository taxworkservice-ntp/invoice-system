import type { DealPhase } from "../../lib/dealWorkflow";
import { Pencil } from "lucide-react";

const PHASE_TONE: Record<DealPhase, string> = {
  quote: "bg-primary-soft text-primary-deep",
  deliver: "bg-accent-teal/10 text-accent-teal",
  invoice: "bg-primary-soft text-primary-deep",
  collect: "bg-warning-soft text-warning-text",
  done: "bg-paid-bg text-paid-text",
};

export interface DealStatusPillProps {
  label: string;
  phase: DealPhase;
  overdue?: boolean;
  manual?: boolean;
  className?: string;
}

export function DealStatusPill({
  label,
  phase,
  overdue = false,
  manual = false,
  className = "",
}: DealStatusPillProps) {
  const tone = overdue
    ? "bg-danger-soft text-danger-text"
    : manual
      ? "bg-warning-soft text-warning-text"
      : PHASE_TONE[phase];
  const accessibleLabel = manual ? `${label} (กำหนดสถานะเอง)` : label;

  return (
    <span
      aria-label={accessibleLabel}
      title={manual ? "กำหนดสถานะเอง" : undefined}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-label font-medium ${tone} ${className}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
      {manual ? <Pencil aria-hidden="true" className="h-3 w-3" /> : null}
    </span>
  );
}
