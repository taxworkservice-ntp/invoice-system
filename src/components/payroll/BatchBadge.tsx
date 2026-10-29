import { StatusBadge } from "../ui/StatusBadge";
import { BATCH_TYPE_LABELS, type BatchType } from "../../lib/payroll/schedule";

const TONE: Record<BatchType, "primary" | "amber" | "teal"> = {
  salary: "primary",
  ot: "amber",
  adjustment: "teal",
};

/** One badge for every pay-run type — salary, OT and adjustment never drift. */
export function BatchBadge({ type, className }: { type: BatchType; className?: string }) {
  return <StatusBadge tone={TONE[type]} label={BATCH_TYPE_LABELS[type]} className={className} />;
}
