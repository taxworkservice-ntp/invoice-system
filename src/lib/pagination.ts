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

type CapacityRow = { first: number; firstMulti?: number; continuation: number; continuationFullHeader?: number; last: number };

const LINE_ITEM_CAPACITY: Record<"modern" | "classic" | "classic_v2", CapacityRow> = {
  modern: { first: 20, continuation: 26, last: 14 },
  classic: { first: 18, continuation: 22, last: 12 },
  // classic_v2: multi-page FIRST pages carry only header + info band (totals
  // and signatures live on the last page), so they pack ~28 rows vs 19 on a
  // single-page document; continuation/last caps measured against the fixed
  // blocks at ปกติ with the font-scale reserves on top. continuationFullHeader
  // = the full header + info band repeats on continuation pages (workspace
  // setting) → fewer rows per continuation page.
  classic_v2: { first: 19, firstMulti: 28, continuation: 34, continuationFullHeader: 28, last: 24 },
};

// Summary tables share the page with the document header and final totals.
// Keep their capacity lower so payment details never get pushed off-page.
const SUMMARY_ROW_CAPACITY: Record<"modern" | "classic" | "classic_v2", CapacityRow> = {
  modern: { first: 12, continuation: 18, last: 8 },
  classic: { first: 12, continuation: 16, last: 8 },
  classic_v2: { first: 12, firstMulti: 26, continuation: 32, continuationFullHeader: 26, last: 22 },
};

// Row-area budgets above are tuned at --classic-font-scale = 1, but the fixed
// page blocks (header, info band, terms/totals, signatures, table head) also
// contain text that grows with the font scale, eating into the row area.
// These per-section coefficients are the measured fixed-block growth in mm per
// unit of that section's font scale (classic V2 fixture renders, rounded up
// conservatively); budgets shrink by Σ coefficient × (section scale − 1).
// Summary pages carry the full header + totals on every page, so they reserve
// every section on every page.
const FONT_SCALE_SECTION_RESERVE_MM = { header: 51, items: 0, thead: 5, totals: 48, footer: 21 } as const;

const FONT_SCALE_PAGE_SECTIONS = {
  line_items: {
    first: ["header", "thead", "totals", "footer"],
    first_multi: ["header", "thead"],
    continuation: ["thead"],
    continuation_full_header: ["header", "thead"],
    last: ["thead", "totals", "footer"],
  },
  // Full document layout on every summary page.
  summary_rows: {
    first: ["header", "thead", "totals", "footer"],
    first_multi: ["header", "thead"],
    continuation: ["header", "thead", "totals", "footer"],
    continuation_full_header: ["header", "thead"],
    last: ["header", "thead", "totals", "footer"],
  },
} as const;

export type ClassicV2FontScales = {
  header: number;
  /** Item description (names/notes) scale — drives row heights. */
  items: number;
  /** Numeric column scale — falls back to `items` when unset. */
  num?: number;
  /** Table head scale — falls back to `items` when unset. */
  thead?: number;
  totals: number;
  footer: number;
};

function normalizeFontScales(
  fontScale: number | ClassicV2FontScales,
): Required<ClassicV2FontScales> {
  if (typeof fontScale === "number") {
    return { header: fontScale, items: fontScale, num: fontScale, thead: fontScale, totals: fontScale, footer: fontScale };
  }
  return {
    header: fontScale.header,
    items: fontScale.items,
    num: fontScale.num ?? fontScale.items,
    thead: fontScale.thead ?? fontScale.items,
    totals: fontScale.totals,
    footer: fontScale.footer,
  };
}

/**
 * Estimated row-area budget (mm) per page mode. `fontScale` is the classic V2
 * font scale — either one uniform multiplier (1 = default, budgets unscaled)
 * or per-section multipliers ({@link ClassicV2FontScales}). `opts.multiFirst`
 * switches the FIRST-page budget to the multi-page layout (no totals/footer on
 * that page — they live on the last page), which packs more rows.
 */
export function getRowBudgets(
  template: "modern" | "classic" | "classic_v2",
  fontScale: number | ClassicV2FontScales = 1,
  kind: PaginationKind = "line_items",
  extraReserveMm = 0,
  opts: { multiFirst?: boolean; continuationFullHeader?: boolean } = {},
): { first: number; continuation: number; last: number } {
  const baseMm = getBaseRowMm(template);
  const cap = kind === "summary_rows"
    ? SUMMARY_ROW_CAPACITY[template === "modern" ? "modern" : template === "classic_v2" ? "classic_v2" : "classic"]
    : LINE_ITEM_CAPACITY[template === "modern" ? "modern" : template === "classic_v2" ? "classic_v2" : "classic"];
  const scales = normalizeFontScales(fontScale);
  const reserve = (mode: "first" | "first_multi" | "continuation" | "continuation_full_header" | "last") => {
    if (template === "modern") return 0;
    return FONT_SCALE_PAGE_SECTIONS[kind][mode].reduce((sum, section) => {
      // Never grow budgets below scale 1: if a user's fixed content doesn't
      // actually shrink, under-filled pages are harmless but overflow is not.
      return sum + FONT_SCALE_SECTION_RESERVE_MM[section] * Math.max(0, scales[section] - 1);
    }, 0);
  };
  // At extreme scales a single estimated row can exceed the reserve-shrunk
  // budget; the paginator always places at least one row, so budgets never
  // drop below one scaled row height. extraReserveMm applies to first/last
  // pages only — footer-area content (e.g. the billing-note cheque strip)
  // does not render on continuation pages, and the multi-page first page has
  // no footer either.
  const minRowMm = getBaseRowMm(template, scales.items);
  const firstReserve = opts.multiFirst ? reserve("first_multi") : reserve("first");
  const firstExtra = opts.multiFirst ? 0 : extraReserveMm;
  const firstCap = opts.multiFirst ? (cap.firstMulti ?? cap.first) : cap.first;
  const contMode = opts.continuationFullHeader ? "continuation_full_header" : "continuation";
  const contCap = opts.continuationFullHeader ? (cap.continuationFullHeader ?? cap.continuation) : cap.continuation;
  return {
    first: Math.max(minRowMm, firstCap * baseMm - firstReserve - firstExtra),
    continuation: Math.max(minRowMm, contCap * baseMm - reserve(contMode)),
    last: Math.max(minRowMm, cap.last * baseMm - reserve("last") - extraReserveMm),
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
   * Classic V2 font scale for the row-area budgets — one uniform multiplier
   * (1 = default) or per-section multipliers. Shrinks the per-page row
   * budgets to make room for the scaled fixed page blocks.
   */
  fontScale?: number | ClassicV2FontScales;
  /**
   * Fixed extra reserve (mm) subtracted from the FIRST and LAST page budgets
   * only — footer-area content such as the billing-note cheque-details strip
   * does not render on continuation pages.
   */
  extraReserveMm?: number;
  /**
   * Classic V2: repeat the full header + customer info on continuation pages
   * (workspace setting) — continuation budgets/caps shrink accordingly.
   */
  continuationFullHeader?: boolean;
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
  const templateKind = template === "modern" ? "modern" : template === "classic_v2" ? "classic_v2" : "classic";
  const capacity = kind === "summary_rows"
    ? SUMMARY_ROW_CAPACITY[templateKind === "classic_v2" ? "classic" : templateKind]
    : LINE_ITEM_CAPACITY[templateKind];
  const fullHeader = options.continuationFullHeader === true && template === "classic_v2";
  const fp = capacity.first;
  const cp = fullHeader ? (capacity.continuationFullHeader ?? capacity.continuation) : capacity.continuation;
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
      options.extraReserveMm ?? 0,
      fullHeader,
    );
  }

  return paginateRowsByCount(rows, fp, cp, lp, template === "classic_v2");
}

function paginateRowsByCount<T>(
  rows: T[],
  fp: number,
  cp: number,
  lp: number,
  packLastMinOne = false,
): GenericPageBatch<T>[] {
  if (rows.length <= fp) {
    return [{ items: rows, mode: "single", startIndex: 1 }];
  }

  const batches: GenericPageBatch<T>[] = [];

  // First page
  batches.push({ items: rows.slice(0, fp), mode: "first", startIndex: 1 });

  const remaining = rows.slice(fp);
  // Classic V2: keep only the remainder (floor 1) on the finalized page.
  const lastCount =
    packLastMinOne && remaining.length > lp ? 1 : Math.min(lp, remaining.length);
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
  fontScale: number | ClassicV2FontScales = 1,
  kind: PaginationKind = "line_items",
  extraReserveMm = 0,
  continuationFullHeader = false,
): GenericPageBatch<T>[] {
  const budgets = getRowBudgets(template, fontScale, kind, extraReserveMm, { continuationFullHeader });
  const heights = rows.map((row, i) => estimateHeight(row, i));
  const totalHeight = heights.reduce((sum, h) => sum + h, 0);

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

  // A single row is one page, period.
  if (rows.length <= 1) {
    return [{ items: rows, mode: "single", startIndex: 1 }];
  }

  // Everything fits the single-page layout (totals + signatures included)?
  if (rows.length <= fp && totalHeight <= budgets.first + HEIGHT_EPSILON) {
    return [{ items: rows, mode: "single", startIndex: 1 }];
  }

  // Multi-page: the FIRST page carries only header + info band (totals and
  // signatures are on the last page), so it packs to the larger multi-first
  // budget — but always leaves at least one row for the finalized page.
  const multiBudgets = getRowBudgets(template, fontScale, kind, extraReserveMm, { multiFirst: true });
  const multiFirstCap = (kind === "summary_rows"
    ? SUMMARY_ROW_CAPACITY[template === "modern" ? "modern" : template === "classic_v2" ? "classic_v2" : "classic"]
    : LINE_ITEM_CAPACITY[template === "modern" ? "modern" : template === "classic_v2" ? "classic_v2" : "classic"]
  ).firstMulti ?? fp;
  const batches: GenericPageBatch<T>[] = [];

  let firstCount = fitFromStart(0, multiBudgets.first, multiFirstCap);
  firstCount = Math.min(firstCount, rows.length - 1);
  batches.push({
    items: rows.slice(0, firstCount),
    mode: "first",
    startIndex: 1,
  });

  const rest = rows.length - firstCount;

  // If every remaining row fits the finalized page, put them all there
  // (fewest pages — e.g. 40 items → first(24) + last(16)). Otherwise fill
  // continuation pages sequentially in order — each as full as its budget
  // and cap allow, always leaving ≥1 row — and the finalized page takes the
  // tail together with the totals/signature block (QuickBooks/Xero-style
  // sequential fill; no thin orphan pages mid-document).
  const allOnLast = fitFromEnd(rows.length, budgets.last, Math.min(lp, rest));
  let midEnd: number;
  if (allOnLast === rest) {
    midEnd = firstCount;
  } else {
    let idx = firstCount;
    let remaining = rest;
    while (remaining > 1) {
      const take = fitFromStart(idx, budgets.continuation, Math.min(cp, remaining - 1));
      if (take <= 0) break;
      batches.push({
        items: rows.slice(idx, idx + take),
        mode: "continuation",
        startIndex: idx + 1,
      });
      idx += take;
      remaining -= take;
    }
    midEnd = idx;
  }

  batches.push({
    items: rows.slice(midEnd),
    mode: "last",
    startIndex: midEnd + 1,
  });

  // Sparse-tail merge: never ship a thin trailing continuation page when its
  // rows fit on the last page — fold it in (within the last-page budget and
  // count cap) and drop the page. Repeat: merging can expose another sparse
  // tail. Only ever reduces the page count.
  if (heights.length === rows.length) {
    for (;;) {
      if (batches.length < 2) break;
      const last = batches[batches.length - 1];
      const prev = batches[batches.length - 2];
      if (prev.mode !== "continuation" || last.mode !== "last") break;
      const lastH = last.items.reduce((s, _it, i) => s + heights[last.startIndex - 1 + i], 0);
      const prevH = prev.items.reduce((s, _it, i) => s + heights[prev.startIndex - 1 + i], 0);
      const mergedCount = last.items.length + prev.items.length;
      if (mergedCount > lp || lastH + prevH > budgets.last + HEIGHT_EPSILON) break;
      last.items = [...prev.items, ...last.items];
      last.startIndex = prev.startIndex;
      batches.splice(batches.length - 2, 1);
    }
  }

  return batches;
}

export function paginateLineItems(
  lineItems: DocumentLineItem[],
  template: "modern" | "classic" | "classic_v2",
  opts: { estimateHeight?: (item: DocumentLineItem) => number; fontScale?: number | ClassicV2FontScales; extraReserveMm?: number; continuationFullHeader?: boolean } = {},
): PageBatch[] {
  return paginateRows(lineItems, template, "line_items", {
    estimateHeight: opts.estimateHeight,
    fontScale: opts.fontScale,
    extraReserveMm: opts.extraReserveMm,
    continuationFullHeader: opts.continuationFullHeader,
  }) as PageBatch[];
}

export function getTotalPages(batches: PageBatch[]): number {
  return batches.length;
}
