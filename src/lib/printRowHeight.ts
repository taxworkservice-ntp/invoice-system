import type { DocumentLineItem } from "../types";

export type PrintTemplate = "modern" | "classic" | "classic_v2";

/**
 * Estimated rendered height of a single-line data row, in mm.
 * Derived from the print CSS: modern rows use `py-1.5` (3mm padding) plus a
 * 14px item-name line (~3.7mm); classic rows use 1.5mm padding (3mm total)
 * plus a 7.5pt line at 1.3 line-height (~3.4mm). Values are rounded up so
 * estimates are conservative (over-estimate) — a page is never packed tighter
 * than it can actually render, so rows never clip off the fixed sheet.
 */
export const BASE_ROW_MM = { modern: 6.9, classic: 6.5 };

// Height of an additional wrapped text line inside a row.
const TEXT_LINE_MM = { modern: 3.7, classic: 3.4 };
// Height of a line_note line (smaller font than the item name).
const NOTE_LINE_MM = { modern: 3.7, classic: 3.4 };
// Height of each extra "sub-line" rendered under a normal row: the line
// discount note (ส่วนลด X%), the inline delivery-note reference
// (อ้างอิง ใบส่งของ …), and the invoice-number reference (ใบแจ้งหนี้ …).
const SUBLINE_MM = { modern: 3.7, classic: 3.4 };
// Conservative per-row fudge so section gaps / rounding never pack a page
// tighter than it can render.
const ROW_SAFETY_MM = 0.8;
// Classic DN header rows render at 11pt (taller than a normal 7.5pt row).
const DN_HEADER_MM = { modern: 6.9, classic: 8.1 };
// Conservative characters per line for the description column, used to
// estimate name wrapping. Over-estimating wrap lines keeps heights safe.
const NAME_CHARS_PER_LINE = {
  modern: 32,
  classic: 28,
  classicNoAmounts: 48,
};

export function getBaseRowMm(template: PrintTemplate): number {
  return template === "modern" ? BASE_ROW_MM.modern : BASE_ROW_MM.classic;
}

function getPrintableLineNote(note: string | null | undefined): string {
  return String(note || "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "[USAGE_BILL]")
    .join("\n")
    .trim();
}

function countLines(text: string, charsPerLine: number): number {
  const lines = text.split(/\r?\n/);
  let count = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    count += Math.max(1, Math.ceil(trimmed.length / charsPerLine));
  }
  return count;
}

export function estimateLineItemHeight(
  item: DocumentLineItem,
  template: PrintTemplate,
  opts: {
    hideDeliveryAmounts?: boolean;
    hasLineDiscount?: boolean;
    hasInlineDnRef?: boolean;
    hasInvoiceRef?: boolean;
    /** DN variance sub-line (show_dn_variance) rendered under the row. */
    hasDnVariance?: boolean;
  } = {},
): number {
  const isClassic = template !== "modern";
  const key = isClassic ? "classic" : "modern";
  const base = BASE_ROW_MM[key];

  const isDnHeader =
    !!(item.source_document_id && !item.source_line_item_id) &&
    item.quantity === 0 &&
    item.unit_price === 0;
  if (isDnHeader) {
    return isClassic ? DN_HEADER_MM.classic : base;
  }

  const charsPerLine = isClassic
    ? opts.hideDeliveryAmounts
      ? NAME_CHARS_PER_LINE.classicNoAmounts
      : NAME_CHARS_PER_LINE.classic
    : NAME_CHARS_PER_LINE.modern;

  const nameLines = countLines(item.item_name, charsPerLine);
  const noteText = getPrintableLineNote(item.line_note);
  const noteLines = noteText ? countLines(noteText, charsPerLine) : 0;

  // Extra sub-lines that PrintLineItemsTable may render under the row.
  let subLines = 0;
  if (opts.hasLineDiscount) subLines += 1;
  if (opts.hasInlineDnRef) subLines += 1;
  if (opts.hasInvoiceRef) subLines += 1;
  if (opts.hasDnVariance) subLines += 1;

  const nameMm = base + (nameLines - 1) * TEXT_LINE_MM[key];
  const noteMm = noteLines * NOTE_LINE_MM[key];
  const subMm = subLines * SUBLINE_MM[key];
  return nameMm + noteMm + subMm + ROW_SAFETY_MM;
}

export function estimateSummaryRowHeight(template: PrintTemplate): number {
  return getBaseRowMm(template);
}
