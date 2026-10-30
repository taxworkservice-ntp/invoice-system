import React, { useRef } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ElementType;
  count?: number;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  tone?: "neutral" | "primary";
  size?: "sm" | "md";
  wrap?: boolean;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  tone = "neutral",
  size = "sm",
  wrap = true,
  className = "",
}: SegmentedControlProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function moveFocus(index: number, direction: -1 | 1 | "home" | "end") {
    const enabled = options
      .map((option, optionIndex) => ({ option, optionIndex }))
      .filter(({ option }) => !option.disabled);
    if (enabled.length === 0) return;
    const current = enabled.findIndex(({ optionIndex }) => optionIndex === index);
    const next =
      direction === "home"
        ? 0
        : direction === "end"
          ? enabled.length - 1
          : (current + direction + enabled.length) % enabled.length;
    const target = enabled[next];
    refs.current[target.optionIndex]?.focus();
    onChange(target.option.value);
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(index, 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(index, -1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveFocus(index, "home");
    } else if (event.key === "End") {
      event.preventDefault();
      moveFocus(index, "end");
    }
  }

  const container =
    tone === "primary"
      ? "rounded-control border border-card-border bg-paper-field"
      : "rounded-card bg-ink-50";
  const active =
    tone === "primary"
      ? "bg-primary font-semibold text-white"
      : "bg-white font-medium text-ink-900";
  const inactive = "font-medium text-ink-500 hover:text-ink-900";

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex max-w-full items-center gap-0.5 p-1 ${wrap ? "flex-wrap" : "overflow-x-auto"} ${container} ${className}`}
    >
      {options.map((option, index) => {
        const Icon = option.icon;
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            aria-pressed={isActive}
            disabled={option.disabled}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-control px-3 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0 ${
              size === "md" ? "text-body sm:px-4" : "text-label"
            } ${isActive ? active : inactive}`}
          >
            {Icon ? <Icon className="h-4 w-4" /> : null}
            {option.label}
            {option.count !== undefined ? (
              <span
                className={`rounded-full px-1.5 py-px text-label font-semibold tabular-nums ${
                  isActive
                    ? tone === "primary"
                      ? "bg-white text-primary-deep"
                      : "bg-ink-50 text-ink-600"
                    : "border border-card-border bg-white text-ink-400"
                }`}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
