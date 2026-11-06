import { useRef, type InputHTMLAttributes } from "react";
import { CalendarDays } from "lucide-react";
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

  // The native calendar opens anchored to the element showPicker() is called
  // on — so the trigger is a visible button, never the hidden input. A click
  // is also a real user gesture, which showPicker() requires.
  function openPicker() {
    try {
      dateRef.current?.showPicker();
    } catch {
      // Browsers without showPicker: focus stays in the text field for typing.
    }
  }

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
        placeholder="dd/mm/yyyy"
        inputMode="numeric"
        disabled={disabled}
        className={`w-full py-2 pl-3 pr-10 text-body border rounded-control bg-white placeholder:text-ink-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors ${disabled ? "opacity-60" : ""} ${className}`}
        {...props}
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label="เปิดปฏิทิน"
        title="เปิดปฏิทิน"
        className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-control text-ink-400 transition-colors hover:bg-paper-field hover:text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CalendarDays className="h-4 w-4" />
      </button>
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
