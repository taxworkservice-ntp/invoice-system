/**
 * Number formatting for *measure* fields (amounts, quantities).
 *
 * These are the rules behind `NumericInput`: what you type stays what you mean,
 * and what you see is grouped the way Thai accounting writes it (`5,000.50`).
 *
 * Deliberately not for identifiers — tax IDs, phone numbers, PO numbers, doc
 * numbers and bank accounts must stay plain digit strings.
 */

/** Thai (๐-๙) and Arabic-Indic (٠-٩) digits → ASCII, so IME/mobile input works. */
function normalizeDigits(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0x0e50 && code <= 0x0e59) out += String(code - 0x0e50);
    else if (code >= 0x0660 && code <= 0x0669) out += String(code - 0x0660);
    else out += char;
  }
  return out;
}

/**
 * Decide what the separators mean before they are stripped.
 *
 *   "1,234.50" → comma is grouping          → 1234.50
 *   "1,234,567" → comma is grouping          → 1234567
 *   "1234,5"   → comma is a decimal comma    → 1234.5
 *
 * Guessing wrong here is a 10× money error on paste, so the rule is explicit:
 * commas in groups of three are separators, any other comma is a decimal point.
 */
function normalizeSeparators(input: string, commasAreGrouping = false): string {
  const negative = input.trimStart().startsWith("-");
  let body = (negative ? input.replace("-", "") : input).replace(/[\s\u00a0_]/g, "");
  if (body.includes(",")) {
    if (commasAreGrouping || body.includes(".")) {
      // Grouping is settled: our own display only ever writes "," as a
      // thousands separator, and a dot anywhere means every comma is grouping
      // ("1,234.50").
      body = body.replace(/,/g, "");
    } else {
      const parts = body.split(",");
      const isGrouped =
        parts[0].length >= 1 &&
        parts[0].length <= 3 &&
        parts.slice(1).every((part) => /^\d{3}$/.test(part));
      // "1,234" groups; "1234,5" and "1234,567" are decimal commas.
      body = isGrouped ? body.replace(/,/g, "") : body.replace(",", ".");
    }
  }
  return (negative ? "-" : "") + body;
}

/**
 * Strip everything that is not part of a plain decimal number.
 * Accepts pasted values like "1,234.50", " 1 234,5 " and Thai digits.
 * At most one decimal point survives; a leading minus is kept.
 *
 * `commasAreGrouping` is set when the caller knows the text is its own
 * grouped output being edited (see `keepsOwnGrouping`). Without it, a comma in
 * a value like "6,0000" would be misread as a decimal comma and turn 60,000
 * into 6.00 — the paste heuristic can't tell the two apart on its own.
 */
export function sanitizeNumericInput(
  raw: string,
  { commasAreGrouping = false }: { commasAreGrouping?: boolean } = {},
): string {
  const normalized = normalizeSeparators(normalizeDigits(raw), commasAreGrouping);
  const negative = normalized.startsWith("-");
  const digitsAndDot = normalized.replace(/-/g, "").replace(/[^\d.]/g, "");
  const firstDot = digitsAndDot.indexOf(".");
  const cleaned =
    firstDot === -1
      ? digitsAndDot
      : `${digitsAndDot.slice(0, firstDot)}.${digitsAndDot.slice(firstDot + 1).replace(/\./g, "")}`;
  return `${negative ? "-" : ""}${cleaned}`;
}

/** Group the integer part: "5000" → "5,000". */
export function groupDigits(intPart: string): string {
  const sign = intPart.startsWith("-") ? "-" : "";
  const digits = sign ? intPart.slice(1) : intPart;
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format a sanitized numeric string for display. The fraction is never padded
 * while typing (typing "5." must stay "5."), but is capped at maxFractionDigits.
 */
export function formatTypedNumeric(text: string, maxFractionDigits = 2): string {
  if (text === "" || text === "-") return text;
  const [intPart, ...rest] = text.split(".");
  const hasDot = text.includes(".");
  const fraction = rest.join("").slice(0, maxFractionDigits);
  const grouped = groupDigits(intPart === "" ? "0" : intPart);
  if (!hasDot) return grouped;
  return `${grouped}.${fraction}`;
}

/** Display an existing value: grouped, capped, and padded to minFractionDigits. */
export function formatNumericValue(
  value: number | null | undefined,
  { maxFractionDigits = 2, minFractionDigits = 0 }: { maxFractionDigits?: number; minFractionDigits?: number } = {},
): string {
  if (value == null || !Number.isFinite(value)) return "";
  const fixed = value.toFixed(maxFractionDigits);
  const trimmed = fixed.includes(".")
    ? fixed.replace(/0+$/, "").replace(/\.$/, "")
    : fixed;
  const [intPart, fraction = ""] = trimmed.split(".");
  const padded = fraction.padEnd(minFractionDigits, "0");
  return `${groupDigits(intPart)}${padded ? `.${padded}` : ""}`;
}

/** Number from a sanitized/displayed string, or null when it is not a number. */
export function parseNumeric(text: string): number | null {
  const sanitized = sanitizeNumericInput(text);
  if (sanitized === "" || sanitized === "-" || sanitized === ".") return null;
  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** How many digits sit before the caret — the anchor that survives re-formatting. */
export function countDigitsBefore(text: string, caret: number): number {
  let count = 0;
  for (let i = 0; i < Math.min(caret, text.length); i += 1) {
    if (/\d/.test(text[i])) count += 1;
  }
  return count;
}

/** Caret position that sits just after `digitCount` digits. */
export function caretAfterDigits(text: string, digitCount: number): number {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (/\d/.test(text[i])) {
      seen += 1;
      if (seen === digitCount) return i + 1;
    }
  }
  return text.length;
}

/**
 * Caret position to restore after the field re-formats what was typed.
 *
 * While the officer types at the end, the caret belongs at the end — including
 * right after a just-typed decimal point. Counting digits only would put the
 * caret *before* that dot, so the next digit lands ahead of it and "0.35"
 * becomes "035.". Mid-string edits keep the digit anchor, which survives
 * re-grouping.
 */
export function nextCaret(
  raw: string,
  caret: number,
  formatted: string,
  digitsBefore: number,
): number {
  if (caret >= raw.length) return formatted.length;
  return caretAfterDigits(formatted, digitsBefore);
}

/**
 * True when `next` is `prev` with exactly one character typed or deleted at the
 * caret — i.e. the officer edited *our own* formatted text.
 *
 * A field that groups while typing shows "6,000" and the next keystroke makes
 * "6,0000"; `sanitizeNumericInput` cannot tell that comma apart from a pasted
 * decimal comma ("1234,5") on its own. But because the display was ours, the
 * comma must keep its grouping meaning. Only a single-digit insertion or a
 * single deletion counts — a paste (many chars at once), or a typed "," / "."
 * (not a digit) still goes through the paste heuristic.
 */
export function keepsOwnGrouping(prev: string, next: string, caret: number): boolean {
  if (next.length === prev.length + 1 && caret >= 1) {
    if (!/\d/.test(next[caret - 1])) return false;
    return prev === next.slice(0, caret - 1) + next.slice(caret);
  }
  if (next.length === prev.length - 1 && caret >= 0) {
    return prev.slice(0, caret) + prev.slice(caret + 1) === next;
  }
  return false;
}
