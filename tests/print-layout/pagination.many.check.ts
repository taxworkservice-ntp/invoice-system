/**
 * Unit check (no Supabase): print pagination with many lines (20-30) must
 * paginate into first/continuation/last batches with continuous numbering,
 * and the DN-variance sub-line must increase estimated row height.
 *
 * Run: npm run test:pagination
 */
import assert from "node:assert";
import { paginateLineItems } from "../../src/lib/pagination";
import { estimateLineItemHeight } from "../../src/lib/printRowHeight";
import type { DocumentLineItem } from "../../src/types";

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
    created_at: "2026-01-01T00:00:00Z",
  } as DocumentLineItem;
}

function estimate(template: "modern" | "classic", item: DocumentLineItem) {
  return estimateLineItemHeight(item, template, {
    hasDnVariance: true,
    hasLineDiscount: item.discount_percent > 0,
  });
}

const items = Array.from({ length: 30 }, (_, i) =>
  makeItem(i + 1, { changed: (i + 1) % 5 === 0, longNote: (i + 1) % 2 === 0 }),
);

// 1. modern coverage + continuous numbering
const modernBatches = paginateLineItems(items, "modern", {
  estimateHeight: (item) => estimate("modern", item),
});
assert.ok(modernBatches.length > 2, "modern: expected multi-page output for 30 lines");
assert.equal(modernBatches[0].mode, "first");
assert.equal(modernBatches[modernBatches.length - 1].mode, "last");
let expected = 1;
for (const batch of modernBatches) {
  assert.equal(batch.startIndex, expected, "startIndex continuity");
  expected += batch.items.length;
}
assert.equal(expected - 1, items.length, "all items paginated exactly once");

// 2. classic coverage
const classicBatches = paginateLineItems(items, "classic", {
  estimateHeight: (item) => estimate("classic", item),
});
let classicCount = 0;
for (const batch of classicBatches) classicCount += batch.items.length;
assert.equal(classicCount, items.length);
assert.equal(classicBatches[classicBatches.length - 1].mode, "last");

// 3. variance sub-line increases estimated height (flag honored)
const sample = makeItem(3);
for (const template of ["modern", "classic"] as const) {
  const withVariance = estimateLineItemHeight(sample, template, { hasDnVariance: true });
  const withoutVariance = estimateLineItemHeight(sample, template, {});
  assert.ok(
    withVariance > withoutVariance,
    `${template}: variance sub-line must add height`,
  );
}

// 4. capacity respected per mode
const caps = { first: 20, continuation: 26, last: 14 };
for (const batch of modernBatches) {
  assert.ok(batch.items.length <= caps[batch.mode], `batch ${batch.mode} within capacity`);
}

console.log("pagination.many: all assertions passed");
console.log(
  `  modern batches: ${modernBatches.map((b) => `${b.mode}(${b.items.length})`).join(" -> ")}`,
);
