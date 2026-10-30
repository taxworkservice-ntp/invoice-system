import type { DealPhase } from "../../lib/dealWorkflow";
import { Pencil } from "lucide-react";
import { StatusPill, type StatusPillTone } from "../ui/StatusPill";

const PHASE_TONE: Record<DealPhase, StatusPillTone> = {
  quote: "primary",
  deliver: "teal",
  invoice: "primary",
  collect: "warning",
  done: "paid",
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
  const tone: StatusPillTone = overdue ? "danger" : manual ? "warning" : PHASE_TONE[phase];
  const accessibleLabel = manual ? `${label} (กำหนดสถานะเอง)` : label;

  return (
    <StatusPill
      label={label}
      tone={tone}
      dot
      icon={manual ? <Pencil aria-hidden="true" className="h-3 w-3" /> : null}
      title={manual ? "กำหนดสถานะเอง" : undefined}
      ariaLabel={accessibleLabel}
      className={className}
    />
  );
}
