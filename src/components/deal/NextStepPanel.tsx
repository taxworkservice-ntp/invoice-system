import type { ElementType } from "react";

export interface NextStepOption {
  key: string;
  label: string;
  description: string;
  icon: ElementType;
  tag?: string;
  facts?: string;
  consequence?: string;
  emphasis?: "primary";
  danger?: boolean;
  loading?: boolean;
  onClick: () => void;
}

const SURFACES = {
  danger: {
    card: "border-danger-border bg-danger-soft hover:border-danger",
    title: "text-ink-900",
    body: "text-ink-500",
    facts: "text-ink-700",
    icon: "bg-white text-danger",
    tag: "bg-white text-danger",
    arrow: "text-ink-300 group-hover:text-danger",
  },
  primary: {
    card: "border-primary bg-primary text-white hover:bg-primary-deep",
    title: "text-white",
    body: "text-white/85",
    facts: "text-white",
    icon: "bg-white/15 text-white",
    tag: "bg-white/20 text-white",
    arrow: "text-white/70 group-hover:text-white",
  },
  secondary: {
    card: "border-primary-border bg-primary-soft hover:border-primary",
    title: "text-ink-900",
    body: "text-ink-500",
    facts: "text-ink-700",
    icon: "bg-white text-primary-deep",
    tag: "bg-white text-primary-deep",
    arrow: "text-ink-300 group-hover:text-primary",
  },
} as const;

export function NextStepPanel({
  options,
  className = "",
}: {
  options: NextStepOption[];
  className?: string;
}) {
  if (options.length === 0) return null;

  const isChoice = options.length > 1;

  return (
    <div
      role="group"
      aria-label={isChoice ? "ขั้นตอนถัดไป · เลือกอย่างใดอย่างหนึ่ง" : "ขั้นตอนถัดไป"}
      className={`${isChoice ? "grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch" : "grid"} ${className}`}
    >
      {options.map((option, index) => (
        <OptionCard key={option.key} option={option} dividerBefore={index > 0 && isChoice} />
      ))}
    </div>
  );
}

function OptionCard({ option, dividerBefore }: { option: NextStepOption; dividerBefore: boolean }) {
  const Icon = option.icon;
  const isPrimary = option.emphasis === "primary" && !option.danger;
  const surface = option.danger
    ? SURFACES.danger
    : isPrimary
      ? SURFACES.primary
      : SURFACES.secondary;

  return (
    <>
      {dividerBefore ? (
        <div
          aria-hidden="true"
          className="flex items-center px-1 text-label text-ink-400 sm:flex-col sm:px-0 sm:py-2"
        >
          <span className="shrink-0">หรือ</span>
        </div>
      ) : null}
      <button
        type="button"
        onClick={option.onClick}
        disabled={option.loading}
        aria-busy={option.loading || undefined}
        className={`group flex w-full items-start gap-3 rounded-card border px-4 py-3 text-left transition-colors active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 ${surface.card}`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-control ${surface.icon}`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className={`text-body font-semibold ${surface.title}`}>{option.label}</span>
            {option.tag ? (
              <span
                className={`rounded-full px-2 py-0.5 text-label font-medium leading-4 ${surface.tag}`}
              >
                {option.tag}
              </span>
            ) : null}
          </span>
          <span className={`mt-0.5 block text-label leading-5 ${surface.body}`}>
            {option.description}
          </span>
          {option.facts ? (
            <span className={`mt-1 block text-label font-medium leading-5 ${surface.facts}`}>
              {option.facts}
            </span>
          ) : null}
          {option.consequence ? (
            <span className="mt-1 flex items-start gap-1 text-label font-medium leading-5 text-warning-text">
              <span aria-hidden="true" className="shrink-0">
                ⚠
              </span>
              <span>{option.consequence}</span>
            </span>
          ) : null}
        </span>
        <span
          aria-hidden="true"
          className={`mt-1 shrink-0 text-label transition-colors ${surface.arrow}`}
        >
          →
        </span>
      </button>
    </>
  );
}
