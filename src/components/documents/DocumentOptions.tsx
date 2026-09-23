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
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-label font-semibold text-primary">
            {number}
          </span>
        ) : null}
        <h3 className="text-body font-medium text-ink-900">{title}</h3>
      </div>
      <p className="mb-3 text-label text-ink-400">ตัวเลือกเหล่านี้มีผลต่อเอกสาร PDF เท่านั้น</p>
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
          className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${ checked ? "bg-primary" : "bg-line" }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${ checked ? "translate-x-4" : "" }`}
          />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-body font-medium text-ink-800">{label}</span>
        {badge ? (
          <span className="ml-2 text-label text-ink-400">{badge}</span>
        ) : null}
        {description ? (
          <p className="mt-0.5 text-label leading-5 text-ink-500">{description}</p>
        ) : null}
      </div>
    </label>
  );
}

/**
 * Required single-choice row (e.g. the delivery-note amount-display mode).
 * Renders as a neutral segmented control — never hides or disables an option,
 * so every choice stays visible.
 */
export function DocumentOptionSegmented<T extends string>({
  label,
  required = false,
  value,
  options,
  description,
  error,
  onChange,
}: {
  label: string;
  required?: boolean;
  value: T | null;
  options: Array<{ value: T; label: string }>;
  description?: string;
  error?: string;
  onChange: (value: T) => void;
}) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="text-body font-medium text-ink-800">
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </div>
      <div className="mt-2 inline-flex flex-wrap items-center rounded-control border border-line bg-ink-50 p-0.5">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={`rounded-[6px] px-2.5 py-1 text-label font-medium transition-colors ${
                active
                  ? "border border-line-strong bg-white text-ink-900"
                  : "border border-transparent text-ink-500 hover:text-ink-700"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {description ? <p className="mt-1.5 text-label leading-5 text-ink-500">{description}</p> : null}
      {error ? <p className="mt-1 text-label text-danger-text">{error}</p> : null}
    </div>
  );
}
