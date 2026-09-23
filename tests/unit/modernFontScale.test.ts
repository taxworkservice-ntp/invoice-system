import { describe, it, expect } from "vitest";
import { estimateLineItemHeight, getBaseRowMm } from "../../src/lib/printRowHeight";
import { getRowBudgets, paginateRows } from "../../src/lib/pagination";
import type { DocumentLineItem } from "../../src/types";

const item = {
  item_name: "ปูนซีเมนต์ออลพัรโพส",
  unit: "ถุง",
  unit_price: 100,
  quantity: 1,
  line_total: 100,
  discount_amount: 0,
  discount_percent: 0,
} as unknown as DocumentLineItem;

const fullScales = (s: number) => ({
  header: s,
  items: s,
  num: s,
  thead: s,
  totals: s,
  footer: s,
});

describe("modern font scale", () => {
  it("scales the modern base row with the items scale", () => {
    expect(getBaseRowMm("modern", 1)).toBeCloseTo(6.9, 5);
    expect(getBaseRowMm("modern", 1.6)).toBeGreaterThan(getBaseRowMm("modern", 1));
    // Padding stays fixed; only the 3.7mm text line grows.
    expect(getBaseRowMm("modern", 2) - getBaseRowMm("modern", 1)).toBeCloseTo(3.7, 1);
  });

  it("estimateLineItemHeight honours fontScale for modern", () => {
    const base = estimateLineItemHeight(item, "modern", {});
    const big = estimateLineItemHeight(item, "modern", { fontScale: 1.6 });
    expect(big).toBeGreaterThan(base);
  });

  it("shrinks modern row budgets as the fixed blocks scale", () => {
    const plain = getRowBudgets("modern", 1, "line_items", 0, {});
    const scaled = getRowBudgets("modern", fullScales(1.6), "line_items", 0, {});
    expect(scaled.first).toBeLessThan(plain.first);
    expect(scaled.continuation).toBeLessThan(plain.continuation);
    expect(scaled.last).toBeLessThan(plain.last);
  });

  it("breaks a long modern list into at least as many pages at a larger scale", () => {
    const rows = Array.from(
      { length: 40 },
      (_, i) => ({ ...item, item_name: `รายการ ${i}` }) as DocumentLineItem,
    );
    const estimate = (scale: number) => (r: DocumentLineItem) =>
      estimateLineItemHeight(r, "modern", { fontScale: scale, numScale: scale });
    const base = paginateRows(rows, "modern", "line_items", {
      estimateHeight: estimate(1),
      fontScale: 1,
    });
    const big = paginateRows(rows, "modern", "line_items", {
      estimateHeight: estimate(1.6),
      fontScale: 1.6,
    });
    expect(big.length).toBeGreaterThanOrEqual(base.length);
    expect(big.reduce((n, b) => n + b.items.length, 0)).toBe(40);
    expect(base.reduce((n, b) => n + b.items.length, 0)).toBe(40);
  });
});
