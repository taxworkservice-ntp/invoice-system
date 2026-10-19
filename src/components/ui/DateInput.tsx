import { useRef, type InputHTMLAttributes } from "react";
import { fromEraYear, toEraYear, type YearEra } from "../../lib/dates";
import { useYearEra } from "../YearEraProvider";

/**
 * `dd/mm/yyyy` text field backed by a hidden native date picker. The year it
 * shows follows the workspace era, while the stored value stays ISO (ค.ศ.).
 */
function formatDisplay(iso: string, era: YearEra) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${toEraYear(Number(y), era)}`;
}

export function DateInput({
  value,
  onChange,
  className = "",
  disabled,
  id,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const dateRef = useRef<HTMLInputElement>(null);
  const era = useYearEra();

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={formatDisplay(value || "", era)}
        onChange={(e) => {
          const raw = e.target.value.replace(/\//g, "");
          if (raw.length >= 8) {
            const d = raw.substring(0, 2);
            const m = raw.substring(2, 4);
            const y = raw.substring(4, 8);
            onChange({
              target: { value: `${fromEraYear(Number(y), era)}-${m}-${d}` },
            } as React.ChangeEvent<HTMLInputElement>);
          }
        }}
        onFocus={() => {
          try {
            dateRef.current?.showPicker();
          } catch {
            dateRef.current?.focus();
          }
        }}
        placeholder="dd/mm/yyyy"
        inputMode="numeric"
        disabled={disabled}
        className={`w-full px-3 py-2 text-body border rounded-control bg-white placeholder:text-ink-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors ${disabled ? "opacity-60" : ""} ${className}`}
        {...props}
      />
      <input
        ref={dateRef}
        type="date"
        value={value || ""}
        onChange={(e) => {
          onChange(e);
        }}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      />
    </div>
  );
}
