/**
 * Paginated PostgREST reads.
 *
 * Supabase caps a response at 1000 rows by default, so an unbounded `select`
 * silently truncates — which quietly corrupts totals (deals list, cumulative
 * AR, stock movements). Anything that aggregates must page instead.
 */

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Fetch every row of a query by paging with `range`.
 *
 * The caller's query must have a stable `order` — without one, pages can
 * overlap or skip rows as the server is free to return them in any order.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = data || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}
