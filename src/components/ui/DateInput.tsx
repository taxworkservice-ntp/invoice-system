import { useRef, type InputHTMLAttributes } from "react";

function formatDisplay(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
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

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={formatDisplay(value || "")}
        onChange={(e) => {
          const raw = e.target.value.replace(/\//g, "");
          if (raw.length >= 8) {
            const d = raw.substring(0, 2);
            const m = raw.substring(2, 4);
            const y = raw.substring(4, 8);
            onChange({
              target: { value: `${y}-${m}-${d}` },
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
        className={`w-full px-3 py-2 text-sm border rounded-lg bg-white placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors ${disabled ? "opacity-60" : ""} ${className}`}
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
