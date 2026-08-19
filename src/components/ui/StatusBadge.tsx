import type { DocumentStatus, DocumentType } from "../../types";
import { DOC_TYPE_COLORS, STATUS_COLORS } from "../../constants";
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
  teal: { bg: "bg-teal-100", text: "text-teal-700" },
  amber: { bg: "bg-amber-100", text: "text-amber-800" },
  green: { bg: "bg-green-100", text: "text-green-700" },
  gray: { bg: "bg-stone-100", text: "text-stone-600" },
  red: { bg: "bg-red-100", text: "text-red-700" },
  stone: { bg: "bg-stone-100", text: "text-stone-500" },
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
  let color: { bg: string; text: string } = { bg: "bg-stone-100", text: "text-stone-600" };
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
    text = status;
  }

  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${color.bg} ${color.text} ${className}`}>
      {text}
    </span>
  );
}
