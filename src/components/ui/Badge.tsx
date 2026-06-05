import type { DocumentStatus } from "../../types";
import { STATUS_LABELS, STATUS_COLORS } from "../../constants";

interface BadgeProps {
  status: DocumentStatus;
}

export function Badge({ status }: BadgeProps) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.draft;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${color.bg} ${color.text}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}