import React from "react";

export type StatusPillTone =
  | "primary"
  | "teal"
  | "warning"
  | "success"
  | "danger"
  | "neutral"
  | "paid"
  | "draft"
  | "sent"
  | "overdue"
  | "pending"
  | "voided";

const TONES: Record<StatusPillTone, string> = {
  primary: "bg-primary-soft text-primary-deep",
  teal: "bg-accent-teal/10 text-accent-teal",
  warning: "bg-warning-soft text-warning-text",
  success: "bg-success-soft text-success-text",
  danger: "bg-danger-soft text-danger-text",
  neutral: "bg-ink-50 text-ink-600",
  paid: "bg-paid-bg text-paid-text",
  draft: "bg-draft-bg text-draft-text",
  sent: "bg-sent-bg text-sent-text",
  overdue: "bg-overdue-bg text-overdue-text",
  pending: "bg-pending-bg text-pending-text",
  voided: "bg-voided-bg text-voided-text",
};

export interface StatusPillProps {
  label: React.ReactNode;
  tone?: StatusPillTone;
  dot?: boolean;
  icon?: React.ReactNode;
  className?: string;
  title?: string;
  ariaLabel?: string;
}

export function StatusPill({
  label,
  tone,
  dot = false,
  icon,
  className = "",
  title,
  ariaLabel,
}: StatusPillProps) {
  return (
    <span
      title={title}
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-label font-medium ${
        tone ? TONES[tone] : ""
      } ${className}`}
    >
      {dot ? <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {icon}
      {label}
    </span>
  );
}
