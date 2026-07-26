import type { DocumentLineItem } from "../types";

export type PageMode = "single" | "first" | "continuation" | "last";

export interface PageBatch {
  items: DocumentLineItem[];
  mode: PageMode;
  startIndex: number; // 1-based item number for the first item in this batch
}

const MODERN_FIRST_PAGE_ITEMS = 20;
const MODERN_CONTINUATION_ITEMS = 26;
const MODERN_LAST_PAGE_ITEMS = 14;

const CLASSIC_FIRST_PAGE_ITEMS = 18;
const CLASSIC_CONTINUATION_ITEMS = 22;
const CLASSIC_LAST_PAGE_ITEMS = 12;

/**
 * Split line items into page batches.
 * Distributions are even across continuation pages — no sparse almost-empty pages.
 */
export function paginateLineItems(
  lineItems: DocumentLineItem[],
  template: "modern" | "classic" | "classic_v2",
): PageBatch[] {
  const fp = template === "modern" ? MODERN_FIRST_PAGE_ITEMS : CLASSIC_FIRST_PAGE_ITEMS;
  const cp = template === "modern" ? MODERN_CONTINUATION_ITEMS : CLASSIC_CONTINUATION_ITEMS;
  const lp = template === "modern" ? MODERN_LAST_PAGE_ITEMS : CLASSIC_LAST_PAGE_ITEMS;

  if (lineItems.length <= fp) {
    return [{ items: lineItems, mode: "single", startIndex: 1 }];
  }

  const batches: PageBatch[] = [];

  // First page
  batches.push({ items: lineItems.slice(0, fp), mode: "first", startIndex: 1 });

  const remaining = lineItems.slice(fp);
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

export function getTotalPages(batches: PageBatch[]): number {
  return batches.length;
}
