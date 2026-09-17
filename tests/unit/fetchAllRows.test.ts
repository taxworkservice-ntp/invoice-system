import { describe, expect, it, vi } from "vitest";
import { fetchAllRows } from "../../src/lib/fetchAllRows";

/**
 * Pagination guard. Supabase caps a response at 1000 rows, so an unpaged select
 * silently truncates and quietly corrupts any total built from it.
 */

function makeSource(total: number) {
  return vi.fn(async (from: number, to: number) => ({
    data: Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => ({
      n: from + i,
    })),
    error: null,
  }));
}

describe("fetchAllRows", () => {
  it("pages until a short batch and keeps every row in order", async () => {
    const source = makeSource(2500);
    const rows = await fetchAllRows(source, 1000);

    expect(rows).toHaveLength(2500);
    expect(rows[0]).toEqual({ n: 0 });
    expect(rows[2499]).toEqual({ n: 2499 });
    expect(source).toHaveBeenCalledTimes(3);
    expect(source).toHaveBeenLastCalledWith(2000, 2999);
  });

  it("stops after an exact multiple of the page size", async () => {
    // 2000 rows must still terminate, so the loop needs the extra empty page.
    const source = makeSource(2000);
    const rows = await fetchAllRows(source, 1000);

    expect(rows).toHaveLength(2000);
    expect(source).toHaveBeenCalledTimes(3);
  });

  it("still pages when the total is exactly one page", async () => {
    const source = makeSource(1000);
    const rows = await fetchAllRows(source, 1000);

    expect(rows).toHaveLength(1000);
    expect(source).toHaveBeenCalledTimes(2);
  });

  it("handles an empty result", async () => {
    const source = makeSource(0);
    await expect(fetchAllRows(source, 1000)).resolves.toEqual([]);
  });

  it("propagates an error instead of returning a partial set", async () => {
    const source = vi.fn(async (from: number) =>
      from === 0 ? { data: [{ n: 0 }], error: null } : { data: null, error: { message: "boom" } },
    );
    await expect(fetchAllRows(source, 1)).rejects.toThrow("boom");
  });
});
