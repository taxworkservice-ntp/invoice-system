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
 * Returns an array where each element is the subset of line items for that page
 * along with the page mode.
 */
export function paginateLineItems(
  lineItems: DocumentLineItem[],
  template: "modern" | "classic",
): PageBatch[] {
  const fp = template === "modern" ? MODERN_FIRST_PAGE_ITEMS : CLASSIC_FIRST_PAGE_ITEMS;
  const cp = template === "modern" ? MODERN_CONTINUATION_ITEMS : CLASSIC_CONTINUATION_ITEMS;
  const lp = template === "modern" ? MODERN_LAST_PAGE_ITEMS : CLASSIC_LAST_PAGE_ITEMS;

  if (lineItems.length <= fp) {
    return [{ items: lineItems, mode: "single", startIndex: 1 }];
  }

  const batches: PageBatch[] = [];
  let remaining = [...lineItems];
  let index = 1;

  // First page
  batches.push({
    items: remaining.slice(0, fp),
    mode: "first",
    startIndex: index,
  });
  index += fp;
  remaining = remaining.slice(fp);

  // If the remaining fits on one last page, don't create unnecessary continuation pages
  if (remaining.length <= lp + cp) {
    // Try to fit as much as possible on continuation, rest on last
    const contItems = Math.max(0, remaining.length - lp);
    if (contItems > 0) {
      batches.push({
        items: remaining.slice(0, contItems),
        mode: "continuation",
        startIndex: index,
      });
      index += contItems;
      remaining = remaining.slice(contItems);
    }
    if (remaining.length > 0) {
      batches.push({
        items: remaining,
        mode: "last",
        startIndex: index,
      });
    }
  } else {
    while (remaining.length > lp + cp) {
      batches.push({
        items: remaining.slice(0, cp),
        mode: "continuation",
        startIndex: index,
      });
      index += cp;
      remaining = remaining.slice(cp);
    }
    const contItems = Math.max(0, remaining.length - lp);
    if (contItems > 0) {
      batches.push({
        items: remaining.slice(0, contItems),
        mode: "continuation",
        startIndex: index,
      });
      index += contItems;
      remaining = remaining.slice(contItems);
    }
    if (remaining.length > 0) {
      batches.push({
        items: remaining,
        mode: "last",
        startIndex: index,
      });
    }
  }

  return batches;
}

export function getTotalPages(batches: PageBatch[]): number {
  return batches.length;
}
