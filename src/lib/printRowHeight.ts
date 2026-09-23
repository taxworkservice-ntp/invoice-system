import type { DocumentLineItem } from "../types";
import { getPrintableLineNote } from "./dnGroups";

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
// Classic V2 DELIVERY-NOTE row metrics, calibrated against the rendered CSS
// (scripts/print-layout-measure.mjs). A DN's line notes (6.5pt / line-height
// 1.25) and its group-band text are materially shorter than the item-name
// metric above; charging the item metric pushed dense DNs onto an extra page.
// Scoped to DNs via opts.dnNotes so invoice/quotation page breaks are
// untouched. Each stays ≥ the measured height (no clipping).
const DN_NOTE_LINE_MM = 2.9; // measured 2.99 @1x, 4.70 @1.6x
const DN_BAND_LINE_MM = 3.0; // measured 2.98 @1x, 4.77 @1.6x
const DN_BAND_FIXED_MM = 2.95; // band padding/border (measured 2.92–2.99)
// Classic V2 COMPACT delivery note (classic_v2_compact_dn): tighter row padding
// (1.5→1.1mm), table line-height (1.3→1.2) and band padding (1.2→0.8mm).
// Applied only when opts.compactDn — opt-in, DN-only, no font change. Values
// are the CSS deltas measured by scripts/print-layout-measure.mjs.
const COMPACT_ROW_FIXED_MM = 2.3; // 3.1 − 0.8mm vertical cell padding
const COMPACT_TEXT_LINE_MM = 3.2; // 7.5pt × line-height 1.2
const COMPACT_DN_NOTE_LINE_MM = 2.8; // 6.5pt × line-height 1.2
const COMPACT_DN_BAND_FIXED_MM = 2.15; // 2.95 − 0.8mm band padding
// Height of each extra "sub-line" rendered under a normal row: the line
// discount note (ส่วนลด X%), the inline delivery-note reference
// (อ้างอิง ใบส่งของ …), and the invoice-number reference (ใบแจ้งหนี้ …).
const SUBLINE_MM = { modern: 3.7, classic: 3.4 };
// Conservative per-row fudge so section gaps / rounding never pack a page
// tighter than it can render.
const ROW_SAFETY_MM = 0.8;
// Classic DN header rows render at 11pt (taller than a normal 7.5pt row).
const DN_HEADER_MM = { modern: 6.9, classic: 8.1 };
// Classic V2 DN group bands (ใบส่งของ DN-… divider row) — slim full-width
// row: ~2.4mm padding + a 7pt text line. classic_v2 only.
const DN_BAND_MM = { classic: 6.5 };
// Band portion that does NOT grow with --classic-font-scale: its fixed mm
// padding + border (same as a normal row's). Only the text line scales, so at
// large item scales the band is charged ~2mm less than scaling the whole
// 6.5mm row — the old estimate tipped small DNs onto a second page.
const CLASSIC_DN_BAND_FIXED_MM = DN_BAND_MM.classic - TEXT_LINE_MM.classic;
// Conservative characters per line for the description column, used to
// estimate name wrapping. Calibrated empirically in the 87mm description
// column with the app font (Thai + Latin mix): ~75 chars/line at 7.5pt,
// ~54 at 10.5pt — width growth is linear in the font scale, so the estimate
// divides by the scale; 63 ≈ 85% of measured capacity keeps the estimate
// conservative (over-counts wrapped lines slightly).
const NAME_CHARS_PER_LINE = {
  modern: 32,
  classic: 63,
  classicNoAmounts: 100,
};

// Portion of a classic row that does NOT grow with --classic-font-scale:
// the fixed mm cell padding + border (the text line above it does scale).
const CLASSIC_ROW_FIXED_MM = 3.1;
// DN header text portion: DN_HEADER_MM.classic - CLASSIC_ROW_FIXED_MM.
const CLASSIC_DN_HEADER_TEXT_MM = 5.0;
// Modern equivalent: the fixed py-1.5 padding stays constant while the text
// line (10px item base) grows with --modern-fs-items.
const MODERN_ROW_FIXED_MM = BASE_ROW_MM.modern - TEXT_LINE_MM.modern;

/**
 * Estimated base row height in mm. `fontScale` is the --classic-font-scale
 * multiplier (1 = default); only classic templates scale, and only the text
 * portion does — the mm padding stays constant, matching the CSS.
 */
export function getBaseRowMm(template: PrintTemplate, fontScale = 1): number {
  if (template === "modern") {
    return fontScale === 1
      ? BASE_ROW_MM.modern
      : MODERN_ROW_FIXED_MM + TEXT_LINE_MM.modern * fontScale;
  }
  if (fontScale !== 1) {
    return CLASSIC_ROW_FIXED_MM + TEXT_LINE_MM.classic * fontScale;
  }
  return BASE_ROW_MM.classic;
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
    /** classic_v2: this line starts a DN group → a band row renders above it. */
    hasDnGroupBand?: boolean;
    /** classic_v2: the group header above this line carries a second SO
     * line (full-band width, wraps). Null/empty = single-line header. */
    dnGroupSoHeader?: string | null;
    /**
     * classic_v2: the group band already prints a leading ref line
     * (`header.number`, e.g. "DN-2026-…"). When false the SO text IS the
     * band's (only) line, so its first line is already covered by the band
     * charge and must not be counted again. Defaults to true (all existing
     * callers — invoice groups always carry a ref line).
     */
    dnGroupHasRefLine?: boolean;
    /** Classic V2 delivery note: use the DN note line metric (6.5pt/1.25). */
    dnNotes?: boolean;
    /** Classic V2 delivery note with compact spacing (classic_v2_compact_dn). */
    compactDn?: boolean;
    /** Quotation line with an example photo (≈26mm image under the name). */
    hasLineImage?: boolean;
    /** --classic-font-scale multiplier for the description column (classic templates only, 1 = default). */
    fontScale?: number;
    /** Numeric-column scale — single-line cells; falls back to fontScale. */
    numScale?: number;
  } = {},
): number {
  const isClassic = template !== "modern";
  const key = isClassic ? "classic" : "modern";
  // Both templates scale now; modern's first line is the taller of the
  // description (items) and numeric-column scales.
  const fontScale = opts.fontScale ?? 1;
  const numScaleEarly = opts.numScale ?? fontScale;
  const base = isClassic
    ? getBaseRowMm(template, fontScale)
    : getBaseRowMm(template, Math.max(fontScale, numScaleEarly));

  const isDnHeader =
    !!(item.source_document_id && !item.source_line_item_id) &&
    item.quantity === 0 &&
    item.unit_price === 0;
  if (isDnHeader) {
    if (!isClassic) return base;
    return fontScale === 1
      ? DN_HEADER_MM.classic
      : CLASSIC_ROW_FIXED_MM + CLASSIC_DN_HEADER_TEXT_MM * fontScale;
  }

  // Numeric columns are single-line: their line height scales with numScale
  // and must not shrink the row below the description text.
  const numScale = opts.numScale ?? fontScale;
  const compactDn = isClassic && opts.compactDn === true;
  const rowFixedMm = compactDn ? COMPACT_ROW_FIXED_MM : CLASSIC_ROW_FIXED_MM;
  const nameLineMm = compactDn ? COMPACT_TEXT_LINE_MM : TEXT_LINE_MM[key];
  const firstLineMm = nameLineMm * Math.max(fontScale, numScale);
  const baseRowMm = isClassic
    ? rowFixedMm + firstLineMm
    : base;

  const rawCharsPerLine = isClassic
    ? opts.hideDeliveryAmounts
      ? NAME_CHARS_PER_LINE.classicNoAmounts
      : NAME_CHARS_PER_LINE.classic
    : NAME_CHARS_PER_LINE.modern;
  // Wrapped-text capacity shrinks as the font grows; floor keeps the
  // estimate conservative (over-estimates wrapped lines).
  const charsPerLine =
    fontScale === 1
      ? rawCharsPerLine
      : Math.max(1, Math.floor(rawCharsPerLine / fontScale));

  const nameLines = countLines(item.item_name, charsPerLine);
  const noteText = getPrintableLineNote(item.line_note);
  const noteLines = noteText ? countLines(noteText, charsPerLine) : 0;

  // Extra sub-lines that PrintLineItemsTable may render under the row.
  let subLines = 0;
  if (opts.hasLineDiscount) subLines += 1;
  if (opts.hasInlineDnRef) subLines += 1;
  if (opts.hasInvoiceRef) subLines += 1;
  if (opts.hasDnVariance) subLines += 1;

  // Delivery notes use the calibrated DN metrics for notes, group bands and
  // their SO lines; every other layout keeps the original metrics.
  const dnLine = isClassic && opts.dnNotes === true;
  const noteBaseMm = compactDn
    ? COMPACT_DN_NOTE_LINE_MM
    : dnLine
      ? DN_NOTE_LINE_MM
      : NOTE_LINE_MM[key];
  const bandLineMm = dnLine ? DN_BAND_LINE_MM : TEXT_LINE_MM.classic;
  const bandFixedMm = compactDn
    ? COMPACT_DN_BAND_FIXED_MM
    : dnLine
      ? DN_BAND_FIXED_MM
      : CLASSIC_DN_BAND_FIXED_MM;
  const soLineMm = dnLine ? DN_BAND_LINE_MM : SUBLINE_MM[key];

  const textScale = (mm: number) => (fontScale === 1 ? mm : mm * fontScale);
  const nameMm = baseRowMm + (nameLines - 1) * textScale(nameLineMm);
  const noteMm = noteLines * textScale(noteBaseMm);
  const subMm = subLines * textScale(SUBLINE_MM[key]);
  // Scaled text line only; the band's mm padding/border is fixed (identical
  // to the base-row treatment). At fontScale 1, non-DN is exactly DN_BAND_MM.
  const bandMm =
    isClassic && opts.hasDnGroupBand
      ? bandFixedMm + bandLineMm * fontScale
      : 0;
  // SO text spans the full band (roughly 2x the description column, slightly
  // smaller type). A band that also carries a ref line charges every SO line;
  // a SO-only band already counts its first line in bandMm, so only extra
  // wrapped lines are charged (charging the first again over-reserved one
  // line per single-header section and split dense DNs).
  const soText = String(opts.dnGroupSoHeader || "").trim();
  const soBandChars = Math.max(1, Math.floor(110 / Math.max(fontScale, 1)));
  const soLines = isClassic && soText ? countLines(soText, soBandChars) : 0;
  const soExtraLines = opts.dnGroupHasRefLine === false ? Math.max(0, soLines - 1) : soLines;
  const soMm = soExtraLines * textScale(soLineMm);
  // Example photo: fixed print height (font-scale independent) + gap.
  // Cap lowered ~15% (22mm; was 26mm) to match .print-classic-line-image.
  const imageMm = isClassic && opts.hasLineImage ? 22.8 : 0;
  return nameMm + noteMm + subMm + bandMm + soMm + imageMm + ROW_SAFETY_MM;
}

export function estimateSummaryRowHeight(
  template: PrintTemplate,
  fontScale = 1,
  /**
   * Numeric-column scale. Summary tables (billing-note / receipt / DN
   * reference) render every cell at the numeric scale, so the row height
   * must be charged at numScale — charging the (often larger) items scale
   * over-estimates and flips borderline docs to two pages. Defaults to
   * fontScale, preserving all existing single-scale behavior.
   */
  numScale?: number,
): number {
  return getBaseRowMm(template, numScale ?? fontScale);
}
