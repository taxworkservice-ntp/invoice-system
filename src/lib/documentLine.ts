import { cartonsToBase, round3 } from "./stock";

/**
 * Rules that every line-item document shares: carton/unit maths and the
 * "price needs confirming" policy.
 *
 * Both the deal form (`deals/new`) and the delivery-note-from-quotation form
 * grew their own copy of these. Two of those copies had already drifted — the
 * quotation path had no price-deviation warning at all. Add a rule here once;
 * screens only choose the policy options they need.
 */

/* ------------------------------------------------------------------ *
 * Units and cartons
 * ------------------------------------------------------------------ */

/**
 * Fields every line-item form has. The deal form and the quotation
 * delivery-note form describe their own lines with extra fields on top of this
 * one, and both must satisfy it — that is what lets one line editor serve both.
 *
 * Note the two carton fields are deliberately different things:
 *  - `qty_per_carton` — the catalog factor (12 pieces per carton), kept on the
 *    line while it is being drafted;
 *  - `qty_carton` — how many cartons this line delivers, the persisted snapshot
 *    the printed document reads.
 */
export interface DocumentLine {
  id: string;
  item_id: string | null;
  item_name: string;
  item_sku?: string | null;
  item_type: string;
  unit: string;
  unit_price: number;
  quantity: number;
  discount_percent?: number;
  line_note: string;
  /**
   * Mandatory DN price review (opt-in per workspace): false until the officer
   * edits the price or ticks the per-line confirm control.
   */
  price_confirmed: boolean;
  hide_amounts_on_print: boolean;
  isSectionMarker: boolean;
  carton_unit?: string | null;
  qty_per_carton?: number | null;
  qty_carton?: number | null;
  image_url?: string | null;
}

export interface CartonLine {
  quantity: number;
  unit: string;
  carton_unit?: string | null;
  qty_per_carton?: number | null;
}

/** The line is sold in both a base unit and a carton. */
export function hasCartonOption(line: CartonLine): boolean {
  return Boolean(line.carton_unit && line.qty_per_carton && line.qty_per_carton > 0);
}

/** The line's current unit is the carton (so stock/qty must convert). */
export function isCartonUnitSelected(line: CartonLine): boolean {
  return hasCartonOption(line) && line.unit === line.carton_unit;
}

/** Quantity expressed in the catalog's base unit. */
export function lineBaseQuantity(line: CartonLine): number {
  if (isCartonUnitSelected(line) && line.qty_per_carton) {
    return cartonsToBase(line.quantity, line.qty_per_carton);
  }
  return round3(line.quantity);
}

/**
 * Catalog price expressed in the line's current unit, so selling by carton
 * compares against the carton price instead of false-triggering.
 */
export function suggestedUnitPrice(
  baseUnitPrice: number,
  unit: string,
  cartonUnit?: string | null,
  qtyPerCarton?: number | null,
): number {
  if (cartonUnit && qtyPerCarton && qtyPerCarton > 0 && unit === cartonUnit) {
    return Math.round(baseUnitPrice * qtyPerCarton * 100) / 100;
  }
  return baseUnitPrice;
}

/**
 * Catalog-price deviation guard for the non-blocking "wrong unit price" hint.
 * Returns the expected catalog price when the typed price deviates by more
 * than `warnPct`, otherwise null. `warnPct <= 0` disables the check, and a
 * missing/zero base price or typed price is never treated as a typo signal.
 */
export function priceDeviation({
  unitPrice,
  baseUnitPrice,
  unit,
  cartonUnit,
  qtyPerCarton,
  warnPct,
}: {
  unitPrice: number;
  baseUnitPrice: number | null | undefined;
  unit: string;
  cartonUnit?: string | null;
  qtyPerCarton?: number | null;
  warnPct: number;
}): number | null {
  if (!(warnPct > 0)) return null;
  if (baseUnitPrice == null) return null; // free-text line — nothing to compare against
  const expected = suggestedUnitPrice(baseUnitPrice, unit, cartonUnit, qtyPerCarton);
  if (!(expected > 0)) return null;
  if (!(unitPrice > 0)) return null; // empty/zero price — not a typo signal
  const deviationPct = (Math.abs(unitPrice - expected) / expected) * 100;
  return deviationPct > warnPct ? expected : null;
}

/* ------------------------------------------------------------------ *
 * Carton bookkeeping
 * ------------------------------------------------------------------ */
export interface CartonSaveQuantities {
  /** Pieces — what stock is deducted by. */
  baseQuantity: number;
  /** Cartons — what the printed document shows. */
  qtyCarton: number;
  cartonUnit: string;
}

/**
 * Bookkeeping for a line sold in cartons: the paper shows cartons, stock moves
 * in pieces. Returns null when the line is not being sold by the carton, so
 * callers keep their normal (non-carton) quantity handling.
 */
export function cartonSaveQuantities({
  quantity,
  unit,
  cartonUnit,
  qtyPerCarton,
}: {
  quantity: number;
  unit: string;
  cartonUnit?: string | null;
  qtyPerCarton?: number | null;
}): CartonSaveQuantities | null {
  if (!cartonUnit || !qtyPerCarton || qtyPerCarton <= 0) return null;
  if (unit !== cartonUnit) return null;
  return {
    baseQuantity: cartonsToBase(quantity, qtyPerCarton),
    qtyCarton: round3(quantity),
    cartonUnit,
  };
}

/* ------------------------------------------------------------------ *
 * Mandatory price review (opt-in per workspace)
 * ------------------------------------------------------------------ */

export interface PriceReviewLine {
  isSectionMarker: boolean;
  item_name: string;
  price_confirmed: boolean;
}

export interface PriceReviewOptions {
  /**
   * Count only named lines. The deal form uses this (an unnamed row is an
   * unfinished placeholder). The delivery-note-from-quotation form allows
   * unnamed product rows to be saved, so it counts every non-marker line.
   */
  namedOnly?: boolean;
}

/** True when the workspace forces per-line price confirmation. */
export function isPriceReviewRequired({
  requireDnPriceReview,
  isBlankForm,
}: {
  requireDnPriceReview: boolean;
  isBlankForm: boolean;
}): boolean {
  return requireDnPriceReview && !isBlankForm;
}

/** A line that carries (or will carry) a price the officer must confirm. */
export function isReviewableLine<T extends PriceReviewLine>(
  line: T,
  { namedOnly = true }: PriceReviewOptions = {},
): boolean {
  if (line.isSectionMarker) return false;
  if (namedOnly && !line.item_name.trim()) return false;
  return true;
}

export function countReviewableLines<T extends PriceReviewLine>(
  lines: T[],
  options?: PriceReviewOptions,
): number {
  return lines.filter((line) => isReviewableLine(line, options)).length;
}

export function pendingPriceReviewLines<T extends PriceReviewLine>(
  lines: T[],
  options?: PriceReviewOptions,
): T[] {
  return lines.filter((line) => isReviewableLine(line, options) && !line.price_confirmed);
}

export function countPendingPriceReviews<T extends PriceReviewLine>(
  lines: T[],
  options?: PriceReviewOptions,
): number {
  return pendingPriceReviewLines(lines, options).length;
}

export function findNextPendingPriceReview<T extends PriceReviewLine>(
  lines: T[],
  options?: PriceReviewOptions,
): T | null {
  return pendingPriceReviewLines(lines, options)[0] ?? null;
}
