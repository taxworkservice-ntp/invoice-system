import type { ReactNode } from "react";
import { Card } from "../ui/Card";

/**
 * Consolidated document-output options section.
 * One card, stacked toggle rows — the single predictable place for
 * "options that affect this document" (print layout, line presentation, etc.).
 */
export function DocumentOptionsCard({
  number,
  title = "ตัวเลือกเอกสาร",
  children,
}: {
  /** When set, renders as a numbered form step instead of a plain card. */
  number?: number;
  title?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="mb-1 flex items-center gap-2.5">
        {typeof number === "number" ? (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {number}
          </span>
        ) : null}
        <h3 className="text-sm font-medium text-ink-900">{title}</h3>
      </div>
      <p className="mb-3 text-[11px] text-gray-400">ตัวเลือกเหล่านี้มีผลต่อเอกสาร PDF เท่านั้น</p>
      <div className="divide-y divide-card-border">
        {children}
      </div>
    </Card>
  );
}

export function DocumentOptionRow({
  label,
  badge,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  badge?: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-3 py-3 first:pt-0 last:pb-0 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <div className="relative inline-flex shrink-0 items-center pt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only"
        />
        <span
          className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${
            checked ? "bg-primary" : "bg-gray-300"
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
              checked ? "translate-x-4" : ""
            }`}
          />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-gray-800">{label}</span>
        {badge ? (
          <span className="ml-2 text-[11px] text-gray-400">{badge}</span>
        ) : null}
        {description ? (
          <p className="mt-0.5 text-xs leading-5 text-gray-500">{description}</p>
        ) : null}
      </div>
    </label>
  );
}
