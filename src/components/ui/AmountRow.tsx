import React from "react";

type AmountTone = "default" | "muted" | "red" | "green" | "amber" | "strong";

interface AmountRowProps {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: AmountTone;
  className?: string;
}

const LABEL_CLASSES: Record<AmountTone, string> = {
  default: "text-ink-600",
  muted: "text-ink-400",
  red: "text-red-600",
  green: "text-green-700",
  amber: "text-amber-700",
  strong: "text-ink-700 font-semibold",
};

const VALUE_CLASSES: Record<AmountTone, string> = {
  default: "text-ink-800",
  muted: "text-ink-400",
  red: "text-red-600",
  green: "text-green-700",
  amber: "text-amber-700",
  strong: "text-ink-900 font-semibold",
};

export function AmountRow({ label, value, tone = "default", className = "" }: AmountRowProps) {
  return (
    <div className={`flex items-baseline justify-between gap-3 text-sm ${className}`}>
      <span className={LABEL_CLASSES[tone]}>{label}</span>
      <span className={`text-right tabular-nums ${VALUE_CLASSES[tone]}`}>{value}</span>
    </div>
  );
}
