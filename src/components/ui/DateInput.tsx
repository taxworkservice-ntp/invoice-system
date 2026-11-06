import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { InputHTMLAttributes, KeyboardEvent as ReactKeyboardEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import {
  bangkokTodayString,
  formatDocDateFull,
  fromEraYear,
  toEraYear,
  type YearEra,
} from "../../lib/dates";
import { useYearEra } from "../YearEraProvider";

/**
 * `dd/mm/yyyy` text field with a calendar popover. The year it shows follows
 * the workspace era, while the stored value stays ISO (ค.ศ.).
 *
 * The popover is rendered (not native): it flips above the field when space
 * is short and clamps horizontally so it never leaves the viewport — the
 * native picker cannot promise that on Safari.
 */
function formatDisplay(iso: string, era: YearEra) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${toEraYear(Number(y), era)}`;
}

function toISO(y: number, m: number, d: number) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function parseISO(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  return { y, m, d };
}

const WEEKDAY_INITIALS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const PANEL_WIDTH = 288;
const PANEL_GAP = 6;
const VIEWPORT_MARGIN = 8;

export function DateInput({
  value,
  onChange,
  className = "",
  disabled,
  id,
  label,
  error,
  size = "md",
  min,
  max,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "size"> & {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label?: string;
  error?: string;
  size?: "sm" | "md";
}) {
  const textRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const era = useYearEra();
  const dialogId = useId();
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = error ? `${fieldId}-error` : undefined;

  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ y: 0, m: 0 });
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const today = bangkokTodayString();
  const selected = parseISO(value || "");
  const sizes = size === "sm" ? "px-2.5 py-1.5 text-label" : "px-3 py-2 text-body";

  function emit(iso: string) {
    onChange({ target: { value: iso } } as React.ChangeEvent<HTMLInputElement>);
  }

  function openAtCurrent() {
    const base = parseISO(value || "") ?? parseISO(today) ?? { y: 2000, m: 0, d: 1 };
    setView({ y: base.y, m: base.m });
    setOpen(true);
  }

  function close(returnFocusTo: "button" | "text" | null) {
    setOpen(false);
    setPos(null);
    if (returnFocusTo === "button") buttonRef.current?.focus();
    if (returnFocusTo === "text") textRef.current?.focus();
  }

  // Viewport-safe position: below by default, flips above when cramped,
  // clamps horizontally. Recomputed on open + scroll/resize.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = rootRef.current?.getBoundingClientRect();
      const height = panelRef.current?.offsetHeight ?? 360;
      if (!anchor) return;
      let top = anchor.bottom + PANEL_GAP;
      const fitsBelow = window.innerHeight - anchor.bottom >= height + VIEWPORT_MARGIN;
      const fitsAbove = anchor.top >= height + VIEWPORT_MARGIN;
      if (!fitsBelow && fitsAbove) top = anchor.top - height - PANEL_GAP;
      const left = Math.min(
        Math.max(anchor.left, VIEWPORT_MARGIN),
        Math.max(VIEWPORT_MARGIN, window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN),
      );
      setPos({ top: Math.max(VIEWPORT_MARGIN, top), left });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, view]);

  // Outside click + Escape dismiss.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close("button");
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const firstDow = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = view.y ? new Date(view.y, view.m + 1, 0).getDate() : 0;
  const monthName = view.y
    ? new Date(view.y, view.m, 1).toLocaleDateString("th-TH", { month: "long" })
    : "";
  const inRange = (iso: string) => (!min || iso >= min) && (!max || iso <= max);

  function moveMonth(delta: number) {
    setView((v) => {
      const m = v.m + delta;
      return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
    });
  }

  function moveYear(delta: number) {
    setView((v) => ({ y: v.y + delta, m: v.m }));
  }

  function pickDay(d: number) {
    const iso = toISO(view.y, view.m, d);
    if (!inRange(iso)) return;
    emit(iso);
    close("text");
  }

  function handleGridKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(
      panelRef.current?.querySelectorAll<HTMLButtonElement>("[data-day]") ?? [],
    ).filter((b) => !b.disabled);
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    let next = -1;
    if (event.key === "ArrowRight") next = current + 1;
    else if (event.key === "ArrowLeft") next = current - 1;
    else if (event.key === "ArrowDown") next = current + 7;
    else if (event.key === "ArrowUp") next = current - 7;
    else if (event.key === "Home") next = current - (current % 7);
    else if (event.key === "End") next = current + (6 - (current % 7));
    else return;
    event.preventDefault();
    if (next < 0 || next >= buttons.length) return;
    buttons[next].focus();
  }

  return (
    <div>
      {label ? (
        <label htmlFor={fieldId} className="mb-1 block text-label font-medium text-ink-600">
          {label}
        </label>
      ) : null}
      <div ref={rootRef} className="relative">
        <input
          id={fieldId}
          ref={textRef}
          type="text"
          value={formatDisplay(value || "", era)}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          onChange={(e) => {
            const raw = e.target.value.replace(/\//g, "");
            if (raw.length >= 8) {
              const d = raw.substring(0, 2);
              const m = raw.substring(2, 4);
              const y = raw.substring(4, 8);
              emit(`${fromEraYear(Number(y), era)}-${m}-${d}`);
            }
          }}
          placeholder="dd/mm/yyyy"
          inputMode="numeric"
          disabled={disabled}
          className={`w-full py-2 pl-3 pr-10 border rounded-control bg-white placeholder:text-ink-400 focus:outline-none focus:ring-2 transition-colors ${sizes} ${disabled ? "opacity-60" : ""} ${error ? "border-danger focus:border-danger focus:ring-danger/20" : "border-card-border focus:border-primary focus:ring-primary/20"} ${className}`}
          {...props}
        />
        <button
          ref={buttonRef}
          type="button"
          onClick={() => (open ? close(null) : openAtCurrent())}
          disabled={disabled}
          aria-label="เปิดปฏิทิน"
          title="เปิดปฏิทิน"
          aria-expanded={open}
          aria-haspopup="dialog"
          className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-control text-ink-400 transition-colors hover:bg-paper-field hover:text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CalendarDays className="h-4 w-4" />
        </button>

        {open ? (
          <div
            ref={panelRef}
            role="dialog"
            id={dialogId}
            aria-label="เลือกวันที่"
            style={{
              position: "fixed",
              zIndex: 70,
              width: PANEL_WIDTH,
              ...(pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" as const }),
            }}
            className="rounded-card border border-card-border bg-white p-3 shadow-overlay"
          >
            <div className="mb-2 flex items-center justify-between gap-1">
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => moveYear(-1)}
                  aria-label="ปีก่อนหน้า"
                  className="flex h-8 w-8 items-center justify-center rounded-control text-ink-400 transition-colors hover:bg-paper-field hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveMonth(-1)}
                  aria-label="เดือนก่อนหน้า"
                  className="flex h-8 w-8 items-center justify-center rounded-control text-ink-400 transition-colors hover:bg-paper-field hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
              <div className="min-w-0 flex-1 truncate text-center text-body font-semibold text-ink-900">
                {monthName} {view.y ? toEraYear(view.y, era) : ""}
              </div>
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => moveMonth(1)}
                  aria-label="เดือนถัดไป"
                  className="flex h-8 w-8 items-center justify-center rounded-control text-ink-400 transition-colors hover:bg-paper-field hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveYear(1)}
                  aria-label="ปีถัดไป"
                  className="flex h-8 w-8 items-center justify-center rounded-control text-ink-400 transition-colors hover:bg-paper-field hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div
              role="grid"
              aria-label={`${monthName} ${view.y ? toEraYear(view.y, era) : ""}`}
              onKeyDown={handleGridKeyDown}
              className="grid grid-cols-7 gap-0.5"
            >
              {WEEKDAY_INITIALS.map((day, index) => (
                <span
                  key={`${day}-${index}`}
                  aria-hidden="true"
                  className="flex h-8 items-center justify-center text-label font-medium text-ink-400"
                >
                  {day}
                </span>
              ))}
              {Array.from({ length: firstDow }, (_, i) => (
                <span key={`blank-${i}`} aria-hidden="true" />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const d = i + 1;
                const iso = toISO(view.y, view.m, d);
                const isSelected =
                  selected?.y === view.y && selected?.m === view.m && value === iso;
                const isToday = iso === today;
                const allowed = inRange(iso);
                return (
                  <button
                    key={d}
                    type="button"
                    data-day={iso}
                    disabled={!allowed}
                    onClick={() => pickDay(d)}
                    aria-label={formatDocDateFull(iso, era)}
                    aria-pressed={isSelected}
                    aria-current={isToday ? "date" : undefined}
                    className={`flex h-10 items-center justify-center rounded-control text-body tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-30 ${
                      isSelected
                        ? "bg-primary font-semibold text-white hover:bg-primary-deep"
                        : isToday
                          ? "border border-primary font-medium text-primary-deep hover:bg-primary-soft"
                          : "text-ink-700 hover:bg-paper-field"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                if (inRange(today)) {
                  emit(today);
                  close("text");
                }
              }}
              disabled={!inRange(today)}
              className="mt-2 w-full rounded-control border border-card-border bg-white px-3 py-2 text-body font-medium text-primary-deep transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              วันนี้
            </button>
          </div>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="mt-1 text-label text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
