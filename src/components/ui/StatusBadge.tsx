import type { DocumentStatus, DocumentType } from "../../types";
import { DOC_TYPE_COLORS, STATUS_COLORS, STATUS_LABELS } from "../../constants";
import { documentTypeLabel } from "../../lib/docLabels";

type BadgeTone =
  | "primary"
  | "teal"
  | "amber"
  | "green"
  | "gray"
  | "red"
  | "stone";

const TONE_COLORS: Record<BadgeTone, { bg: string; text: string }> = {
  primary: { bg: "bg-primary-soft", text: "text-primary-deep" },
  teal: { bg: "bg-accent-teal/10", text: "text-accent-teal" },
  amber: { bg: "bg-warning-soft", text: "text-warning-text" },
  green: { bg: "bg-success-soft", text: "text-success-text" },
  gray: { bg: "bg-ink-50", text: "text-ink-600" },
  red: { bg: "bg-danger-soft", text: "text-danger-text" },
  stone: { bg: "bg-ink-50", text: "text-ink-500" },
};

interface StatusBadgeProps {
  label?: string;
  tone?: BadgeTone;
  status?: DocumentStatus;
  docType?: DocumentType;
  vatRegistered?: boolean;
  className?: string;
}

export function StatusBadge({
  label,
  tone,
  status,
  docType,
  vatRegistered = false,
  className = "",
}: StatusBadgeProps) {
  let color: { bg: string; text: string } = { bg: "bg-ink-50", text: "text-ink-600" };
  let text = label;

  if (status) {
    color = STATUS_COLORS[status] || STATUS_COLORS.draft;
  } else if (docType) {
    color = DOC_TYPE_COLORS[docType];
  } else if (tone) {
    color = TONE_COLORS[tone];
  }

  if (docType && !text) {
    text = documentTypeLabel(docType, vatRegistered).thai;
  } else if (status && !text) {
    text = STATUS_LABELS[status] || status;
  }

  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-label font-medium ${color.bg} ${color.text} ${className}`}>
      {text}
    </span>
  );
}
