import { apiFetch } from "./api";

// Tier-1 PDF pre-warm: after a document is finalized, render its PDF in the
// background so the later download is a cache hit. Called fire-and-forget
// next to success toasts, before navigate() — warming runs while the user
// reads the success state.
//
// Professional guarantees (do not weaken these):
// - Silent by contract: never throws, never toasts, never blocks. A failed
//   warm degrades to today's behavior (one slow download, then cached).
// - Deduped: save-then-navigate flows would otherwise render the same doc
//   twice. In-flight + recently-warmed guards make repeats no-ops.
// - Scoped: finalized single-copy "original" only — the variant both the
//   single button and bulk ZIP request. Drafts and 2-copy combos stay lazy.

const WARM_TTL_MS = 5 * 60 * 1000;
const MAX_TRACKED = 500;

const warmedAt = new Map<string, number>();
const inFlight = new Set<string>();

function pruneWarmed(now: number) {
  if (warmedAt.size <= MAX_TRACKED) return;
  const cutoff = now - WARM_TTL_MS;
  for (const [id, at] of warmedAt) {
    if (at <= cutoff) warmedAt.delete(id);
    if (warmedAt.size <= MAX_TRACKED) break;
  }
  if (warmedAt.size > MAX_TRACKED) warmedAt.clear();
}

export function warmPdfCache(documentId: string | null | undefined): void {
  if (!documentId || typeof documentId !== "string") return;
  const now = Date.now();
  if (inFlight.has(documentId)) return;
  const last = warmedAt.get(documentId);
  if (last !== undefined && now - last < WARM_TTL_MS) return;

  inFlight.add(documentId);
  void (async () => {
    try {
      // warm:true asks the server to render + backfill the cache and reply
      // with JSON instead of shipping PDF bytes back to a caller that will
      // discard them.
      await apiFetch<{ success: boolean; cached: boolean }>(
        `/api/documents/${encodeURIComponent(documentId)}/pdf`,
        {
          method: "POST",
          body: JSON.stringify({ copyTypes: ["original"], warm: true }),
        },
      );
      pruneWarmed(Date.now());
      warmedAt.set(documentId, Date.now());
    } catch {
      // Silent: a failed warm only costs one slow download later.
    } finally {
      inFlight.delete(documentId);
    }
  })();
}
