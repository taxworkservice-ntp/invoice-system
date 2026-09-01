/**
 * Unit check (no Supabase): print pagination with many lines (20-30) must
 * paginate into first/continuation/last batches with continuous numbering,
 * and the DN-variance sub-line must increase estimated row height.
 *
 * Run: npm run test:pagination
 */
import assert from "node:assert";
import { paginateLineItems, getRowBudgets } from "../../src/lib/pagination";
import { estimateLineItemHeight } from "../../src/lib/printRowHeight";
import { getClassicV2FontScaleMult } from "../../src/constants";
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

// 5. classic V2 font-scale: row budgets shrink with the scale so scaled fixed
// blocks (header/info/terms/signatures) never push rows off the fixed sheet.
const scales = [
  { preset: "small (6pt)", mult: 0.8 },
  { preset: "normal (7.5pt)", mult: 1 },
  { preset: "large (9pt)", mult: 1.2 },
  { preset: "xlarge (10.5pt)", mult: 1.4 },
  { preset: "xxlarge (12pt)", mult: 1.6 },
  { preset: "xxxlarge (13pt)", mult: 13 / 7.5 },
];
const estimateClassic = (item: DocumentLineItem, mult: number) =>
  estimateLineItemHeight(item, "classic", {
    fontScale: mult,
    hasDnVariance: true,
    hasLineDiscount: item.discount_percent > 0,
  });
let prevPages: number | null = null;
for (const { preset, mult } of scales) {
  const batches = paginateLineItems(items, "classic", {
    estimateHeight: (item) => estimateClassic(item, mult),
    fontScale: mult,
  });
  const budgets = getRowBudgets("classic", mult);
  // budgets only shrink as the scale grows
  assert.ok(budgets.first <= 18 * 6.5 + 0.001, `${preset}: first budget within unscaled budget`);
  // every multi-row page's estimated content stays within its (scaled) budget;
  // single-row pages are exempt — at extreme scales one tall row exceeds the
  // budget and the paginator still places it (≥1 row per page guarantee)
  for (const batch of batches) {
    if (batch.items.length <= 1) continue;
    const sum = batch.items.reduce((acc, it) => acc + estimateClassic(it, mult), 0);
    assert.ok(
      sum <= budgets[batch.mode] + 0.5,
      `${preset}: ${batch.mode} page height ${sum.toFixed(1)}mm within budget ${budgets[batch.mode].toFixed(1)}mm`,
    );
  }
  // continuous numbering, full coverage
  let n = 1;
  for (const batch of batches) {
    assert.equal(batch.startIndex, n, `${preset}: startIndex continuity`);
    n += batch.items.length;
  }
  assert.equal(n - 1, items.length, `${preset}: all items paginated exactly once`);
  // growing the scale shrinks budgets + grows rows → page count never drops
  if (prevPages !== null) {
    assert.ok(batches.length >= prevPages, `${preset}: page count ${batches.length} >= ${prevPages} at smaller scale`);
  }
  prevPages = batches.length;
  console.log(`  classic_v2 ${preset} (${mult}x): ${batches.map((b) => `${b.mode}(${b.items.length})`).join(" -> ")}`);
}
{
  const at1 = paginateLineItems(items, "classic", {
    estimateHeight: (item) => estimateClassic(item, 1),
    fontScale: 1,
  });
  const atMax = paginateLineItems(items, "classic", {
    estimateHeight: (item) => estimateClassic(item, 1.44),
    fontScale: 1.44,
  });
  assert.ok(atMax.length > at1.length, "xxlarge must produce more pages than normal for many-line docs");
}

// 6. per-section scales: section-aware budgets
{
  // items-only scale paginates with item-scaled rows, other sections at 1x
  const mixed = { header: 1, items: 1.44, totals: 1, footer: 1 };
  const batches = paginateLineItems(items, "classic", {
    estimateHeight: (item) => estimateClassic(item, 1.44),
    fontScale: mixed,
  });
  const budgets = getRowBudgets("classic", mixed);
  for (const batch of batches) {
    const sum = batch.items.reduce((acc, it) => acc + estimateClassic(it, 1.44), 0);
    assert.ok(
      sum <= budgets[batch.mode] + 0.5,
      `items-1.44: ${batch.mode} page height ${sum.toFixed(1)}mm within budget ${budgets[batch.mode].toFixed(1)}mm`,
    );
  }
  let n = 1;
  for (const batch of batches) {
    assert.equal(batch.startIndex, n, "items-1.44: startIndex continuity");
    n += batch.items.length;
  }
  assert.equal(n - 1, items.length, "items-1.44: full coverage");
  // header-only growth reserves space on the first page but not on
  // continuation pages (no full header there)
  const headerOnly = getRowBudgets("classic", { header: 1.44, items: 1, totals: 1, footer: 1 });
  const unscaled = getRowBudgets("classic", 1);
  assert.ok(headerOnly.first < unscaled.first, "header scale must shrink first-page budget");
  assert.equal(headerOnly.continuation, unscaled.continuation, "continuation pages carry no full header");
  // uniform 1.44 via sections matches the scalar form
  const uniform = getRowBudgets("classic", { header: 1.44, items: 1.44, totals: 1.44, footer: 1.44 });
  const scalar = getRowBudgets("classic", 1.44);
  for (const mode of ["first", "continuation", "last"] as const) {
    assert.ok(Math.abs(uniform[mode] - scalar[mode]) < 0.001, `uniform section scales match scalar (${mode})`);
  }
  console.log(`  classic_v2 items-1.44: ${batches.map((b) => `${b.mode}(${b.items.length})`).join(" -> ")}`);
}

// 6b. numeric columns scale independently of the description column
{
  const estimateMixed = (item: DocumentLineItem, desc: number, num: number) =>
    estimateLineItemHeight(item, "classic", {
      fontScale: desc,
      numScale: num,
      hasDnVariance: true,
    });
  const simpleItems = Array.from({ length: 20 }, (_, i) => {
    const base = makeItem(i + 1);
    return { ...base, item_name: `Item ${i + 1}`, line_note: null, source_document_id: null, source_line_item_id: null, source_delivered_qty: null, source_unit_price: null };
  });
  // numbers smaller than description: row height identical to desc-only rows
  const descOnly = estimateMixed(simpleItems[0], 1.44, 1.44);
  const descBigNumSmall = estimateMixed(simpleItems[0], 1.44, 1.0);
  assert.equal(descBigNumSmall, descOnly, "num <= desc must not change row height");
  // numbers bigger than description: single number line grows the row
  // (first line at num scale + variance sub-line at desc scale + safety)
  const descSmallNumBig = estimateMixed(simpleItems[0], 1.0, 1.65);
  const oneLineAt1 = estimateLineItemHeight(simpleItems[0], "classic", {});
  const expectedBig = 3.1 + 3.4 * 1.65 + 3.4 * 1.0 + 0.8;
  assert.ok(
    descSmallNumBig > oneLineAt1 && Math.abs(descSmallNumBig - expectedBig) < 0.01,
    `num > desc grows the row to the numeric line height (${descSmallNumBig.toFixed(2)} vs ${expectedBig.toFixed(2)})`,
  );
  // paginates with mixed scales and respects budgets
  const batches = paginateLineItems(simpleItems, "classic", {
    estimateHeight: (item) => estimateMixed(item, 1.65, 1.0),
    fontScale: { header: 1, items: 1.65, num: 1.0, thead: 1, totals: 1, footer: 1 },
  });
  const budgets = getRowBudgets("classic", { header: 1, items: 1.65, num: 1.0, thead: 1, totals: 1, footer: 1 });
  for (const batch of batches) {
    if (batch.items.length <= 1) continue;
    const sum = batch.items.reduce((acc, it) => acc + estimateMixed(it, 1.65, 1.0), 0);
    assert.ok(sum <= budgets[batch.mode] + 0.5, `mixed: ${batch.mode} within budget`);
  }
  console.log(`  classic_v2 desc1.65/num1.0: ${batches.map((b) => `${b.mode}(${b.items.length})`).join(" -> ")}`);
}

// 7. classic_v2 distribution: first page maximal, continuation pages packed,
// finalized page keeps only the remainder (floor 1 item)
{
  const makeSimple = (n: number): DocumentLineItem => ({
    ...makeItem(n),
    item_name: `Item ${n}`,
    line_note: null,
    source_document_id: null,
    source_line_item_id: null,
    source_delivered_qty: null,
    source_unit_price: null,
  });
  const estimateSimple = (item: DocumentLineItem) =>
    estimateLineItemHeight(item, "classic_v2", {});
  // rest > last-capacity → last page must hold exactly 1 item
  const forty = Array.from({ length: 40 }, (_, i) => makeSimple(i + 1));
  const manyBatches = paginateLineItems(forty, "classic_v2", {
    estimateHeight: estimateSimple,
  });
  const lastBatch = manyBatches[manyBatches.length - 1];
  assert.equal(lastBatch.mode, "last");
  assert.equal(lastBatch.items.length, 1, "classic_v2: finalized page keeps only 1 item when rest > last capacity");
  // rest within last capacity → all remaining rows stay on the last page
  const someBatches = paginateLineItems(
    Array.from({ length: 25 }, (_, i) => makeSimple(i + 1)),
    "classic_v2",
    { estimateHeight: estimateSimple },
  );
  const someLast = someBatches[someBatches.length - 1];
  assert.equal(someLast.mode, "last");
  assert.ok(someLast.items.length > 1, "classic_v2: remainder within capacity stays on the last page");
  // coverage + continuity for both runs
  for (const batches of [manyBatches, someBatches]) {
    let n = 1;
    for (const batch of batches) {
      assert.equal(batch.startIndex, n, "classic_v2 distribution: startIndex continuity");
      n += batch.items.length;
      assert.ok(batch.items.length > 0, "classic_v2: no empty batches");
    }
    assert.equal(n - 1, batches === manyBatches ? 40 : 25, "classic_v2 distribution: full coverage");
  }
  console.log(
    `  classic_v2 distribution (40): ${manyBatches.map((b) => `${b.mode}(${b.items.length})`).join(" -> ")}`,
  );
  console.log(
    `  classic_v2 distribution (25): ${someBatches.map((b) => `${b.mode}(${b.items.length})`).join(" -> ")}`,
  );
}

console.log("pagination.many: all assertions passed");
console.log(
  `  modern batches: ${modernBatches.map((b) => `${b.mode}(${b.items.length})`).join(" -> ")}`,
);

// 8. pt-based custom sizes: parsing, clamping, preset ladder
{
  assert.equal(getClassicV2FontScaleMult("pt:9"), 1.2, "pt:9 = 9pt / 7.5pt base");
  assert.equal(getClassicV2FontScaleMult("normal"), 1, "preset passthrough");
  assert.equal(getClassicV2FontScaleMult("pt:6"), 0.8, "min clamp = 6pt");
  assert.equal(getClassicV2FontScaleMult("pt:99"), 1.8, "max clamp = 13.5pt");
  assert.equal(getClassicV2FontScaleMult("pt:garbage"), 1, "invalid pt falls back to ปกติ");
  assert.equal(getClassicV2FontScaleMult("xxxlarge"), 13 / 7.5, "xxxlarge = 13pt top rung");
  // a custom pt value paginates end-to-end
  const customBatches = paginateLineItems(items, "classic", {
    estimateHeight: (item) => estimateLineItemHeight(item, "classic", { fontScale: getClassicV2FontScaleMult("pt:9") }),
    fontScale: getClassicV2FontScaleMult("pt:9"),
  });
  assert.ok(customBatches.length >= 2, "custom pt:9 paginates many-line docs");
  // the 13pt top rung paginates within budgets (≥1 row floor keeps pages valid)
  const maxBatches = paginateLineItems(items, "classic", {
    estimateHeight: (item) => estimateLineItemHeight(item, "classic", { fontScale: getClassicV2FontScaleMult("xxxlarge") }),
    fontScale: getClassicV2FontScaleMult("xxxlarge"),
  });
  assert.ok(maxBatches.length > 2, "13pt paginates many-line docs into multiple pages");
  console.log(`  custom pt:9: ${customBatches.map((b) => `${b.mode}(${b.items.length})`).join(" -> ")}`);
  console.log(`  preset 13pt: ${maxBatches.map((b) => `${b.mode}(${b.items.length})`).join(" -> ")}`);
}
