import React, { useRef } from "react";

export interface TabItem<T extends string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface TabListProps<T extends string> {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  idPrefix: string;
  className?: string;
}

export function TabList<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  idPrefix,
  className = "",
}: TabListProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function moveFocus(index: number, direction: -1 | 1 | "home" | "end") {
    const enabled = tabs
      .map((tab, tabIndex) => ({ tab, tabIndex }))
      .filter(({ tab }) => !tab.disabled);
    if (enabled.length === 0) return;
    const current = enabled.findIndex(({ tabIndex }) => tabIndex === index);
    const next =
      direction === "home"
        ? 0
        : direction === "end"
          ? enabled.length - 1
          : (current + direction + enabled.length) % enabled.length;
    const target = enabled[next];
    refs.current[target.tabIndex]?.focus();
    onChange(target.tab.value);
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

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex gap-1 rounded-card bg-ink-50 p-1 ${className}`}
    >
      {tabs.map((tab, index) => {
        const isActive = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            id={`${idPrefix}-tab-${tab.value}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`${idPrefix}-panel-${tab.value}`}
            disabled={tab.disabled}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            className={`flex min-h-11 flex-1 items-center justify-center rounded-control px-2 py-2 text-label transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0 ${
              isActive
                ? "bg-white font-medium text-ink-900"
                : "font-medium text-ink-500 hover:text-ink-700"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
