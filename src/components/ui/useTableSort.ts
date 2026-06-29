import { useState, useMemo, useCallback } from "react";

export type SortDir = "asc" | "desc";

export interface SortConfig<K extends string> {
  key: K;
  dir: SortDir;
}

export interface UseTableSortResult<T, K extends keyof T> {
  sort: SortConfig<K & string>;
  handleSort: (key: K) => void;
  sorted: T[];
}

function compareValues(a: unknown, b: unknown, dir: SortDir): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "string" && typeof b === "string") {
    return dir === "asc" ? a.localeCompare(b) : b.localeCompare(a);
  }
  const aN = Number(a) || 0;
  const bN = Number(b) || 0;
  return dir === "asc" ? aN - bN : bN - aN;
}

export function useTableSort<T, K extends keyof T>(
  items: T[],
  defaults: { key: K; dir: SortDir },
): UseTableSortResult<T, K> {
  const [sort, setSort] = useState<SortConfig<K & string>>({
    key: defaults.key as K & string,
    dir: defaults.dir,
  });

  const handleSort = useCallback((key: K) => {
    setSort((prev) => {
      if (prev.key === (key as K & string)) {
        return { key: prev.key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key: key as K & string, dir: "desc" };
    });
  }, []);

  const sorted = useMemo(() => {
    const copy = [...items];
    const sortKey = sort.key as K;
    copy.sort((a, b) => compareValues(a[sortKey], b[sortKey], sort.dir));
    return copy;
  }, [items, sort]);

  return { sort, handleSort, sorted };
}
