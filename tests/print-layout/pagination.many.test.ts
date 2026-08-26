import { describe, expect, it } from "vitest";
import { paginateLineItems } from "../../src/lib/pagination";
import { estimateLineItemHeight } from "../../src/lib/printRowHeight";
import type { DocumentLineItem } from "../../src/types";

const now = "2026-01-01T00:00:00Z";

function makeItem(n: number, opts: { changed?: boolean; longNote?: boolean } = {}): DocumentLineItem {
  const qty = opts.changed ? 1 : 3;
  return {
    id: `line-${n}`,
    document_id: "doc",
    user_id: "user",
    item_id: null,
    item_name: opts.longNote
      ? `Industrial packaging solution with extended specification line ${n}`
      : `Item ${n}`,
    line_note: opts.longNote ? "Batch note line one\nBatch note line two" : null,
    item_sku: null,
    item_type: "product",
    unit: "ชิ้น",
    unit_price: 100 + n,
    quantity: qty,
    base_quantity: qty,
    discount_percent: 0,
    discount_amount: 0,
    qty_carton: null,
    carton_unit: null,
    source_document_id: "dn-1",
    source_line_item_id: `dn-line-${n}`,
    source_delivered_qty: opts.changed ? qty + 1 : qty,
    source_unit_price: 100 + n,
    line_total: qty * (100 + n),
    sort_order: n,
    created_at: now,
  };
}

function estimate(template: "modern" | "classic", item: DocumentLineItem) {
  return estimateLineItemHeight(item, template, {
    hasDnVariance: true,
    hasLineDiscount: item.discount_percent > 0,
  });
}

describe("print pagination with many lines (20-30)", () => {
  const items = Array.from({ length: 30 }, (_, i) =>
    makeItem(i + 1, { changed: (i + 1) % 5 === 0, longNote: (i + 1) % 2 === 0 }),
  );

  it("modern: 30 lines paginate into first + continuation + last with continuous numbering", () => {
    const batches = paginateLineItems(items, "modern", {
      estimateHeight: (item) => estimate("modern", item),
    });
    expect(batches.length).toBeGreaterThan(2);
    expect(batches[0].mode).toBe("first");
    expect(batches[batches.length - 1].mode).toBe("last");

    // numbering is continuous and covers every item exactly once
    let expected = 1;
    for (const batch of batches) {
      expect(batch.startIndex).toBe(expected);
      expected += batch.items.length;
    }
    expect(expected - 1).toBe(items.length);
  });

  it("classic: same coverage", () => {
    const batches = paginateLineItems(items, "classic", {
      estimateHeight: (item) => estimate("classic", item),
    });
    let expected = 1;
    for (const batch of batches) expected += batch.items.length;
    expect(expected - 1).toBe(items.length);
    expect(batches[batches.length - 1].mode).toBe("last");
  });

  it("variance sub-line increases estimated height (no clipping)", () => {
    const plain = makeItem(1);
    const changed = makeItem(2, { changed: true });
    expect(estimate("modern", changed)).toBeGreaterThan(estimate("modern", plain));
    expect(estimate("classic", changed)).toBeGreaterThan(estimate("classic", plain));
  });

  it("every batch respects its count capacity even with tall rows", () => {
    const batches = paginateLineItems(items, "modern", {
      estimateHeight: (item) => estimate("modern", item),
    });
    const caps = { first: 20, continuation: 26, last: 14 };
    for (const batch of batches) {
      const cap = caps[batch.mode];
      expect(batch.items.length).toBeLessThanOrEqual(cap);
    }
  });
});
