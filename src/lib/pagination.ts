import type { DocumentLineItem } from "../types";
import { getBaseRowMm } from "./printRowHeight";

// Floating-point tolerance (mm) so that a page whose row heights sum to exactly
// its height budget (e.g. uniform single-line rows filling the tuned capacity)
// is not wrongly pushed to another page by binary rounding.
const HEIGHT_EPSILON = 0.01;

export type PageMode = "single" | "first" | "continuation" | "last";

export interface PageBatch {
  items: DocumentLineItem[];
  mode: PageMode;
  startIndex: number; // 1-based item number for the first item in this batch
}

type PaginationKind = "line_items" | "summary_rows";

const LINE_ITEM_CAPACITY = {
  modern: { first: 20, continuation: 26, last: 14 },
  classic: { first: 18, continuation: 22, last: 12 },
};

// Summary tables share the page with the document header and final totals.
// Keep their capacity lower so payment details never get pushed off-page.
const SUMMARY_ROW_CAPACITY = {
  modern: { first: 12, continuation: 18, last: 8 },
  classic: { first: 12, continuation: 16, last: 8 },
};

// Row-area budgets above are tuned at --classic-font-scale = 1, but the fixed
// page blocks (header, info band, terms/totals, signatures, table head) also
// contain text that grows with the scale, eating into the row area. These
// coefficients are measured fixed-block growth in mm per unit of font scale
// (classic V2 fixture renders, rounded up conservatively) — budgets shrink by
// coefficient × (scale − 1). Summary pages carry the full header + totals on
// every page, so they always reserve the first-page coefficient.
const FONT_SCALE_BUDGET_RESERVE_MM = {
  line_items: { first: 150, continuation: 10, last: 45 },
  summary_rows: { first: 150, continuation: 150, last: 150 },
};

/**
 * Estimated row-area budget (mm) per page mode. `fontScale` is the classic V2
 * --classic-font-scale multiplier (1 = default, budgets unscaled).
 */
export function getRowBudgets(
  template: "modern" | "classic" | "classic_v2",
  fontScale = 1,
  kind: PaginationKind = "line_items",
): { first: number; continuation: number; last: number } {
  const baseMm = getBaseRowMm(template);
  const capacity = kind === "summary_rows"
    ? SUMMARY_ROW_CAPACITY[template === "modern" ? "modern" : "classic"]
    : LINE_ITEM_CAPACITY[template === "modern" ? "modern" : "classic"];
  const reserve = (mode: "first" | "continuation" | "last") =>
    template !== "modern" && fontScale !== 1
      ? // Never grow budgets below scale 1: if a user's fixed content doesn't
        // actually shrink, under-filled pages are harmless but overflow is not.
        Math.max(0, FONT_SCALE_BUDGET_RESERVE_MM[kind][mode] * (fontScale - 1))
      : 0;
  return {
    first: Math.max(baseMm, capacity.first * baseMm - reserve("first")),
    continuation: Math.max(baseMm, capacity.continuation * baseMm - reserve("continuation")),
    last: Math.max(baseMm, capacity.last * baseMm - reserve("last")),
  };
}

export interface GenericPageBatch<T> {
  items: T[];
  mode: PageMode;
  startIndex: number;
}

export interface PaginateOptions<T> {
  /**
   * Estimated rendered height in mm for each row. When provided, pages are
   * broken by height as well as count so that tall rows (multi-line notes,
   * wrapped names, classic DN headers) never overflow the fixed sheet and the
   * last page always has room for the totals/signature footer. When omitted, the tuned
   * count-based capacities are used unchanged.
   */
  estimateHeight?: (row: T, index: number) => number;
  /**
   * Classic V2 --classic-font-scale multiplier (1 = default). Shrinks the
   * per-page row budgets to make room for the scaled fixed page blocks.
   */
  fontScale?: number;
}

/**
 * Split rows into page batches.
 * Distributions are even across continuation pages — no sparse almost-empty pages.
 *
 * When an `estimateHeight` is provided the rows are paginated height-aware:
 * every page (first, continuation, last) is capped by an estimated rendered
 * height budget so content never clips off the fixed 297mm sheet, and the last
 * page is guaranteed room for the totals/signature footer.
 */
export function paginateRows<T>(
  rows: T[],
  template: "modern" | "classic" | "classic_v2",
  kind: PaginationKind = "line_items",
  options: PaginateOptions<T> = {},
): GenericPageBatch<T>[] {
  const templateKind = template === "modern" ? "modern" : "classic";
  const capacity = kind === "summary_rows"
    ? SUMMARY_ROW_CAPACITY[templateKind]
    : LINE_ITEM_CAPACITY[templateKind];
  const fp = capacity.first;
  const cp = capacity.continuation;
  const lp = capacity.last;

  if (options.estimateHeight) {
    return paginateRowsByHeight(
      rows,
      template,
      fp,
      cp,
      lp,
      options.estimateHeight,
      options.fontScale ?? 1,
      kind,
    );
  }

  return paginateRowsByCount(rows, fp, cp, lp);
}

function paginateRowsByCount<T>(
  rows: T[],
  fp: number,
  cp: number,
  lp: number,
): GenericPageBatch<T>[] {
  if (rows.length <= fp) {
    return [{ items: rows, mode: "single", startIndex: 1 }];
  }

  const batches: GenericPageBatch<T>[] = [];

  // First page
  batches.push({ items: rows.slice(0, fp), mode: "first", startIndex: 1 });

  const remaining = rows.slice(fp);
  const lastCount = Math.min(lp, remaining.length);
  const contTotal = remaining.length - lastCount;

  let head = 0; // cursor into `remaining`

  if (contTotal > 0) {
    const contPages = Math.ceil(contTotal / cp);
    const perPage = Math.ceil(contTotal / contPages);

    for (let i = 0; i < contPages; i++) {
      const pageItems = remaining.slice(head, Math.min(head + perPage, head + contTotal));
      batches.push({
        items: pageItems,
        mode: "continuation",
        startIndex: fp + head + 1,
      });
      head += pageItems.length;
    }
  }

  if (lastCount > 0) {
    batches.push({
      items: remaining.slice(head),
      mode: "last",
      startIndex: fp + head + 1,
    });
  }

  return batches;
}

function paginateRowsByHeight<T>(
  rows: T[],
  template: "modern" | "classic" | "classic_v2",
  fp: number,
  cp: number,
  lp: number,
  estimateHeight: (row: T, index: number) => number,
  fontScale = 1,
  kind: PaginationKind = "line_items",
): GenericPageBatch<T>[] {
  const budgets = getRowBudgets(template, fontScale, kind);
  const heights = rows.map((row, i) => estimateHeight(row, i));
  const totalHeight = heights.reduce((sum, h) => sum + h, 0);

  if (rows.length <= fp && totalHeight <= budgets.first + HEIGHT_EPSILON) {
    return [{ items: rows, mode: "single", startIndex: 1 }];
  }

  const fitFromStart = (from: number, budget: number, maxCount: number): number => {
    if (from >= heights.length) return 0;
    let acc = 0;
    let n = 0;
    while (n < maxCount && from + n < heights.length) {
      const h = heights[from + n];
      if (n > 0 && acc + h > budget + HEIGHT_EPSILON) break;
      acc += h;
      n++;
    }
    return Math.max(1, n);
  };

  const fitFromEnd = (end: number, budget: number, maxCount: number): number => {
    if (end <= 0) return 0;
    let acc = 0;
    let n = 0;
    while (n < maxCount && end - n > 0) {
      const h = heights[end - 1 - n];
      if (n > 0 && acc + h > budget + HEIGHT_EPSILON) break;
      acc += h;
      n++;
    }
    return Math.max(1, n);
  };

  const batches: GenericPageBatch<T>[] = [];

  const firstCount = fitFromStart(0, budgets.first, fp);
  batches.push({
    items: rows.slice(0, firstCount),
    mode: "first",
    startIndex: 1,
  });

  const rest = rows.length - firstCount;
  const lastCount = fitFromEnd(rows.length, budgets.last, Math.min(lp, rest));
  const midEnd = rows.length - lastCount;
  const midCount = midEnd - firstCount;

  let head = 0;

  if (midCount > 0) {
    const contPages = Math.ceil(midCount / cp);
    const perPage = Math.ceil(midCount / contPages);

    for (let i = 0; i < contPages + midCount && head < midCount; i++) {
      const idx = firstCount + head;
      const take = fitFromStart(idx, budgets.continuation, Math.min(perPage, midCount - head));
      if (take <= 0) break;
      batches.push({
        items: rows.slice(idx, idx + take),
        mode: "continuation",
        startIndex: idx + 1,
      });
      head += take;
    }
  }

  if (lastCount > 0) {
    batches.push({
      items: rows.slice(midEnd),
      mode: "last",
      startIndex: midEnd + 1,
    });
  }

  return batches;
}

export function paginateLineItems(
  lineItems: DocumentLineItem[],
  template: "modern" | "classic" | "classic_v2",
  opts: { estimateHeight?: (item: DocumentLineItem) => number; fontScale?: number } = {},
): PageBatch[] {
  return paginateRows(lineItems, template, "line_items", {
    estimateHeight: opts.estimateHeight,
    fontScale: opts.fontScale,
  }) as PageBatch[];
}

export function getTotalPages(batches: PageBatch[]): number {
  return batches.length;
}
