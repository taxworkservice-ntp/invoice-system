import React from "react";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  id?: string;
}

/** Small CSS-only toggle switch for on/off settings. */
export function Switch({ checked, onChange, label, disabled, id }: SwitchProps) {
  return (
    <label className={`inline-flex items-center gap-2 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <span className="relative inline-block align-middle">
        <input
          id={id}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="block h-5 w-9 rounded-full bg-line transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
      </span>
      {label ? <span className="text-label text-ink-600 select-none">{label}</span> : null}
    </label>
  );
}
