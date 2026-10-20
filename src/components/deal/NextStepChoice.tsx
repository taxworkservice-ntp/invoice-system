import type { ElementType } from "react";

/**
 * "This or that" for the next step on a deal.
 *
 * Two alternatives are rendered as choice cards with a `หรือ` between them:
 * side by side on desktop (the word sits in the gutter), stacked on phones.
 *
 * The two are not equals: one is the workflow's next step, the other skips a
 * step (the customer then gets a receipt but no tax invoice). The next step
 * is therefore the app's primary blue — the same button the app's primary
 * actions use — and each card states its own consequence: what the customer
 * gets, and what the other path skips. The cards never rely on their
 * position to explain themselves.
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
  /** A small pill: what this option is ("ขั้นตอนถัดไป", or what it skips). */
  tag?: string;
  /** One line of facts: how many items and how much money this option covers. */
  facts?: string;
  /** The workflow's next step — rendered in the app's primary blue. */
  emphasis?: "primary";
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
  // A danger action is never the primary blue: white text on the danger
  // tint would be unreadable.
  const isPrimary = option.emphasis === "primary" && !option.danger;
  return (
    <>
      {dividerBefore && (
        <div
          aria-hidden="true"
          className="flex items-center px-1 text-label text-ink-400 sm:flex-col sm:px-0 sm:py-2"
        >
          <span className="shrink-0">หรือ</span>
        </div>
      )}
      <button
        type="button"
        onClick={option.onClick}
        disabled={option.loading}
        className={`group flex w-full items-start gap-3 rounded-card border px-4 py-3 text-left transition-colors active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60 ${
          option.danger
            ? "border-danger-border bg-danger-soft hover:border-danger"
            : isPrimary
              ? "border-primary bg-primary text-white hover:bg-primary-deep"
              : "border-card-border bg-white hover:border-line-strong hover:bg-paper-field"
        }`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-control ${
            option.danger
              ? "bg-white text-danger"
              : isPrimary
                ? "bg-white/15 text-white"
                : "bg-primary-soft text-primary-deep"
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className={`text-body font-semibold ${isPrimary ? "text-white" : "text-ink-900"}`}>
              {option.label}
            </span>
            {option.tag ? (
              <span
                className={`rounded-full px-2 py-0.5 text-label font-medium leading-4 ${
                  isPrimary ? "bg-white/20 text-white" : "bg-ink-50 text-ink-500"
                }`}
              >
                {option.tag}
              </span>
            ) : null}
          </span>
          <span
            className={`mt-0.5 block text-label leading-5 ${
              isPrimary ? "text-white/85" : "text-ink-500"
            }`}
          >
            {option.description}
          </span>
          {option.facts ? (
            <span
              className={`mt-1 block text-label font-medium leading-5 ${
                isPrimary ? "text-white" : "text-ink-700"
              }`}
            >
              {option.facts}
            </span>
          ) : null}
        </span>
        <span
          aria-hidden="true"
          className={`mt-1 shrink-0 text-label transition-colors ${
            isPrimary ? "text-white/70 group-hover:text-white" : "text-ink-300 group-hover:text-primary"
          }`}
        >
          →
        </span>
      </button>
    </>
  );
}
