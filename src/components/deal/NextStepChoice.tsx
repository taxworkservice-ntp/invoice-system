import type { ElementType } from "react";

/**
 * "This or that" for the next step on a deal.
 *
 * Two alternatives are rendered as equal choice cards with a `หรือ` between
 * them: side by side on desktop (the word sits in the gutter), stacked with a
 * ruled divider on phones. Each card states its own consequence, so neither
 * reads as a footnote to the other.
 *
 * A single option is not a decision — callers render their normal primary
 * button for that case instead of using this component.
 */
export interface NextStepOption {
  key: string;
  label: string;
  /** One line: what happens if the officer picks this. */
  description: string;
  icon: ElementType;
  danger?: boolean;
  loading?: boolean;
  onClick: () => void;
}

export function NextStepChoice({ options }: { options: NextStepOption[] }) {
  if (options.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="ขั้นตอนถัดไป · เลือกอย่างใดอย่างหนึ่ง"
      className={
        options.length > 1
          ? "grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch"
          : "grid"
      }
    >
      {options.map((option, index) => (
        <OptionCard
          key={option.key}
          option={option}
          // The divider only earns its place between two options.
          dividerBefore={index > 0 && options.length > 1}
        />
      ))}
    </div>
  );
}

function OptionCard({ option, dividerBefore }: { option: NextStepOption; dividerBefore: boolean }) {
  const Icon = option.icon;
  return (
    <>
      {dividerBefore && (
        <div
          aria-hidden="true"
          className="flex items-center gap-3 px-1 text-label text-ink-400 sm:flex-col sm:px-0 sm:py-2"
        >
          <span className="h-px flex-1 bg-line sm:h-full sm:w-px sm:flex-1" />
          <span className="shrink-0">หรือ</span>
          <span className="h-px flex-1 bg-line sm:h-full sm:w-px sm:flex-1" />
        </div>
      )}
      <button
        type="button"
        onClick={option.onClick}
        disabled={option.loading}
        className={`group flex w-full items-start gap-3 rounded-card border px-4 py-3 text-left transition-colors active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60 ${
          option.danger
            ? "border-danger-border bg-danger-soft hover:border-danger"
            : "border-card-border bg-white hover:border-line-strong hover:bg-paper-field"
        }`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-control ${
            option.danger ? "bg-white text-danger" : "bg-primary-soft text-primary-deep"
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-body font-semibold text-ink-900">{option.label}</span>
          </span>
          <span className="mt-0.5 block text-label leading-5 text-ink-500">
            {option.description}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="mt-1 shrink-0 text-label text-ink-300 transition-colors group-hover:text-primary"
        >
          →
        </span>
      </button>
    </>
  );
}
