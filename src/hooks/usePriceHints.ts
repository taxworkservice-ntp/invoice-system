import { useEffect, useRef, useState } from "react";
import { fetchPriceHistory } from "../lib/priceHistory";

/** Last price this line's catalog item sold for, and to whom. */
export interface PriceHint {
  price: number;
  date: string;
  customerName: string | null;
  /** `customer` = sold to the selected customer before; `all` = anyone. */
  scope: "customer" | "all";
}

interface UsePriceHintsOptions {
  userId: string | undefined;
  /** Restricts the first lookup to this customer; falls back to anyone. */
  customerId: string | null;
  /** Catalog item ids present on the form (duplicates are fine). */
  itemIds: (string | null | undefined)[];
  /** Draft being edited — its own rows are skipped. */
  excludeDocumentId?: string | null;
  /** Set false for forms with no line items, to skip all fetching. */
  enabled?: boolean;
}

/**
 * "เคยขาย…" last-price hints: for every catalog line, the newest price-history
 * row — this customer first, else anyone. One fetch per item+customer key, and
 * the requested set survives re-renders so typing/picking never spams the API.
 *
 * Shared by the deal form and the delivery-note-from-quotation form so both
 * show the same hint. Look a hint up with `priceHintKey(itemId, customerId)`.
 */
export function usePriceHints({
  userId,
  customerId,
  itemIds,
  excludeDocumentId = null,
  enabled = true,
}: UsePriceHintsOptions): Record<string, PriceHint | null> {
  const [hints, setHints] = useState<Record<string, PriceHint | null>>({});
  const requested = useRef<Set<string>>(new Set());

  // A stable key for the id set: `itemIds` is a fresh array on every render, so
  // depending on it directly re-ran this effect constantly — and each re-run's
  // cleanup cancelled the fetch the previous run had started, while the
  // `requested` guard then refused to start another. The hint appeared or not
  // depending on whether the first fetch happened to land before the next
  // render.
  const itemIdKey = [...new Set(itemIds.filter((id): id is string => !!id))].join("|");

  useEffect(() => {
    if (!userId || !enabled || !itemIdKey) return;
    const custKey = customerId ?? "-";
    const missing = itemIdKey
      .split("|")
      .filter((id) => !requested.current.has(`${id}|${custKey}`));
    if (missing.length === 0) return;
    missing.forEach((id) => requested.current.add(`${id}|${custKey}`));

    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        missing.map(async (id) => {
          const key = `${id}|${custKey}`;
          try {
            if (customerId) {
              const customerRows = await fetchPriceHistory(userId, id, {
                customerId,
                limit: 1,
                excludeDocumentId,
              });
              if (customerRows.length > 0) {
                const row = customerRows[0];
                return [
                  key,
                  {
                    price: row.unitPrice,
                    date: row.issueDate || row.createdAt,
                    customerName: row.customerName,
                    scope: "customer",
                  },
                ] as const;
              }
            }
            const allRows = await fetchPriceHistory(userId, id, { limit: 1, excludeDocumentId });
            if (allRows.length === 0) return [key, null] as const;
            const row = allRows[0];
            return [
              key,
              {
                price: row.unitPrice,
                date: row.issueDate || row.createdAt,
                customerName: row.customerName,
                scope: "all",
              },
            ] as const;
          } catch {
            // Silent fail = no hint; the history sheet still retries on open.
            return [key, null] as const;
          }
        }),
      );
      if (cancelled) return;
      setHints((prev) => {
        const next = { ...prev };
        for (const [k, v] of entries) next[k] = v;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, customerId, itemIdKey, excludeDocumentId, enabled]);

  return hints;
}

/** Hint-map key for a line — mirrors the hook's internal key. */
export function priceHintKey(
  itemId: string | null | undefined,
  customerId: string | null | undefined,
): string | null {
  return itemId ? `${itemId}|${customerId ?? "-"}` : null;
}
