import type { DocumentLineItem } from "../types";

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

export interface GenericPageBatch<T> {
  items: T[];
  mode: PageMode;
  startIndex: number;
}

/**
 * Split line items into page batches.
 * Distributions are even across continuation pages — no sparse almost-empty pages.
 */
export function paginateRows<T>(
  rows: T[],
  template: "modern" | "classic" | "classic_v2",
  kind: PaginationKind = "line_items",
): GenericPageBatch<T>[] {
  const templateKind = template === "modern" ? "modern" : "classic";
  const capacity = kind === "summary_rows"
    ? SUMMARY_ROW_CAPACITY[templateKind]
    : LINE_ITEM_CAPACITY[templateKind];
  const fp = capacity.first;
  const cp = capacity.continuation;
  const lp = capacity.last;

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

export function paginateLineItems(
  lineItems: DocumentLineItem[],
  template: "modern" | "classic" | "classic_v2",
): PageBatch[] {
  return paginateRows(lineItems, template) as PageBatch[];
}

export function getTotalPages(batches: PageBatch[]): number {
  return batches.length;
}
