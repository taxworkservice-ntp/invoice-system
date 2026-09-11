import type { SupabaseClient } from "@supabase/supabase-js";

// Stale-while-revalidate cache for the deal detail page.
//
// - Home row hover calls preloadDealDetail so opening a deal often paints
//   from cache instantly.
// - The deal page applies a fresh-enough entry immediately, then revalidates
//   in the background (never shows stale data for long, never blocks on it).
// - Only RPC payloads are cached (single JSON blob per deal); the legacy
//   multi-query path bypasses the cache and still works when the
//   get_deal_detail migration hasn't been applied.

export interface CachedDealDetail {
  payload: unknown;
  fetchedAt: number;
}

const TTL_MS = 60_000;
const MAX_ENTRIES = 25;

const cache = new Map<string, CachedDealDetail>();
const inFlight = new Map<string, Promise<unknown | null>>();

function prune() {
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

export function getCachedDealDetail(dealId: string): unknown | null {
  const entry = cache.get(dealId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > TTL_MS) {
    cache.delete(dealId);
    return null;
  }
  return entry.payload;
}

export function setCachedDealDetail(dealId: string, payload: unknown) {
  cache.set(dealId, { payload, fetchedAt: Date.now() });
  prune();
}

export function invalidateDealDetail(dealId: string) {
  cache.delete(dealId);
  inFlight.delete(dealId);
}

/** Fire-and-forget warm-up for hover/touch-start on deal rows. */
export function preloadDealDetail(
  supabase: SupabaseClient,
  dealId: string,
): void {
  if (cache.has(dealId) || inFlight.has(dealId)) return;
  const pending = (async () => {
    try {
      const { data, error } = await supabase.rpc("get_deal_detail", {
        p_deal_id: dealId,
      });
      if (!error && data) setCachedDealDetail(dealId, data);
      return data ?? null;
    } catch {
      return null;
    } finally {
      inFlight.delete(dealId);
    }
  })();
  inFlight.set(dealId, pending);
}
