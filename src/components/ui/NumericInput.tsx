import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Input } from "./Input";
import {
  countDigitsBefore,
  formatNumericValue,
  formatTypedNumeric,
  keepsOwnGrouping,
  nextCaret,
  parseNumeric,
  sanitizeNumericInput,
} from "../../lib/numeric";

/**
 * Numeric field for **measures** — amounts, quantities, rates.
 *
 * Behaviour:
 *  - grouped while typing (`5000` → `5,000`), caret preserved;
 *  - fraction capped per field (`maxFractionDigits`: money 2, quantities 3);
 *  - paste-safe and tolerant of Thai digits;
 *  - `type="text"` + `inputMode="decimal"` — no browser spinners, numeric keypad
 *    on phones, and commas are legal characters.
 *
 * Never use it for identifiers (tax ID, phone, PO number, doc number, account
 * number) — those must stay plain digit strings.
 */
export interface NumericInputProps {
  /** Controlled numeric value. `null`/`""` renders empty. */
  value: number | null | undefined;
  /** Called with the parsed number (0 when cleared) — for number-state hosts. */
  onValueChange?: (value: number) => void;
  /**
   * Called with the plain numeric text as typed ("60000", "1234.5", "" when
   * cleared) — for hosts that keep string state and their own validation.
   */
  onTextChange?: (text: string) => void;
  label?: string;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
  className?: string;
  /** Fraction digits kept while typing (default 2). */
  maxFractionDigits?: number;
  /** Fraction digits shown when not focused, e.g. money `0.00` (default 0). */
  minFractionDigits?: number;
  /** Cap applied on blur/commit (defaults to maxFractionDigits). */
  maxValue?: number;
  /**
   * Render only the `<input>` with `className` — no label/error wrapper and no
   * base field styling. For compact line grids and bespoke cells that keep
   * their own look but still want the grouping/caret behaviour.
   */
  bare?: boolean;
}

export function NumericInput({
  value,
  onValueChange,
  onTextChange,
  label,
  error,
  placeholder,
  disabled,
  autoFocus,
  id,
  className = "",
  maxFractionDigits = 2,
  minFractionDigits = 0,
  maxValue,
  bare = false,
}: NumericInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const focused = useRef(false);

  const displayFor = useCallback(
    (next: number | null | undefined) =>
      formatNumericValue(next, {
        maxFractionDigits,
        minFractionDigits: focused.current ? 0 : minFractionDigits,
      }),
    [maxFractionDigits, minFractionDigits],
  );

  const [text, setText] = useState<string>(() => displayFor(value));

  // External changes (catalog pick, unit switch, draft load) win — unless the
  // officer is typing, where the keystroke is already reflected in `text`.
  useEffect(() => {
    if (focused.current) return;
    setText(displayFor(value));
  }, [value, displayFor]);

  useLayoutEffect(() => {
    if (pendingCaret.current == null || !inputRef.current) return;
    const caret = pendingCaret.current;
    pendingCaret.current = null;
    inputRef.current.setSelectionRange(caret, caret);
  });

  function commit(nextText: string) {
    // `nextText` is always our own formatted output — its commas are grouping.
    const sanitized = sanitizeNumericInput(nextText, { commasAreGrouping: true });
    const parsed = parseNumeric(sanitized);
    const bounded =
      parsed != null && maxValue != null ? Math.min(parsed, maxValue) : parsed;
    onValueChange?.(bounded ?? 0);
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    const caret = event.target.selectionStart ?? raw.length;
    const digitsBefore = countDigitsBefore(raw, caret);
    // Editing our own "6,000" into "6,0000" keeps the comma as grouping — the
    // paste heuristic would otherwise read it as a decimal comma (6.00). A
    // pasted value is not a single-char edit, so it still goes through the
    // heuristic.
    const commasAreGrouping = keepsOwnGrouping(text, raw, caret);
    const sanitized = sanitizeNumericInput(raw, { commasAreGrouping });
    const formatted = formatTypedNumeric(sanitized, maxFractionDigits);
    pendingCaret.current = nextCaret(raw, caret, formatted, digitsBefore);
    setText(formatted);
    onTextChange?.(sanitized);
    commit(formatted);
  }

  function handleFocus() {
    focused.current = true;
  }

  function handleBlur() {
    focused.current = false;
    const parsed = parseNumeric(text);
    const bounded =
      parsed != null && maxValue != null ? Math.min(parsed, maxValue) : parsed;
    setText(displayFor(bounded));
    if (parsed == null) onValueChange?.(0);
    onTextChange?.(parsed == null ? "" : String(bounded ?? 0));
  }

  if (bare) {
    return (
      <input
        ref={inputRef}
        id={id}
        value={text}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        inputMode="decimal"
        autoComplete="off"
        className={className}
      />
    );
  }

  return (
    <Input
      ref={inputRef}
      id={id}
      label={label}
      error={error}
      value={text}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      inputMode="decimal"
      autoComplete="off"
      className={className}
    />
  );
}
