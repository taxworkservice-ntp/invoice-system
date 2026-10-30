import React, { useEffect, useRef, useState } from "react";
import { Check, MoreHorizontal } from "lucide-react";
import { IconButton } from "./IconButton";

export interface ActionMenuItem {
  key: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  kind?: "item" | "radio";
  onSelect: () => void;
}

export interface ActionMenuSection {
  key: string;
  label?: React.ReactNode;
  description?: React.ReactNode;
  items: ActionMenuItem[];
}

export interface ActionMenuProps {
  triggerLabel: string;
  sections: ActionMenuSection[];
  align?: "left" | "right";
  disabled?: boolean;
  triggerIcon?: React.ElementType;
  triggerSize?: "sm" | "md";
  triggerClassName?: string;
  menuClassName?: string;
}

export function ActionMenu({
  triggerLabel,
  sections,
  align = "left",
  disabled = false,
  triggerIcon,
  triggerSize = "sm",
  triggerClassName = "",
  menuClassName = "",
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const TriggerIcon = triggerIcon ?? MoreHorizontal;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        aria-label={triggerLabel}
        title={triggerLabel}
        size={triggerSize}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={triggerClassName}
      >
        <TriggerIcon className="h-4 w-4" />
      </IconButton>
      {open ? (
        <div
          role="menu"
          aria-label={triggerLabel}
          className={`absolute top-full z-30 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-white p-1 shadow-overlay ${
            align === "right" ? "right-0" : "left-0"
          } ${menuClassName}`}
        >
          {sections.map((section) => (
            <div key={section.key}>
              {section.label ? (
                <div className="px-2 py-1.5 text-label font-semibold text-ink-500">
                  {section.label}
                </div>
              ) : null}
              {section.description ? (
                <p className="px-2 pb-1 text-label leading-4 text-ink-400">{section.description}</p>
              ) : null}
              {section.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role={item.kind === "radio" ? "menuitemradio" : "menuitem"}
                  aria-checked={item.kind === "radio" ? Boolean(item.checked) : undefined}
                  disabled={item.disabled}
                  onClick={() => {
                    item.onSelect();
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-label transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    item.danger
                      ? "text-danger-text hover:bg-danger-soft"
                      : "text-ink-700 hover:bg-paper-field"
                  }`}
                >
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  {item.checked ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
