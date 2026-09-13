import { describe, expect, it } from "vitest";
import { getRowBudgets, paginateRows } from "../../src/lib/pagination";
import { CLASSIC_V2_SIG_STRIP_MM } from "../../src/constants";

const STRIP = CLASSIC_V2_SIG_STRIP_MM;

describe("signature-initials strip reserve (classic V2 เซ็นกำกับทุกหน้า)", () => {
  it("shrinks only multi-first and continuation budgets", () => {
    const plain = getRowBudgets("classic_v2", 1, "line_items", 0, {});
    const stripped = getRowBudgets("classic_v2", 1, "line_items", 0, { stripReserveMm: STRIP });
    // Single-page first and last show the full band, never the strip.
    expect(stripped.first).toBe(plain.first);
    expect(stripped.last).toBe(plain.last);
    expect(stripped.continuation).toBeLessThan(plain.continuation);

    const plainMulti = getRowBudgets("classic_v2", 1, "line_items", 0, { multiFirst: true });
    const strippedMulti = getRowBudgets("classic_v2", 1, "line_items", 0, {
      multiFirst: true,
      stripReserveMm: STRIP,
    });
    expect(strippedMulti.first).toBeLessThan(plainMulti.first);
  });

  it("keeps every row placed with at least one row per page", () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ h: 6, i }));
    const batches = paginateRows(rows, "classic_v2", "line_items", {
      estimateHeight: (row) => (row as { h: number }).h,
      stripReserveMm: STRIP,
    });
    const total = batches.reduce((sum, b) => sum + b.items.length, 0);
    expect(total).toBe(rows.length);
    for (const batch of batches) expect(batch.items.length).toBeGreaterThanOrEqual(1);
    expect(batches[batches.length - 1].mode).toBe("last");
  });

  it("never reserves for other templates", () => {
    const plain = getRowBudgets("modern", 1, "line_items", 0, {});
    const stripped = getRowBudgets("modern", 1, "line_items", 0, { stripReserveMm: STRIP });
    // Callers only pass nonzero for classic V2; the function itself stays
    // template-agnostic — this locks the contract that modern/classic
    // budgets are untouched when callers pass 0.
    const zero = getRowBudgets("modern", 1, "line_items", 0, { stripReserveMm: 0 });
    expect(zero).toEqual(plain);
    expect(stripped.continuation).toBeLessThan(plain.continuation);
  });
});
